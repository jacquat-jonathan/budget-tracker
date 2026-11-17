/**
 * Yuh account statement (Relevé de ton compte), French. Layout described in
 * docs/import-sources.md, section 4.
 */
import {
  COLUMN_TOLERANCE,
  Controls,
  IMPORT,
  REVIEW_CREDIT,
  SKIP_OWN_TRANSFER,
  StatementRefusalError,
  column,
  emptyDetails,
  endsUnder,
  parserTools,
  sameAddress,
  sameName,
  startsAt,
  type Column,
  type ParserTools,
} from './parse-support'
import { collapseSpaces, isValidIban, isValidIsin, readDecimal, toMinorUnits } from './reading'
import { findItem, joinItems, type PageLines, type TextItem, type TextLine } from './text-lines'
import type {
  CalendarDate,
  EntryHint,
  Handling,
  Rappen,
  SecurityDetails,
  SkippedLine,
  StatementControl,
  StatementEntry,
  StatementIdentity,
  YuhDocument,
  YuhTransaction,
} from './types'

const SOURCE = 'yuh-account'

const AMOUNT = String.raw`[\d'’]+\.\d{2}`
const LONG_DATE = String.raw`\d{2}\.\d{2}\.\d{4}`
const PERIOD = new RegExp(String.raw`^Extrait de compte du (${LONG_DATE}) au (${LONG_DATE})$`)
const GENERATED = new RegExp(String.raw`^Document généré le (${LONG_DATE})$`)
const SECTION_TITLE = /^Extrait de compte en ([A-Z]{3})$/
const SECTION_CARRIED = new RegExp(
  String.raw`^Solde reporté au (${LONG_DATE}) (${AMOUNT}) ([A-Z]{3})$`,
)
const SECTION_DEBIT = new RegExp(String.raw`^Total débit (${AMOUNT}) ([A-Z]{3})$`)
const SECTION_CREDIT = new RegExp(String.raw`^Total crédit (${AMOUNT}) ([A-Z]{3})$`)
const PAGE1_BALANCE = new RegExp(
  String.raw`^(Solde à l'ouverture|Solde à la clôture|Solde du compte d'épargne) (${AMOUNT}) ([A-Z]{3})$`,
)
const CURRENCY_BALANCE = new RegExp(String.raw`^(${AMOUNT}) ([A-Z]{3})$`)
const TABLE_END =
  /^(Cette notification|Les services bancaires|Avis sans signature)|^Page \d+ \/ \d+$/
const HEADING = ['DATE', 'INFORMATION', 'RÉFÉRENCE', 'DÉBIT', 'CRÉDIT', 'DATE VALEUR', 'SOLDE (']
const SALUTATION =
  /^(?:(?:Monsieur|Madame|Mademoiselle)(?: et (?:Monsieur|Madame))?|Messieurs|Mesdames|Famille) /
const SECURITY_KEYS = [
  'Quantité',
  'Prix',
  'Montant',
  'Commission',
  'Taxe',
  'Plateforme de négoce',
  'ISIN',
] as const
type SecurityKey = (typeof SECURITY_KEYS)[number]
const MONEY_FIELD = new RegExp(String.raw`^([A-Z]{3}) (${AMOUNT})$`)

export interface YuhParse {
  document: YuhDocument
  identity: StatementIdentity
  period: { from: CalendarDate; to: CalendarDate }
  entries: StatementEntry[]
  controls: StatementControl[]
}

interface Columns {
  date: Column
  info: Column
  reference: Column
  debit: Column
  credit: Column
  value: Column
  balance: Column
}

interface CellLine {
  line: TextLine
  date: TextItem | null
  info: string
  reference: string | null
  value: TextItem | null
  debit: Rappen | null
  credit: Rappen | null
  balance: Rappen | null
}

interface RawEntry {
  page: number
  bookingDate: CalendarDate
  valueDate: CalendarDate | null
  reference: string | null
  direction: 'debit' | 'credit'
  amount: Rappen
  balance: Rappen
  first: CellLine
  lines: string[]
}

interface Section {
  currency: string
  start: { date: CalendarDate; amount: Rappen } | null
  end: { date: CalendarDate; amount: Rappen } | null
  totalDebit: Rappen | null
  totalCredit: Rappen | null
  openingRow: Rappen | null
  closingRow: Rappen | null
  entries: RawEntry[]
  skippedRows: SkippedLine[]
  skippedSummary: SkippedLine[]
}

const t: ParserTools = parserTools(SOURCE)

