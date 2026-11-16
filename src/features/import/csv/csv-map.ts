/**
 * From CSV records to the import function's rows (R-IMPORT-082): the user maps the file's
 * columns, chooses the date format (detected only when one format alone reads every date)
 * and says what the amounts mean. Amounts become integer rappen by string handling and the
 * shared money parser, never by floating-point arithmetic (C-MONEY-001); dates stay calendar
 * strings (C-DATE-001). A row that cannot be read is listed with its line and why, and not
 * sent.
 */
import {
  MAX_BANK_TRANSACTION_ID_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_MERCHANT_LENGTH,
  MAX_ROW_AMOUNT,
  type ImportRow,
} from '@/features/import/statements/import-rows'
import { parseMoney } from '@/lib/money'

import type { CsvRecord } from './csv-parse'

export const DATE_FORMATS = [
  'dd.mm.yyyy',
  'dd.mm.yy',
  'mm.dd.yyyy',
  'dd/mm/yyyy',
  'mm/dd/yyyy',
  'yyyy-mm-dd',
  'dd-mm-yyyy',
] as const
export type DateFormat = (typeof DATE_FORMATS)[number]

export type DecimalMark = '.' | ','

export interface CsvMapping {
  hasHeader: boolean
  /** Column indexes (from 0); null: not mapped. */
  date: number | null
  dateFormat: DateFormat | null
  amountMode: 'signed' | 'split'
  /** One signed column. */
  amount: number | null
  /** What a negative amount is: money out (a debit) or money in. */
  negativeMeans: 'debit' | 'credit'
  /** Two columns: money out and money in. */
  debit: number | null
  credit: number | null
  /** The decimal mark; null until the amounts settle it or the member chooses (never assumed). */
  decimal: DecimalMark | null
  description: number | null
  merchant: number | null
  bankId: number | null
}

export type CsvProblem =
  | 'too-few-cells'
  | 'date-missing'
  | 'date-unreadable'
  | 'amount-missing'
  | 'amount-unreadable'
  | 'amount-too-precise'
  | 'amount-zero'
  | 'amount-both'
  | 'amount-too-large'

export type CsvAdjustment = 'description-truncated' | 'merchant-truncated' | 'bank-id-dropped'

export interface MappedCsv {
  rows: { line: number; row: ImportRow; adjustments: CsvAdjustment[] }[]
  problems: { line: number; problem: CsvProblem }[]
}

// --- Dates -----------------------------------------------------------------------------------

const DATE_PATTERNS: Record<
  DateFormat,
  { pattern: RegExp; order: ['d' | 'm' | 'y', 'd' | 'm' | 'y', 'd' | 'm' | 'y'] }
> = {
  'dd.mm.yyyy': { pattern: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, order: ['d', 'm', 'y'] },
  'dd.mm.yy': { pattern: /^(\d{1,2})\.(\d{1,2})\.(\d{2})$/, order: ['d', 'm', 'y'] },
  'mm.dd.yyyy': { pattern: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, order: ['m', 'd', 'y'] },
  'dd/mm/yyyy': { pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: ['d', 'm', 'y'] },
  'mm/dd/yyyy': { pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: ['m', 'd', 'y'] },
  'yyyy-mm-dd': { pattern: /^(\d{4})-(\d{1,2})-(\d{1,2})$/, order: ['y', 'm', 'd'] },
  'dd-mm-yyyy': { pattern: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, order: ['d', 'm', 'y'] },
}

const pad = (value: number, length = 2) => String(value).padStart(length, '0')

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false
  const days = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ]
  return day <= (days[month - 1] ?? 0)
}

/** A date cell in this format as a calendar date "YYYY-MM-DD", or null. A time after it is ignored. */
export function parseCsvDate(text: string, format: DateFormat): string | null {
  // "03.04.2026 14:05" or "2026-04-03T00:00:00": the date part only.
  const value = text.trim().split(/[\sT]/)[0] ?? ''
  const { pattern, order } = DATE_PATTERNS[format]
  const match = pattern.exec(value)
  if (!match) return null
  const parts: Record<'d' | 'm' | 'y', number> = { d: 0, m: 0, y: 0 }
  order.forEach((part, index) => {
    parts[part] = Number(match[index + 1])
  })
  const year = format === 'dd.mm.yy' ? 2000 + parts.y : parts.y
  if (!isRealDate(year, parts.m, parts.d)) return null
  return `${pad(year, 4)}-${pad(parts.m)}-${pad(parts.d)}`
}

