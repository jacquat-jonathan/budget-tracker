/**
 * Migros Bank private-account statement (Extrait de compte), French. Layout described in
 * docs/import-sources.md, section 2.
 */
import {
  COLUMN_TOLERANCE,
  Controls,
  IMPORT,
  REVIEW_CREDIT,
  SKIP_CARD_BILL_PAYMENT,
  SKIP_IF_INCOME,
  SKIP_OWN_TRANSFER,
  StatementRefusalError,
  column,
  emptyDetails,
  endsUnder,
  parserTools,
  sameAddress,
  sameName,
  startsAt,
  tableOf,
  type Column,
  type ParserTools,
} from './parse-support'
import {
  collapseSpaces,
  isValidQrReference,
  multiplyByDecimal,
  readAmount,
  readDecimal,
  toMinorUnits,
} from './reading'
import {
  findItem,
  hasItems,
  joinItems,
  type PageLines,
  type TextItem,
  type TextLine,
} from './text-lines'
import type {
  CalendarDate,
  EntryHint,
  Handling,
  MigrosAccountDocument,
  MigrosAccountFlag,
  MigrosAccountTransaction,
  Rappen,
  SkippedLine,
  StatementControl,
  StatementEntry,
  StatementIdentity,
} from './types'

const SOURCE = 'migros-bank-account'

export const MIGROS_ACCOUNT_TITLE =
  /^Extrait de compte (\d{2}\.\d{2}\.\d{4}) - (\d{2}\.\d{2}\.\d{4})$/
export const MIGROS_ACCOUNT_HEADING = ['Date', 'Texte', 'Valeur', 'Débits', 'Crédits', 'Solde CHF']

const PAGE_FOOTER = /^Page \d+ \/ \d+$/
const SHORT_DATE_AT_END = /^(.*) (\d{2}\.\d{2}\.\d{2})$/
const AMOUNT_TEXT = String.raw`[\d'’]+\.\d{2}`
const CARD_ENTRY = new RegExp(
  String.raw`^(Achat|Crédit) (.+?) (\d{2}\.\d{2}\.\d{4}) ([01]\d|2[0-3]):([0-5]\d) Carte: (\d{6}\*{6}\d{4}) ` +
    String.raw`Montant: ([A-Z]{3}) (${AMOUNT_TEXT})` +
    String.raw`(?: ([A-Z]{3}) (${AMOUNT_TEXT}) au cours de (\d+\.\d+))?` +
    String.raw`(?: plus frais de CHF (${AMOUNT_TEXT}))?$`,
)
const TWINT_PERSON = /^(.+?), (.+), (\+\d{6,15}) (\d{16})$/
const TWINT_PERSON_ONE_NAME = /^(.+), (\+\d{6,15}) (\d{16})$/
const TWINT_MERCHANT = /^(.+) (\d{16})$/
const QR_REFERENCE = /^\d{2}(?: \d{5}){5}$/

export interface MigrosAccountParse {
  document: MigrosAccountDocument
  identity: StatementIdentity
  period: { from: CalendarDate; to: CalendarDate }
  entries: StatementEntry[]
  controls: StatementControl[]
}

interface Columns {
  date: Column
  text: Column
  value: Column
  debit: Column
  credit: Column
  balance: Column
}

interface CellLine {
  line: TextLine
  date: TextItem | null
  text: string
  value: TextItem | null
  debit: Rappen | null
  credit: Rappen | null
  balance: Rappen | null
}

interface RawEntry {
  page: number
  bookingDate: CalendarDate
  valueDate: CalendarDate | null
  direction: 'debit' | 'credit'
  amount: Rappen
  balance: Rappen | null
  balancePage: number
  lines: CellLine[]
}

const t: ParserTools = parserTools(SOURCE)

function headingColumns(line: TextLine): Columns | null {
  if (!hasItems(line, MIGROS_ACCOUNT_HEADING)) return null
  const get = (label: string): Column => {
    const item = findItem(line, label)
    if (!item) t.fail('missing-table', line)
    return column(item)
  }
  return {
    date: get('Date'),
    text: get('Texte'),
    value: get('Valeur'),
    debit: get('Débits'),
    credit: get('Crédits'),
    balance: get('Solde CHF'),
  }
}