/** Labels mix the typographic and the ASCII apostrophe: compare them as one. */
function plain(text: string): string {
  return text.replace(/’/g, "'")
}

function headingColumns(line: TextLine): Columns | null {
  const get = (label: string): Column | null => {
    const item = findItem(line, label)
    return item ? column(item) : null
  }
  const [date, info, reference, debit, credit, value, balance] = HEADING.map(get)
  if (!date || !info || !reference || !debit || !credit || !value || !balance) return null
  // "SOLDE (", "CHF", ")": the balance heading spans to the line's last item.
  const right = Math.max(
    ...line.items.filter((item) => item.x >= balance.x).map((item) => item.right),
  )
  return { date, info, reference, debit, credit, value, balance: { x: balance.x, right } }
}

function cells(line: TextLine, columns: Columns): CellLine {
  let date: TextItem | null = null
  let value: TextItem | null = null
  let reference: string | null = null
  const info: TextItem[] = []
  const amounts: { debit: Rappen | null; credit: Rappen | null; balance: Rappen | null } = {
    debit: null,
    credit: null,
    balance: null,
  }
  const setAmount = (key: 'debit' | 'credit' | 'balance', item: TextItem) => {
    if (amounts[key] !== null) t.fail('entry-with-several-amounts', line)
    amounts[key] = t.requireAmount(collapseSpaces(item.str), line)
  }
  for (const item of line.items) {
    const text = collapseSpaces(item.str)
    const startsInfo = startsAt(item, columns.info.x)
    if (item.oriented) {
      t.fail('unexpected-item', line)
    } else if (startsAt(item, columns.date.x) && item.x < columns.info.x - COLUMN_TOLERANCE) {
      if (date) t.fail('unexpected-item', line)
      date = item
    } else if (!startsInfo && endsUnder(item, columns.debit)) {
      setAmount('debit', item)
    } else if (!startsInfo && endsUnder(item, columns.credit)) {
      setAmount('credit', item)
    } else if (!startsInfo && endsUnder(item, columns.balance)) {
      setAmount('balance', item)
    } else if (item.x >= columns.value.x - COLUMN_TOLERANCE && item.x <= columns.value.right) {
      if (value) t.fail('unexpected-item', line)
      value = item
    } else if (
      item.x >= columns.info.x - COLUMN_TOLERANCE &&
      item.right < columns.debit.x - COLUMN_TOLERANCE
    ) {
      // The reference is the all-digit item after the label, wherever its centring puts it.
      if (!startsInfo && /^\d+$/.test(text)) {
        if (reference !== null) t.fail('unexpected-item', line)
        reference = text
      } else {
        info.push(item)
      }
    } else {
      t.fail('unexpected-item', line)
    }
  }
  return { line, date, info: joinItems(info), reference, value, ...amounts }
}

interface Holder {
  name: string | null
  address: string[]
}

