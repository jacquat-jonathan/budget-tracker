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
  decimal: DecimalMark
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

/** The decimal mark the amount cells use, when they say it unambiguously. */
export function detectDecimal(values: readonly string[]): DecimalMark | null {
  let comma = false
  let point = false
  for (const raw of values) {
    const value = raw.replace(/[\s\u00a0\u202f'’ʼ]/g, '').replace(/-$/, '')
    if (/,\d{1,2}$/.test(value)) comma = true
    else if (/\.\d{1,2}$/.test(value)) point = true
  }
  if (comma === point) return null
  return comma ? ',' : '.'
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

/** A first mapping from the header's names, for the user to check: nothing is sent unseen. */
export function guessMapping(header: readonly string[], sample: readonly CsvRecord[]): CsvMapping {
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
  const amountColumns = split ? [debit, credit] : [amount]
  const amountValues = sample.flatMap((record) =>
    amountColumns.map((column) => (column === null ? '' : (record.cells[column] ?? ''))),
  )
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
    decimal: detectDecimal(amountValues) ?? '.',
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
  if (mapping.date === null || mapping.dateFormat === null) return false
  return mapping.amountMode === 'signed'
    ? mapping.amount !== null
    : mapping.debit !== null && mapping.credit !== null
}

/** The records after the header, mapped: rows to send, and the lines that cannot be read. */
export function mapRecords(records: readonly CsvRecord[], mapping: CsvMapping): MappedCsv {
  const out: MappedCsv = { rows: [], problems: [] }
  if (!mappingComplete(mapping)) return out
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
      const read = parseCsvAmount(text, mapping.decimal)
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
      const debit = debitText === '' ? null : parseCsvAmount(debitText, mapping.decimal)
      const credit = creditText === '' ? null : parseCsvAmount(creditText, mapping.decimal)
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