/** Sort the items of a table line into its columns; anything else refuses the statement. */
function cells(line: TextLine, columns: Columns): CellLine {
  let date: TextItem | null = null
  let value: TextItem | null = null
  const text: TextItem[] = []
  const amounts: { debit: Rappen | null; credit: Rappen | null; balance: Rappen | null } = {
    debit: null,
    credit: null,
    balance: null,
  }
  const setAmount = (key: 'debit' | 'credit' | 'balance', item: TextItem) => {
    if (amounts[key] !== null) t.fail('entry-with-several-amounts', line)
    amounts[key] = t.requireAmount(item.str, line)
  }
  for (const item of line.items) {
    if (item.oriented) {
      t.fail('unexpected-item', line)
    } else if (startsAt(item, columns.date.x) && item.x < columns.text.x - COLUMN_TOLERANCE) {
      if (date) t.fail('unexpected-item', line)
      date = item
    } else if (
      item.x >= columns.text.x - COLUMN_TOLERANCE &&
      item.x < columns.value.x - COLUMN_TOLERANCE
    ) {
      text.push(item)
    } else if (startsAt(item, columns.value.x)) {
      if (value) t.fail('unexpected-item', line)
      value = item
    } else if (endsUnder(item, columns.debit)) {
      setAmount('debit', item)
    } else if (endsUnder(item, columns.credit)) {
      setAmount('credit', item)
    } else if (endsUnder(item, columns.balance)) {
      setAmount('balance', item)
    } else {
      t.fail('unexpected-item', line)
    }
  }
  return { line, date, text: joinItems(text), value, ...amounts }
}

interface Holder {
  names: string[]
  address: string[]
}

/** The holder block at the left of page 1: code, salutation, name(s), street, postcode and town. */
function readHolder(lines: TextLine[], rightBlockX: number): Holder {
  const left = lines
    .map((line) => joinItems(line.items.filter((item) => item.x < rightBlockX - COLUMN_TOLERANCE)))
    .filter((text) => text !== '' && !/, \d{2}\.\d{2}\.\d{4}$/.test(text))
  const block = /^\d+$/.test(left[0] ?? '') ? left.slice(2) : left.slice(1)
  if (block.length < 3) return { names: [], address: [] }
  return { names: block.slice(0, -2), address: block.slice(-2) }
}

interface RightBlockLine {
  line: TextLine
  label: string
  value: string
  /** The right-block text, without the left column (place and date). */
  text: string
}

function rightBlock(lines: TextLine[], x: number): RightBlockLine[] {
  return lines.flatMap((line) => {
    const items = line.items.filter((item) => item.x >= x - COLUMN_TOLERANCE)
    const [label, ...rest] = items
    if (!label) return []
    return [
      { line, label: collapseSpaces(label.str), value: joinItems(rest), text: joinItems(items) },
    ]
  })
}

function classifyOther(text: string): {
  kind: MigrosAccountTransaction['kind']
  hint: EntryHint | null
} {
  // No such entry was in the sample; these labels are assumptions (Q-201).
  if (/^Retrait\b/.test(text)) return { kind: 'cash-withdrawal', hint: 'cash-withdrawal' }
  if (/^Intérêts?\b/.test(text)) return { kind: 'other', hint: 'interest' }
  if (/^(Frais|Commission|Taxe|Tenue de compte)\b/.test(text)) return { kind: 'other', hint: 'fee' }
  return { kind: 'other', hint: null }
}