export function parseYuhAccount(pages: PageLines[]): YuhParse {
  const controls = new Controls(SOURCE)
  const first = pages[0]
  if (!first) t.fail('missing-table', null)

  // Page 1: period, holder block, account block, balances.
  const periodLine = first.lines.find((line) => PERIOD.test(line.text))
  const period = periodLine ? PERIOD.exec(periodLine.text) : null
  if (!periodLine || !period) t.fail('missing-field', null)
  const periodFrom = t.requireDate(period[1] ?? '', periodLine)
  const periodTo = t.requireDate(period[2] ?? '', periodLine)
  const generatedLine = first.lines.find((line) => GENERATED.test(line.text))
  const generated = generatedLine ? GENERATED.exec(generatedLine.text) : null
  const generatedOn =
    generatedLine && generated ? t.requireDate(generated[1] ?? '', generatedLine) : null

  const accountItem = first.lines
    .flatMap((line) => line.items)
    .find((item) => item.str === 'Yuh account')
  if (!accountItem) t.fail('missing-field', null)
  const rightLines = first.lines
    .map((line) => ({
      line,
      items: line.items.filter((item) => item.x >= accountItem.x - COLUMN_TOLERANCE),
    }))
    .filter((entry) => entry.items.length > 0)
  const holderLines = rightLines
    .filter((entry) => entry.line.y > accountItem.y + COLUMN_TOLERANCE)
    .map((entry) => joinItems(entry.items))
  const holder: Holder =
    holderLines.length >= 3
      ? {
          name: holderLines.slice(0, -2).join(' ').replace(SALUTATION, ''),
          address: holderLines.slice(-2),
        }
      : { name: null, address: [] }
  const rightValue = (label: string): string | null => {
    const entry = rightLines.find((candidate) => candidate.items[0]?.str === label)
    return entry ? joinItems(entry.items.slice(1)) : null
  }
  const iban = rightValue('IBAN')?.replace(/\s/g, '') ?? null
  const clientNumber = rightValue('Client')

  const page1Skipped: SkippedLine[] = []
  const page1Balances = new Map<string, Rappen>()
  const currencyBalances = new Map<string, Rappen>()
  let inCurrencyBlock = false
  for (const line of first.lines) {
    const left = line.items.filter((item) => item.x < accountItem.x - COLUMN_TOLERANCE)
    const text = joinItems(left)
    const balance = PAGE1_BALANCE.exec(plain(text))
    if (balance) {
      const [, label = '', amount = '', currency = ''] = balance
      if (currency !== 'CHF') t.fail('unexpected-line', line)
      page1Balances.set(label, t.requireAmount(amount, line))
      page1Skipped.push({ page: line.page, text, reason: 'page 1 account summary' })
      continue
    }
    if (text === 'Solde de clôture réparti entre toutes les devises') {
      inCurrencyBlock = true
      continue
    }
    const currencyBalance = inCurrencyBlock ? CURRENCY_BALANCE.exec(text) : null
    if (currencyBalance) {
      const [, amount = '', currency = ''] = currencyBalance
      currencyBalances.set(currency, t.requireAmount(amount, line))
    }
  }
  const page1Opening = page1Balances.get("Solde à l'ouverture")
  const page1Closing = page1Balances.get('Solde à la clôture')
  if (page1Opening === undefined || page1Closing === undefined) t.fail('missing-field', null)

  // Pages: currency sections, each a summary and a table.
  const sections: Section[] = []
  let section: Section | null = null
  let current: RawEntry | null = null
  let closed = false

  for (const page of pages) {
    if (page.page === first.page) continue
    // A table never continues across a page without its heading.
    let columns: Columns | null = null
    for (const line of page.lines) {
      const title = SECTION_TITLE.exec(line.text)
      if (title) {
        if (section && section.closingRow === null) t.fail('unexpected-line', line)
        const currency = title[1] ?? ''
        if (sections.some((known) => known.currency === currency))
          t.fail('inconsistent-document', line)
        section = {
          currency,
          start: null,
          end: null,
          totalDebit: null,
          totalCredit: null,
          openingRow: null,
          closingRow: null,
          entries: [],
          skippedRows: [],
          skippedSummary: [],
        }
        sections.push(section)
        columns = null
        current = null
        closed = false
        continue
      }
      if (!columns) {
        // Outside a table: the section summary, the table heading, or page furniture.
        const headingColumnsFound = headingColumns(line)
        if (headingColumnsFound) {
          if (!section) t.fail('unexpected-line', line)
          columns = headingColumnsFound
          continue
        }
        if (!section || section.openingRow !== null) continue
        const carried = SECTION_CARRIED.exec(line.text)
        const debit = SECTION_DEBIT.exec(line.text)
        const credit = SECTION_CREDIT.exec(line.text)
        const currency = carried?.[3] ?? debit?.[2] ?? credit?.[2]
        if (currency === undefined) continue
        if (currency !== section.currency) t.fail('inconsistent-document', line)
        if (carried) {
          const value = {
            date: t.requireDate(carried[1] ?? '', line),
            amount: t.requireAmount(carried[2] ?? '', line),
          }
          if (!section.start) section.start = value
          else if (!section.end) section.end = value
          else t.fail('unexpected-line', line)
        } else if (debit) {
          section.totalDebit = t.requireAmount(debit[1] ?? '', line)
        } else if (credit) {
          section.totalCredit = t.requireAmount(credit[1] ?? '', line)
        }
        section.skippedSummary.push({
          page: line.page,
          text: line.text,
          reason: 'currency section summary, used only to check the parse',
        })
        continue
      }

      if (TABLE_END.test(line.text)) {
        columns = null
        continue
      }
      if (!section) t.fail('unexpected-line', line)
      const cell = cells(line, columns)
      const label = plain(cell.info)
      const amountCount = [cell.debit, cell.credit].filter((amount) => amount !== null).length
      if (closed) t.fail('unexpected-line', line)

      if (cell.date && (label === "Solde d'ouverture" || label === 'Solde de clôture')) {
        if (amountCount > 0 || cell.value || cell.reference !== null || cell.balance === null) {
          t.fail('unexpected-line', line)
        }
        const date = t.requireDate(collapseSpaces(cell.date.str), line)
        if (label === "Solde d'ouverture") {
          if (section.openingRow !== null) t.fail('unexpected-line', line)
          if (date !== periodFrom) t.fail('inconsistent-document', line)
          section.openingRow = cell.balance
          section.skippedRows.push({
            page: line.page,
            text: line.text,
            reason: "opening balance row (Solde d'ouverture)",
          })
        } else {
          if (section.openingRow === null) t.fail('unexpected-line', line)
          if (date !== periodTo) t.fail('inconsistent-document', line)
          section.closingRow = cell.balance
          section.skippedRows.push({
            page: line.page,
            text: line.text,
            reason: 'closing balance row (Solde de clôture)',
          })
          closed = true
          current = null
        }
        continue
      }
      if (section.openingRow === null) t.fail('unexpected-line', line)

      if (cell.date) {
        if (cell.info === '') t.fail('malformed-entry', line)
        if (amountCount === 0) t.fail('entry-without-amount', line)
        if (amountCount > 1) t.fail('entry-with-several-amounts', line)
        if (cell.balance === null || cell.reference === null) t.fail('missing-field', line)
        const bookingDate = t.requireDate(collapseSpaces(cell.date.str), line)
        if (bookingDate < periodFrom || bookingDate > periodTo) t.fail('entry-outside-period', line)
        current = {
          page: line.page,
          bookingDate,
          valueDate: cell.value ? t.requireDate(collapseSpaces(cell.value.str), line) : null,
          reference: cell.reference,
          direction: cell.debit !== null ? 'debit' : 'credit',
          amount: cell.debit ?? cell.credit ?? 0,
          balance: cell.balance,
          first: cell,
          lines: [cell.info],
        }
        section.entries.push(current)
        continue
      }
      // A continuation line: text under INFORMATION only.
      if (
        !current ||
        amountCount > 0 ||
        cell.balance !== null ||
        cell.value ||
        cell.reference !== null ||
        cell.info === ''
      ) {
        t.fail('unexpected-line', line)
      }
      current.lines.push(cell.info)
    }
  }

  const chf = sections.find((candidate) => candidate.currency === 'CHF')
  if (!chf) t.fail('missing-table', null)

  // The entries first: a row whose label contradicts its column is refused as such.
  const transactions: YuhTransaction[] = []
  const entries: StatementEntry[] = []
  chf.entries.forEach((raw, index) => {
    const read = readEntry(raw, index + 1, holder, controls)
    transactions.push(read.transaction)
    entries.push(read.entry)
  })

  // Every section adds up; only CHF may hold movements (R-MONEY-001).
  for (const candidate of sections) {
    const { start, end, totalDebit, totalCredit, openingRow, closingRow } = candidate
    if (
      !start ||
      !end ||
      totalDebit === null ||
      totalCredit === null ||
      openingRow === null ||
      closingRow === null
    ) {
      t.fail('missing-field', null)
    }
    if (start.date !== periodFrom || end.date !== periodTo) t.fail('inconsistent-document', null)
    if (candidate.currency !== 'CHF' && candidate.entries.length > 0) {
      throw new StatementRefusalError({
        reason: 'unsupported-currency',
        source: SOURCE,
        currency: candidate.currency,
      })
    }
    const currency = { currency: candidate.currency }
    controls.equal('opening-row', openingRow, start.amount, currency)
    let running = openingRow
    let debits = 0
    let credits = 0
    for (const entry of candidate.entries) {
      if (entry.direction === 'debit') {
        debits += entry.amount
        running -= entry.amount
      } else {
        credits += entry.amount
        running += entry.amount
      }
      controls.equal('running-balance', entry.balance, running, { ...currency, page: entry.page })
    }
    controls.equal('debits-total', totalDebit, debits, currency)
    controls.equal('credits-total', totalCredit, credits, currency)
    controls.equal('closing-balance', end.amount, start.amount + credits - debits, currency)
    controls.equal('closing-row', closingRow, end.amount, currency)
    const printedClosing = currencyBalances.get(candidate.currency)
    if (printedClosing !== undefined) {
      controls.equal('summary-currency-closing-balance', printedClosing, end.amount, {
        ...currency,
        page: first.page,
      })
    }
  }
  // Page 1's opening and closing balances are those of the account when it has one currency;
  // with several, what they hold is not known (Q-204), so they are not compared.
  if (!chf.start || !chf.end || chf.totalDebit === null || chf.totalCredit === null)
    t.fail('missing-field', null)
  if (sections.length === 1) {
    controls.equal('summary-opening-balance', page1Opening, chf.start.amount, { page: first.page })
    controls.equal('summary-closing-balance', page1Closing, chf.end.amount, { page: first.page })
  }

  const debits = chf.entries
    .filter((entry) => entry.direction === 'debit')
    .reduce((sum, entry) => sum + entry.amount, 0)
  const credits = chf.entries
    .filter((entry) => entry.direction === 'credit')
    .reduce((sum, entry) => sum + entry.amount, 0)
  const document: YuhDocument = {
    source: SOURCE,
    statement: {
      bank: 'Yuh (Swissquote Bank Ltd)',
      document: 'Relevé de ton compte',
      language: 'fr',
      holder: holder.name,
      iban,
      clientNumber,
      periodFrom,
      periodTo,
      generatedOn,
      currencySections: sections.map((candidate) => candidate.currency),
      openingBalance: chf.start.amount,
      closingBalance: chf.end.amount,
      totalDebit: chf.totalDebit,
      totalCredit: chf.totalCredit,
      savingsAccountBalance: page1Balances.get("Solde du compte d'épargne") ?? null,
    },
    checks: {
      sumOfDebits: debits,
      sumOfCredits: credits,
      debitsMatchPrintedTotal: controls.checked('debits-total'),
      creditsMatchPrintedTotal: controls.checked('credits-total'),
      openingPlusCreditsMinusDebitsIsClosing: controls.checked('closing-balance'),
      everyRowBalanceMatchesRunningBalance:
        controls.checked('running-balance') || chf.entries.length === 0,
      purchaseDebitIsAmountPlusCommissionPlusTax: controls.checked('securities-amount')
        ? true
        : null,
    },
    transactions,
    skipped: [
      ...sections.flatMap((candidate) => [...candidate.skippedRows, ...candidate.skippedSummary]),
      ...page1Skipped,
    ],
  }
  return {
    document,
    identity: { kind: 'period', from: periodFrom, to: periodTo },
    period: { from: periodFrom, to: periodTo },
    entries,
    controls: controls.list,
  }
}