/**
 * The formats that read every non-empty value. Exactly one: that format. Several (03.04.2026
 * could be either): the user must choose; never decided silently.
 */
export function dateFormatsFor(values: readonly string[]): DateFormat[] {
  // A value no format reads (a stray line) is listed as unreadable later; it decides nothing.
  const filled = values
    .map((value) => value.trim())
    .filter((value) => DATE_FORMATS.some((format) => parseCsvDate(value, format) !== null))
  if (filled.length === 0) return []
  return DATE_FORMATS.filter((format) => filled.every((value) => parseCsvDate(value, format)))
}

// --- Amounts ---------------------------------------------------------------------------------

type AmountRead =
  { ok: true; rappen: number } | { ok: false; problem: 'amount-unreadable' | 'amount-too-precise' }

/**
 * A signed amount cell as integer rappen. Accepts "CHF", a leading or trailing sign, brackets
 * for a negative, and thousands grouped with an apostrophe, a space or the other mark
 * (1'234.50, 1 234,50, 1.234,50, 1,234.50). More than two decimals that are not zeros is
 * refused, never rounded.
 */
export function parseCsvAmount(text: string, decimal: DecimalMark): AmountRead {
  let value = text
    .replace(/[\s\u00a0\u202f'’ʼ]/g, '')
    .replace(/^chf/i, '')
    .replace(/chf$/i, '')
  let negative = false
  if (/^\(.*\)$/.test(value)) {
    negative = true
    value = value.slice(1, -1)
  }
  if (value.startsWith('-') || value.startsWith('+') || value.startsWith('−')) {
    negative = negative !== (value[0] !== '+')
    value = value.slice(1)
  } else if (value.endsWith('-') || value.endsWith('−')) {
    negative = !negative
    value = value.slice(0, -1)
  }
  const group = decimal === ',' ? '.' : ','
  if (value.includes(group)) {
    // The other mark groups thousands only in groups of three before the decimals.
    const grouped = new RegExp(`^\\d{1,3}(\\${group}\\d{3})+(\\${decimal}\\d+)?$`)
    if (!grouped.test(value)) return { ok: false, problem: 'amount-unreadable' }
    value = value.split(group).join('')
  }
  const parts = value.split(decimal)
  if (parts.length > 2) return { ok: false, problem: 'amount-unreadable' }
  const [whole = '', fraction = ''] = parts
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(fraction) || (whole === '' && fraction === '')) {
    return { ok: false, problem: 'amount-unreadable' }
  }
  if (fraction.length > 2 && !/^0+$/.test(fraction.slice(2))) {
    return { ok: false, problem: 'amount-too-precise' }
  }
  const rappen = parseMoney(`${whole === '' ? '0' : whole}.${fraction.slice(0, 2)}`)
  if (rappen === null) return { ok: false, problem: 'amount-unreadable' }
  return { ok: true, rappen: negative ? -rappen : rappen }
}

/** What one amount cell says about the decimal mark. */
export type DecimalSays = DecimalMark | 'either' | 'ambiguous' | 'unreadable'

/** The cell without spaces, apostrophes, "CHF", a sign or brackets: digits and marks only. */
function amountBody(text: string): string {
  let value = text
    .replace(/[\s  '’ʼ]/g, '')
    .replace(/^chf/i, '')
    .replace(/chf$/i, '')
  if (/^\(.*\)$/.test(value)) value = value.slice(1, -1)
  return value.replace(/^[-+−]/, '').replace(/[-−]$/, '')
}

/**
 * What a cell says about the decimal mark: a point or a comma when it can only be read one way
 * (12.50, 1,234.50, 1.234.567); "either" when it reads the same both ways (-350, 1'234);
 * "ambiguous" when its only mark is followed by exactly three digits (1.200 is 1'200 or 1.20).
 */
export function decimalSays(text: string): DecimalSays {
  const value = amountBody(text)
  if (!/^[\d.,]+$/.test(value) || !/\d/.test(value)) return 'unreadable'
  const points = value.split('.').length - 1
  const commas = value.split(',').length - 1
  if (points === 0 && commas === 0) return 'either'
  if (points > 0 && commas > 0) {
    // Both marks: the last one separates the decimals.
    const mark: DecimalMark = value.lastIndexOf('.') > value.lastIndexOf(',') ? '.' : ','
    return parseCsvAmount(text, mark).ok ? mark : 'unreadable'
  }
  const mark: DecimalMark = points > 0 ? '.' : ','
  const other: DecimalMark = mark === '.' ? ',' : '.'
  // The same mark more than once groups thousands: the decimals take the other one.
  if (points > 1 || commas > 1) return parseCsvAmount(text, other).ok ? other : 'unreadable'
  const [whole = '', fraction = ''] = value.split(mark)
  if (fraction.length === 3 && /^[1-9]\d{0,2}$/.test(whole)) return 'ambiguous'
  return mark
}

export interface DecimalEvidence {
  /**
   * settled: the amounts say which mark; none: every amount reads the same either way;
   * undecided: some amounts read differently with each mark and none settles it (the member
   * must choose); contradictory: some lines say a point and others a comma.
   */
  state: 'settled' | 'none' | 'undecided' | 'contradictory'
  mark: DecimalMark | null
  /** The cells (with their line) that show each reading, and those that could be either. */
  point: { line: number; text: string }[]
  comma: { line: number; text: string }[]
  ambiguous: { line: number; text: string }[]
}

/** What the amount cells of the file, taken together, say about the decimal mark. */
export function decimalEvidence(cells: readonly { line: number; text: string }[]): DecimalEvidence {
  const evidence: DecimalEvidence = {
    state: 'none',
    mark: null,
    point: [],
    comma: [],
    ambiguous: [],
  }
  for (const cell of cells) {
    if (cell.text.trim() === '') continue
    const says = decimalSays(cell.text)
    if (says === '.') evidence.point.push(cell)
    else if (says === ',') evidence.comma.push(cell)
    else if (says === 'ambiguous') evidence.ambiguous.push(cell)
  }
  if (evidence.point.length > 0 && evidence.comma.length > 0) evidence.state = 'contradictory'
  else if (evidence.point.length > 0 || evidence.comma.length > 0) {
    evidence.state = 'settled'
    evidence.mark = evidence.point.length > 0 ? '.' : ','
  } else if (evidence.ambiguous.length > 0) evidence.state = 'undecided'
  return evidence
}

/** The amount cells of the mapped columns, with their line. */
export function amountCells(
  records: readonly CsvRecord[],
  mapping: Pick<CsvMapping, 'amountMode' | 'amount' | 'debit' | 'credit'>,
): { line: number; text: string }[] {
  const columns =
    mapping.amountMode === 'split' ? [mapping.debit, mapping.credit] : [mapping.amount]
  return records.flatMap((record) =>
    columns.flatMap((column) =>
      column === null ? [] : [{ line: record.line, text: record.cells[column] ?? '' }],
    ),
  )
}

/**
 * The decimal mark to read the amounts with: the member's choice made here, else what the
 * amounts settle, else (when every amount reads the same either way) a point, which changes no
 * value; null when it must be asked, and always when the lines contradict each other.
 */
// R-IMPORT-324: the decimal mark is read from the amounts or asked, never assumed.
export function decimalToUse(
  evidence: DecimalEvidence,
  chosen: DecimalMark | null,
): DecimalMark | null {
  if (evidence.state === 'contradictory') return null
  if (chosen !== null) return chosen
  if (evidence.state === 'settled') return evidence.mark
  if (evidence.state === 'none') return '.'
  return null
}

// --- Columns ---------------------------------------------------------------------------------

const GUESSES: { key: keyof CsvMapping; pattern: RegExp }[] = [
  {
    key: 'date',
    pattern:
      /^(date|datum|buchungsdatum|booking ?date|transaction ?date|date ?(de|d')? ?(transaction|comptabilisation|valeur|achat))/i,
  },
  { key: 'debit', pattern: /(d[ée]bit|belastung|lastschrift|soll|money out|retrait)/i },
  { key: 'credit', pattern: /(cr[ée]dit|gutschrift|haben|money in|versement)/i },
  { key: 'amount', pattern: /(amount|montant|betrag|somme|total)/i },
  {
    key: 'description',
    pattern:
      /(description|libell[ée]|text|beschreibung|buchungstext|details?|motif|communication)/i,
  },
  {
    key: 'merchant',
    pattern:
      /(merchant|commer[çc]ant|payee|b[ée]n[ée]ficiaire|empf[äa]nger|counterparty|contrepartie)/i,
  },
  { key: 'bankId', pattern: /(transaction ?id|r[ée]f[ée]rence|reference|referenz)/i },
]

const isDateCell = (text: string) =>
  text.trim() !== '' && DATE_FORMATS.some((format) => parseCsvDate(text, format) !== null)
const isAmountCell = (text: string) =>
  /\d/.test(text) && decimalSays(text) !== 'unreadable' && !isDateCell(text)

/**
 * Whether a first line is plainly data rather than column names: one cell is a date and
 * another an amount.
 */
export function looksLikeData(cells: readonly string[]): boolean {
  const date = cells.findIndex(isDateCell)
  return date >= 0 && cells.some((cell, index) => index !== date && isAmountCell(cell))
}

/**
 * A first mapping from the header's names, for the user to check: nothing is sent unseen. A
 * first line that is plainly data is taken as a row (the mapper says so), the date and the
 * amount then found by their content.
 */
export function guessMapping(header: readonly string[], sample: readonly CsvRecord[]): CsvMapping {
  if (looksLikeData(header)) {
    const date = header.findIndex(isDateCell)
    const amount = header.findIndex((cell, index) => index !== date && isAmountCell(cell))
    const description = header.findIndex(
      (cell, index) => index !== date && index !== amount && /\p{L}/u.test(cell),
    )
    const formats = dateFormatsFor(
      [header, ...sample.map((record) => record.cells)].map((cells) => cells[date] ?? ''),
    )
    return {
      hasHeader: false,
      date,
      dateFormat: formats.length === 1 ? (formats[0] ?? null) : null,
      amountMode: 'signed',
      amount: amount >= 0 ? amount : null,
      negativeMeans: 'debit',
      debit: null,
      credit: null,
      decimal: null,
      description: description >= 0 ? description : null,
      merchant: null,
      bankId: null,
    }
  }
  const taken = new Set<number>()
  const find = (key: keyof CsvMapping): number | null => {
    const pattern = GUESSES.find((guess) => guess.key === key)?.pattern
    if (!pattern) return null
    const index = header.findIndex((name, at) => !taken.has(at) && pattern.test(name.trim()))
    if (index < 0) return null
    taken.add(index)
    return index
  }
  const date = find('date')
  const debit = find('debit')
  const credit = find('credit')
  const amount = find('amount')
  const split = debit !== null && credit !== null
  const dateValues = sample.map((record) => (date === null ? '' : (record.cells[date] ?? '')))
  const formats = dateFormatsFor(dateValues)
  return {
    hasHeader: true,
    date,
    dateFormat: formats.length === 1 ? (formats[0] ?? null) : null,
    amountMode: split ? 'split' : 'signed',
    amount: split ? null : amount,
    negativeMeans: 'debit',
    debit: split ? debit : null,
    credit: split ? credit : null,
    // Never assumed: the mapper reads it from the whole file's amounts, or asks.
    decimal: null,
    description: find('description'),
    merchant: find('merchant'),
    bankId: find('bankId'),
  }
}

/** Cut to at most `max` characters (code points), trimmed. */
function fit(text: string, max: number): { text: string; truncated: boolean } {
  const characters = Array.from(text.trim())
  if (characters.length <= max) return { text: characters.join(''), truncated: false }
  return { text: characters.slice(0, max).join('').trim(), truncated: true }
}

/** Whether the mapping names everything a row needs. */
export function mappingComplete(mapping: CsvMapping): boolean {
  if (mapping.date === null || mapping.dateFormat === null || mapping.decimal === null) return false
  return mapping.amountMode === 'signed'
    ? mapping.amount !== null
    : mapping.debit !== null && mapping.credit !== null
}

/** The records after the header, mapped: rows to send, and the lines that cannot be read. */
export function mapRecords(records: readonly CsvRecord[], mapping: CsvMapping): MappedCsv {
  const out: MappedCsv = { rows: [], problems: [] }
  if (!mappingComplete(mapping)) return out
  const decimal = mapping.decimal ?? '.'
  const body = mapping.hasHeader ? records.slice(1) : records
  for (const record of body) {
    const cell = (column: number | null) => (column === null ? '' : (record.cells[column] ?? ''))
    const needed = [mapping.date, mapping.amount, mapping.debit, mapping.credit].filter(
      (column): column is number => column !== null,
    )
    if (needed.some((column) => column >= record.cells.length)) {
      out.problems.push({ line: record.line, problem: 'too-few-cells' })
      continue
    }
    const dateText = cell(mapping.date).trim()
    if (dateText === '') {
      out.problems.push({ line: record.line, problem: 'date-missing' })
      continue
    }
    const date = parseCsvDate(dateText, mapping.dateFormat ?? 'yyyy-mm-dd')
    if (date === null) {
      out.problems.push({ line: record.line, problem: 'date-unreadable' })
      continue
    }
    let rappen: number
    let direction: 'debit' | 'credit'
    if (mapping.amountMode === 'signed') {
      const text = cell(mapping.amount).trim()
      if (text === '') {
        out.problems.push({ line: record.line, problem: 'amount-missing' })
        continue
      }
      const read = parseCsvAmount(text, decimal)
      if (!read.ok) {
        out.problems.push({ line: record.line, problem: read.problem })
        continue
      }
      const negative = read.rappen < 0
      rappen = Math.abs(read.rappen)
      direction = negative === (mapping.negativeMeans === 'debit') ? 'debit' : 'credit'
    } else {
      const debitText = cell(mapping.debit).trim()
      const creditText = cell(mapping.credit).trim()
      const debit = debitText === '' ? null : parseCsvAmount(debitText, decimal)
      const credit = creditText === '' ? null : parseCsvAmount(creditText, decimal)
      const failed = [debit, credit].find((read) => read !== null && !read.ok)
      if (failed?.ok === false) {
        out.problems.push({ line: record.line, problem: failed.problem })
        continue
      }
      const debitRappen = debit?.ok ? Math.abs(debit.rappen) : 0
      const creditRappen = credit?.ok ? Math.abs(credit.rappen) : 0
      if (debit === null && credit === null) {
        out.problems.push({ line: record.line, problem: 'amount-missing' })
        continue
      }
      if (debitRappen !== 0 && creditRappen !== 0) {
        out.problems.push({ line: record.line, problem: 'amount-both' })
        continue
      }
      direction = creditRappen !== 0 ? 'credit' : 'debit'
      rappen = creditRappen !== 0 ? creditRappen : debitRappen
    }
    if (rappen === 0) {
      out.problems.push({ line: record.line, problem: 'amount-zero' })
      continue
    }
    if (rappen > MAX_ROW_AMOUNT) {
      out.problems.push({ line: record.line, problem: 'amount-too-large' })
      continue
    }
    const row: ImportRow = { date, amount: rappen, direction }
    const adjustments: CsvAdjustment[] = []
    const description = fit(cell(mapping.description), MAX_DESCRIPTION_LENGTH)
    if (description.text !== '') row.description = description.text
    if (description.truncated) adjustments.push('description-truncated')
    const merchant = fit(cell(mapping.merchant), MAX_MERCHANT_LENGTH)
    if (merchant.text !== '') row.merchant = merchant.text
    if (merchant.truncated) adjustments.push('merchant-truncated')
    const bankId = cell(mapping.bankId).trim()
    if (bankId !== '') {
      // A shortened id would be another id: dropped instead.
      if (Array.from(bankId).length <= MAX_BANK_TRANSACTION_ID_LENGTH)
        row.bank_transaction_id = bankId
      else adjustments.push('bank-id-dropped')
    }
    out.rows.push({ line: record.line, row, adjustments })
  }
  return out
}