export function parseMigrosAccount(pages: PageLines[]): MigrosAccountParse {
  const controls = new Controls(SOURCE)
  const first = pages[0]
  if (!first) t.fail('missing-table', null)

  // Period: the title line, the same on every page that prints it.
  const titleLine = first.lines.find((line) => MIGROS_ACCOUNT_TITLE.test(line.text))
  const title = titleLine ? MIGROS_ACCOUNT_TITLE.exec(titleLine.text) : null
  if (!titleLine || !title) t.fail('missing-field', null)
  const periodFrom = t.requireDate(title[1] ?? '', titleLine)
  const periodTo = t.requireDate(title[2] ?? '', titleLine)
  for (const page of pages) {
    for (const line of page.lines) {
      if (line.text.startsWith('Extrait de compte ') && line.text !== titleLine.text) {
        t.fail('inconsistent-document', line)
      }
    }
  }

  // Page 1 header: bank block, holder, account, summary block.
  const bankItem = first.lines
    .flatMap((line) => line.items)
    .find((item) => item.str === 'Banque Migros SA')
  if (!bankItem) t.fail('missing-field', null)
  const header = first.lines.filter((line) => line.y > titleLine.y)
  const right = rightBlock(header, bankItem.x)
  const holder = readHolder(header, bankItem.x)
  const ibanLine = right.find((entry) => entry.label === 'IBAN')
  const iban = ibanLine ? ibanLine.value.replace(/\s/g, '') : null
  const account = right
    .map((entry) => /^([\d.]+) \/ ([A-Z]{3})$/.exec(entry.value))
    .find((match) => match !== null)
  const currency = account?.[2] ?? 'CHF'
  if (currency !== 'CHF') {
    throw new StatementRefusalError({ reason: 'unsupported-currency', source: SOURCE, currency })
  }

  const summary = (label: string): { amount: Rappen; skipped: SkippedLine } => {
    const entry = right.find(
      (candidate) => candidate.label === label && /^CHF \S+$/.test(candidate.value),
    )
    if (!entry) t.fail('missing-field', null)
    const amount = readAmount(entry.value.slice(4)) ?? t.fail('unreadable-amount', entry.line)
    return {
      amount,
      skipped: {
        page: entry.line.page,
        text: entry.text,
        reason: 'page 1 summary block, used only to check the parse',
      },
    }
  }
  const summaryOpening = summary('Solde initial')
  const summaryDebits = summary('Débits')
  const summaryCredits = summary('Crédits')
  const summaryClosing = summary('Solde final')
  const skipped: SkippedLine[] = [
    summaryOpening.skipped,
    summaryDebits.skipped,
    summaryCredits.skipped,
    summaryClosing.skipped,
  ]

  // The table, page after page.
  let opening: Rappen | null = null
  let totals: { debits: Rappen; credits: Rappen; closing: Rappen; date: CalendarDate } | null = null
  let finalBalance: Rappen | null = null
  let tableSeen = false
  const raw: RawEntry[] = []
  let current: RawEntry | null = null

  for (const page of pages) {
    const table = tableOf(page, headingColumns, PAGE_FOOTER)
    if (!table) continue
    tableSeen = true
    const { columns } = table

    for (const line of table.lines) {
      const cell = cells(line, columns)
      const amountCount = [cell.debit, cell.credit].filter((amount) => amount !== null).length

      if (finalBalance !== null) t.fail('unexpected-line', line)

      if (!cell.date && cell.text === 'Report à nouveau') {
        if (
          opening !== null ||
          raw.length > 0 ||
          amountCount > 0 ||
          cell.value ||
          cell.balance === null
        ) {
          t.fail('unexpected-line', line)
        }
        opening = cell.balance
        skipped.push({
          page: line.page,
          text: line.text,
          reason: 'opening balance carried forward (Report à nouveau)',
        })
        continue
      }
      const soldeAu = /^Solde au (\d{2}\.\d{2}\.\d{4})$/.exec(cell.text)
      if (!cell.date && soldeAu) {
        if (
          totals ||
          cell.value ||
          cell.debit === null ||
          cell.credit === null ||
          cell.balance === null
        ) {
          t.fail('unexpected-line', line)
        }
        totals = {
          debits: cell.debit,
          credits: cell.credit,
          closing: cell.balance,
          date: t.requireDate(soldeAu[1] ?? '', line),
        }
        current = null
        skipped.push({
          page: line.page,
          text: line.text,
          reason: 'period totals and closing balance (Solde au)',
        })
        continue
      }
      if (!cell.date && cell.text === 'Solde final') {
        if (!totals || amountCount > 0 || cell.value || cell.balance === null)
          t.fail('unexpected-line', line)
        finalBalance = cell.balance
        skipped.push({ page: line.page, text: line.text, reason: 'closing balance (Solde final)' })
        continue
      }
      if (opening === null || totals) t.fail('unexpected-line', line)

      if (cell.date) {
        if (cell.text === '') t.fail('malformed-entry', line)
        if (amountCount === 0) t.fail('entry-without-amount', line)
        if (amountCount > 1) t.fail('entry-with-several-amounts', line)
        const bookingDate = t.requireDate(cell.date.str, line)
        if (bookingDate < periodFrom || bookingDate > periodTo) t.fail('entry-outside-period', line)
        current = {
          page: line.page,
          bookingDate,
          valueDate: cell.value ? t.requireDate(cell.value.str, line) : null,
          direction: cell.debit !== null ? 'debit' : 'credit',
          amount: cell.debit ?? cell.credit ?? 0,
          balance: cell.balance,
          balancePage: line.page,
          lines: [cell],
        }
        raw.push(current)
        continue
      }

      // A continuation line: more text of the current entry, possibly the day's balance.
      if (!current || cell.value || amountCount > 0) t.fail('unexpected-line', line)
      if (cell.balance !== null) {
        if (current.balance !== null) t.fail('entry-with-several-amounts', line)
        current.balance = cell.balance
        current.balancePage = line.page
      }
      current.lines.push(cell)
    }
  }

  if (!tableSeen) t.fail('missing-table', null)
  if (opening === null || !totals || finalBalance === null) t.fail('missing-field', null)
  if (totals.date !== periodTo) t.fail('inconsistent-document', null)

  // Entries, the running balance after each, and the column sums.
  const transactions: MigrosAccountTransaction[] = []
  const entries: StatementEntry[] = []
  let running = opening
  let sumOfDebits = 0
  let sumOfCredits = 0
  raw.forEach((entry, index) => {
    const n = index + 1
    const { transaction, entry: normalised } = readEntry(entry, n, holder, controls)
    if (entry.direction === 'debit') {
      sumOfDebits += entry.amount
      running -= entry.amount
    } else {
      sumOfCredits += entry.amount
      running += entry.amount
    }
    if (entry.balance !== null) {
      controls.equal('running-balance', entry.balance, running, {
        page: entry.balancePage,
        entry: n,
      })
    }
    transactions.push(transaction)
    entries.push(normalised)
  })

  const computedClosing = opening + sumOfCredits - sumOfDebits
  controls.equal('debits-total', totals.debits, sumOfDebits)
  controls.equal('credits-total', totals.credits, sumOfCredits)
  controls.equal('closing-balance', totals.closing, computedClosing)
  controls.equal('final-balance', finalBalance, totals.closing)
  controls.equal('summary-opening-balance', summaryOpening.amount, opening, { page: first.page })
  controls.equal('summary-debits', summaryDebits.amount, sumOfDebits, { page: first.page })
  controls.equal('summary-credits', summaryCredits.amount, sumOfCredits, { page: first.page })
  controls.equal('summary-closing-balance', summaryClosing.amount, computedClosing, {
    page: first.page,
  })

  const document: MigrosAccountDocument = {
    source: SOURCE,
    statement: {
      bank: 'Migros Bank',
      document: 'Extrait de compte',
      language: 'fr',
      currency,
      holder: holder.names.length > 0 ? holder.names.join(', ') : null,
      iban,
      accountNumber: account?.[1] ?? null,
      periodFrom,
      periodTo,
      openingBalance: opening,
      closingBalance: totals.closing,
      totalDebits: totals.debits,
      totalCredits: totals.credits,
    },
    checks: {
      sumOfDebits,
      sumOfCredits,
      debitsMatchPrintedTotal: controls.checked('debits-total'),
      creditsMatchPrintedTotal: controls.checked('credits-total'),
      openingPlusCreditsMinusDebitsIsClosing: controls.checked('closing-balance'),
      // Vacuously true for a statement without a printed balance (no entries).
      printedBalancesMatchRunningBalance:
        controls.checked('running-balance') || raw.every((entry) => entry.balance === null),
      summaryBlockMatchesTable: (
        [
          'summary-opening-balance',
          'summary-debits',
          'summary-credits',
          'summary-closing-balance',
        ] as const
      ).every((id) => controls.checked(id)),
    },
    transactions,
    skipped,
  }
  return {
    document,
    identity: { kind: 'period', from: periodFrom, to: periodTo },
    period: { from: periodFrom, to: periodTo },
    entries,
    controls: controls.list,
  }
}