function readSecurity(raw: RawEntry, n: number, controls: Controls): SecurityDetails | null {
  const line = raw.first.line
  const fields = new Map<SecurityKey, string>()
  const nameLines: string[] = []
  let lastKey: SecurityKey | null = null
  for (const text of raw.lines.slice(1)) {
    const key = SECURITY_KEYS.find((candidate) => text.startsWith(`${candidate}: `))
    if (key) {
      if (fields.has(key)) t.fail('malformed-entry', line)
      fields.set(key, text.slice(key.length + 2))
      lastKey = key
    } else if (lastKey) {
      // A wrapped value ("SIX Swiss" / "Exchange").
      fields.set(lastKey, `${fields.get(lastKey) ?? ''} ${text}`)
    } else {
      nameLines.push(text)
    }
  }
  if (fields.size === 0) return null

  const quantity = fields.get('Quantité')
  const price = MONEY_FIELD.exec(fields.get('Prix') ?? '')
  const gross = MONEY_FIELD.exec(fields.get('Montant') ?? '')
  const isin = fields.get('ISIN')
  if (nameLines.length === 0 || quantity === undefined || !price || !gross || isin === undefined) {
    t.fail('malformed-entry', line)
  }
  if (!isValidIsin(isin)) t.fail('invalid-reference', line)
  const quantityValue = readDecimal(quantity) ?? t.fail('unreadable-amount', line)
  const money = (key: 'Commission' | 'Taxe'): Rappen => {
    const value = fields.get(key)
    if (value === undefined) return 0
    const match = MONEY_FIELD.exec(value)
    if (!match || match[1] !== gross[1]) t.fail('malformed-entry', line)
    return t.requireAmount(match[2] ?? '', line)
  }
  const grossCurrency = gross[1] ?? ''
  if (grossCurrency !== 'CHF') t.fail('malformed-entry', line)
  const grossAmount = t.requireAmount(gross[2] ?? '', line)
  const commission = money('Commission')
  const tax = money('Taxe')
  const priceCurrency = price[1] ?? ''
  const priceHundredths = t.requireAmount(price[2] ?? '', line)

  controls.equal('securities-amount', raw.amount, grossAmount + commission + tax, {
    entry: n,
    page: raw.page,
  })
  if (priceCurrency === grossCurrency) {
    // Quantité = Montant / Prix to the printed decimals: Quantité × Prix is Montant within
    // one unit of the last decimal times the price (rounded or truncated alike).
    const tolerance = Math.max(1, Math.ceil(priceHundredths / Number(quantityValue.scale))) + 1
    controls.near(
      'securities-quantity',
      grossAmount,
      {
        numerator: quantityValue.units * BigInt(priceHundredths),
        denominator: quantityValue.scale,
      },
      tolerance,
      { entry: n, page: raw.page },
    )
  }
  return {
    name: nameLines.join(' '),
    isin,
    quantity,
    price: toMinorUnits(priceHundredths, priceCurrency) ?? t.fail('unreadable-amount', line),
    priceCurrency,
    grossAmount,
    commission,
    tax,
    venue: fields.get('Plateforme de négoce') ?? null,
  }
}

function readEntry(
  raw: RawEntry,
  n: number,
  holder: Holder,
  controls: Controls,
): { transaction: YuhTransaction; entry: StatementEntry } {
  const line = raw.first.line
  const textLines = raw.lines
  const text = collapseSpaces(textLines.join(' '))
  const label = textLines[0] ?? ''
  const debit = raw.direction === 'debit'
  const base = {
    n,
    page: raw.page,
    bookingDate: raw.bookingDate,
    valueDate: raw.valueDate,
    date: raw.bookingDate,
    direction: raw.direction,
    amount: raw.amount,
    reference: raw.reference,
    balanceAfter: raw.balance,
    text,
    textLines,
  }
  let transaction: YuhTransaction
  let hint: EntryHint | null = null

  const security = label === 'Achat' ? readSecurity(raw, n, controls) : null
  if (security) {
    if (!debit) t.fail('malformed-entry', line)
    hint = 'securities-purchase'
    transaction = {
      ...base,
      kind: 'securities-purchase',
      merchant: security.name,
      counterparty: null,
      security,
      flags: [],
      description: security.name,
      handling: IMPORT,
    }
  } else if (label === 'Virement de') {
    const [, name, ...rest] = textLines
    if (debit || name === undefined) t.fail('malformed-entry', line)
    const last = rest.at(-1)
    const iban = last !== undefined && isValidIban(last) ? last : null
    const address = iban ? rest.slice(0, -1) : rest
    const streetAndTown = /^[A-Z]{2}$/.test(address.at(-1) ?? '') ? address.slice(0, -1) : address
    const own =
      holder.name !== null &&
      sameName(holder.name, name) &&
      sameAddress(streetAndTown, holder.address)
    let handling: Handling = REVIEW_CREDIT
    if (own) {
      // R-IMPORT-212: the holder's own name and address (the other bank prints "Last First").
      hint = 'own-account-transfer'
      handling = SKIP_OWN_TRANSFER
    }
    transaction = {
      ...base,
      kind: 'transfer-in',
      merchant: name,
      counterparty: { type: 'payer', name, address, iban },
      security: null,
      flags: own ? ['own-account-transfer'] : [],
      description: name,
      handling,
    }
  } else {
    // Not seen in the sample (sales, dividends, fees, card, TWINT ...): kept as printed (Q-203).
    if (/^Frais\b/.test(label)) hint = 'fee'
    else if (/^Intérêts?\b/.test(label)) hint = 'interest'
    else if (/^Retrait\b/.test(label)) hint = 'cash-withdrawal'
    transaction = {
      ...base,
      kind: 'other',
      merchant: null,
      counterparty: null,
      security: null,
      flags: [],
      // R-IMPORT-211: only the label line; the rest may name third parties (it stays in textLines).
      description: label,
      handling: debit ? IMPORT : REVIEW_CREDIT,
    }
  }

  const entry: StatementEntry = {
    n,
    page: raw.page,
    date: raw.bookingDate,
    direction: raw.direction,
    amount: raw.amount,
    description: transaction.description,
    merchant: transaction.merchant,
    // R-IMPORT-101: the Yuh reference is a stable bank transaction id.
    bankTransactionId: raw.reference,
    hint,
    handling: transaction.handling.action,
    textLines,
    details: {
      ...emptyDetails(raw.bookingDate),
      valueDate: raw.valueDate,
      security: transaction.security,
      counterparty: transaction.counterparty,
      balanceAfter: raw.balance,
    },
  }
  return { transaction, entry }
}