interface ReadEntry {
  transaction: MigrosAccountTransaction
  entry: StatementEntry
}

function readEntry(raw: RawEntry, n: number, holder: Holder, controls: Controls): ReadEntry {
  const firstCell = raw.lines[0]
  if (!firstCell) t.fail('malformed-entry', null)
  const firstLine = firstCell.line
  const malformed = (): never => t.fail('malformed-entry', firstLine)
  const textLines = raw.lines.map((cell) => cell.text).filter((text) => text !== '')

  // A long first text line swallows the value date: "<text> DD.MM.YY", no item at Valeur.
  let valueDate = raw.valueDate
  const lines = [...textLines]
  if (valueDate === null) {
    const glued = SHORT_DATE_AT_END.exec(lines[0] ?? '')
    if (!glued) t.fail('missing-field', firstLine)
    valueDate = t.requireDate(glued[2] ?? '', firstLine)
    lines[0] = glued[1] ?? ''
  }
  const text = collapseSpaces(lines.join(' '))

  const base = {
    n,
    page: raw.page,
    bookingDate: raw.bookingDate,
    valueDate,
    direction: raw.direction,
    amount: raw.amount,
    balanceAfter: raw.balance,
    text,
    textLines,
  }
  const debit = raw.direction === 'debit'
  let transaction: MigrosAccountTransaction
  let hint: EntryHint | null = null
  let fee: Rappen | null = null
  let originalText = ''
  let bankTransactionId: string | null = null

  const twint = /^(Débit|Crédit) TWINT (.+)$/.exec(text)
  const isCard = /^Achat /.test(text) || (/^Crédit /.test(text) && text.includes(' Carte: '))
  if (twint) {
    const [, verb = '', rest = ''] = twint
    if ((verb === 'Débit') !== debit) malformed()
    const person = TWINT_PERSON.exec(rest)
    const onePerson = person ? null : TWINT_PERSON_ONE_NAME.exec(rest)
    const merchantMatch = person || onePerson ? null : TWINT_MERCHANT.exec(rest)
    let merchant: string
    let counterparty: MigrosAccountTransaction['counterparty']
    let id: string
    if (person) {
      const [, last = '', firstName = '', phone = '', twintId = ''] = person
      merchant = `${last}, ${firstName}`
      counterparty = { type: 'person', name: `${firstName} ${last}`, phone }
      id = twintId
    } else if (onePerson) {
      const [, name = '', phone = '', twintId = ''] = onePerson
      merchant = name
      counterparty = { type: 'person', name, phone }
      id = twintId
    } else if (merchantMatch) {
      const [, name = '', twintId = ''] = merchantMatch
      merchant = name
      counterparty = { type: 'merchant', name }
      id = twintId
    } else {
      return malformed()
    }
    bankTransactionId = id
    // A payment to a phone number is a payment to a person; a merchant has none.
    if (debit && counterparty.type === 'person') hint = 'transfer-to-person'
    transaction = {
      ...base,
      purchaseDate: null,
      purchaseTime: null,
      date: raw.bookingDate,
      kind: debit ? 'twint-debit' : 'twint-credit',
      merchant,
      counterparty,
      reference: id,
      card: null,
      original: null,
      flags: [],
      description: `TWINT ${counterparty.name}`,
      handling: debit ? IMPORT : REVIEW_CREDIT,
    }
  } else if (isCard) {
    const card = CARD_ENTRY.exec(text)
    if (!card) return malformed()
    const [
      ,
      verb,
      merchant = '',
      date = '',
      hours = '',
      minutes = '',
      cardNumber = '',
      currency = '',
      amountText = '',
    ] = card
    const [rateCurrency, rateAmountText, rateText, feeText] = [
      card[9],
      card[10],
      card[11],
      card[12],
    ]
    if ((verb === 'Achat') !== debit) malformed()
    const purchaseDate = t.requireDate(date, firstLine)
    const printed = readAmount(amountText) ?? t.fail('unreadable-amount', firstLine)
    fee =
      feeText === undefined ? null : (readAmount(feeText) ?? t.fail('unreadable-amount', firstLine))
    let original: MigrosAccountTransaction['original'] = null
    let description = merchant
    if (currency === 'CHF') {
      if (rateText !== undefined) malformed()
      // The CHF amount in the text must be the amount booked (plus a fee, if any).
      controls.equal('card-purchase-amount', printed + (fee ?? 0), raw.amount, {
        entry: n,
        page: raw.page,
      })
    } else {
      if (rateText === undefined || rateCurrency !== currency || rateAmountText !== amountText)
        malformed()
      const rate = readDecimal(rateText ?? '') ?? t.fail('unreadable-amount', firstLine)
      const amountMinor = toMinorUnits(printed, currency) ?? t.fail('unreadable-amount', firstLine)
      const converted = multiplyByDecimal(printed, rate)
      // The bank rounds the converted amount plus fee (to 0.05 in the sample): within 0.05.
      controls.near(
        'foreign-currency-amount',
        raw.amount,
        {
          numerator: converted.numerator + BigInt(fee ?? 0) * converted.denominator,
          denominator: converted.denominator,
        },
        5,
        { entry: n, page: raw.page },
      )
      original = { currency, amountMinor, rate: rateText ?? '', fee }
      originalText = amountText
      description = `${merchant} (${currency} ${amountText})`
    }
    if (!debit) hint = 'refund'
    transaction = {
      ...base,
      purchaseDate,
      purchaseTime: `${hours}:${minutes}`,
      date: purchaseDate,
      kind: debit ? 'card-purchase' : 'card-refund',
      merchant,
      counterparty: null,
      reference: null,
      card: cardNumber,
      original,
      flags: [],
      description,
      handling: debit ? IMPORT : REVIEW_CREDIT,
    }
  } else if (text.startsWith('Paiement de salaire')) {
    const employer = text.slice('Paiement de salaire'.length).trim()
    if (debit || employer === '') malformed()
    hint = 'salary'
    transaction = {
      ...base,
      purchaseDate: null,
      purchaseTime: null,
      date: raw.bookingDate,
      kind: 'salary',
      merchant: employer,
      counterparty: { type: 'employer', name: employer },
      reference: null,
      card: null,
      original: null,
      flags: ['salary'],
      description: employer,
      handling: SKIP_IF_INCOME,
    }
  } else if (lines[0] === 'Paiement' || lines[0] === 'Ordre permanent') {
    const [, payee, ...rest] = lines
    if (!debit || payee === undefined) return malformed()
    const last = rest.at(-1)
    let reference: string | null = null
    let address = rest
    if (last !== undefined && QR_REFERENCE.test(last)) {
      reference = last.replace(/ /g, '')
      if (!isValidQrReference(reference)) t.fail('invalid-reference', firstLine)
      address = rest.slice(0, -1)
    }
    const flags: MigrosAccountFlag[] = []
    let handling: Handling = IMPORT
    // R-IMPORT-212: the card-bill payment, whatever Viseca's company name or case.
    if (/\bviseca\b/i.test(payee)) {
      flags.push('card-bill-payment')
      handling = SKIP_CARD_BILL_PAYMENT
      hint = 'card-bill-payment'
    } else if (
      holder.names.some((name) => sameName(name, payee)) &&
      sameAddress(address, holder.address)
    ) {
      // R-IMPORT-212: the holder's own name at the holder's address (in either name order).
      flags.push('own-account-transfer')
      handling = SKIP_OWN_TRANSFER
      hint = 'own-account-transfer'
    }
    transaction = {
      ...base,
      purchaseDate: null,
      purchaseTime: null,
      date: raw.bookingDate,
      kind: lines[0] === 'Paiement' ? 'payment' : 'standing-order',
      merchant: payee,
      counterparty: { type: 'payee', name: payee, address },
      reference,
      card: null,
      original: null,
      flags,
      description: payee,
      handling,
    }
  } else {
    const other = classifyOther(text)
    hint = other.hint
    transaction = {
      ...base,
      purchaseDate: null,
      purchaseTime: null,
      date: raw.bookingDate,
      kind: other.kind,
      merchant: null,
      counterparty: null,
      reference: null,
      card: null,
      original: null,
      flags: [],
      // R-IMPORT-211: only the label line; the rest may name third parties (it stays in textLines).
      description: lines[0] ?? text,
      handling: debit ? IMPORT : REVIEW_CREDIT,
    }
  }

  const entry: StatementEntry = {
    n,
    page: raw.page,
    date: transaction.date,
    direction: raw.direction,
    amount: raw.amount,
    description: transaction.description,
    merchant: transaction.merchant,
    bankTransactionId,
    hint,
    handling: transaction.handling.action,
    textLines,
    details: {
      ...emptyDetails(raw.bookingDate),
      valueDate,
      purchaseDate: transaction.purchaseDate,
      purchaseTime: transaction.purchaseTime,
      card: transaction.card,
      original: transaction.original && {
        currency: transaction.original.currency,
        amountMinor: transaction.original.amountMinor,
        amountText: originalText,
        rate: transaction.original.rate,
        rateDate: null,
        convertedChf: null,
      },
      fee: fee === null ? null : { amount: fee, percent: null },
      counterparty: transaction.counterparty,
      paymentReference:
        transaction.kind === 'payment' || transaction.kind === 'standing-order'
          ? transaction.reference
          : null,
      balanceAfter: raw.balance,
    },
  }
  return { transaction, entry }
}
