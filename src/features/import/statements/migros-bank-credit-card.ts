/**
 * Migros Bank credit-card bill issued through Viseca (Facture), French. Layout described in
 * docs/import-sources.md, section 3.
 */
import { addDays } from '@/lib/date'

import {
  COLUMN_TOLERANCE,
  Controls,
  IMPORT,
  REVIEW_CREDIT,
  column,
  endsUnder,
  emptyDetails,
  parserTools,
  tableOf,
  type ParserTools,
  startsAt,
  type Column,
} from './parse-support'
import {
  collapseSpaces,
  isValidQrReference,
  multiplyByDecimal,
  readAmount,
  readCardAmount,
  readDecimal,
  readWholeFrancs,
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
  CardBillCard,
  CardBillDocument,
  CardBillTransaction,
  EntryHint,
  Rappen,
  SkippedLine,
  StatementControl,
  StatementEntry,
  StatementIdentity,
} from './types'

const SOURCE = 'migros-bank-credit-card'

const HEADING = ['Date', 'valeur', 'Détails', 'Monnaie', 'Montant', 'CHF']
const PAGE_FOOTER = /^Page \d+\/\d+$/
const DATE = String.raw`\d{2}\.\d{2}\.\d{2}`
const PREVIOUS_TOTAL = new RegExp(String.raw`^(${DATE}) Montant total dernier relevé$`)
const ROW = new RegExp(String.raw`^(${DATE}) (${DATE}) (.+)$`)
const MASKED_CARD = String.raw`\d{4} [\dX]{4} [\dX]{4} \d{4}`
const CARD_HEADING = new RegExp(String.raw`^(${MASKED_CARD}) (.+), (.+)$`)
const CARD_TOTAL = new RegExp(String.raw`^Total carte (.+) (${MASKED_CARD})$`)
const CARD_LIMIT = /^Limite de carte CHF (\S+)$/
const RATE_LINE = new RegExp(String.raw`^Taux de conversion (\d+\.\d+) du (${DATE})$`)
const FEE_LINE = /^Frais de traitement (\d+(?:\.\d+)?)%$/
const INTEREST_RATE_LINE = /^Intérêt par année (\d+(?:\.\d+)?)%$/
const INTEREST_ROW = /^Intérêt moratoire pour (\d+) jours?$/
// Not seen in the sample: an assumption (Q-202).
const FEE_ROW = /^(Cotisation|Frais|Taxe|Commission)\b/i
const QR_REFERENCE = /^\d{2}(?: \d{5}){5}$/

export interface CardBillParse {
  document: CardBillDocument
  identity: StatementIdentity
  period: { from: CalendarDate; to: CalendarDate }
  entries: StatementEntry[]
  controls: StatementControl[]
}

interface Columns {
  date: Column
  valeur: Column
  details: Column
  currency: Column
  original: Column
  chf: Column
}

interface CellLine {
  line: TextLine
  left: TextItem[]
  text: string
  currency: string | null
  original: { amount: Rappen; text: string } | null
  chf: { amount: Rappen; credit: boolean } | null
}

interface Row {
  page: number
  section: 'header' | 'card'
  card: CardBillCard | null
  purchaseDate: CalendarDate
  bookingDate: CalendarDate
  details: string
  first: CellLine
  continuation: CellLine[]
}

const t: ParserTools = parserTools(SOURCE)

function headingColumns(line: TextLine): Columns | null {
  if (!hasItems(line, HEADING)) return null
  const get = (label: string): Column => {
    const item = findItem(line, label)
    if (!item) t.fail('missing-table', line)
    return column(item)
  }
  return {
    date: get('Date'),
    valeur: get('valeur'),
    details: get('Détails'),
    currency: get('Monnaie'),
    original: get('Montant'),
    chf: get('CHF'),
  }
}

function cells(line: TextLine, columns: Columns): CellLine {
  const left: TextItem[] = []
  let currency: string | null = null
  let original: CellLine['original'] = null
  let chf: CellLine['chf'] = null
  for (const item of line.items) {
    const text = collapseSpaces(item.str)
    if (item.oriented) {
      t.fail('unexpected-item', line)
    } else if (item.x < columns.currency.x - COLUMN_TOLERANCE) {
      left.push(item)
    } else if (item.x <= columns.currency.right && /^[A-Z]{3}$/.test(text)) {
      if (currency !== null) t.fail('unexpected-item', line)
      currency = text
    } else if (endsUnder(item, columns.original)) {
      const amount = readAmount(text)
      if (amount === null) t.fail('unreadable-amount', line)
      if (original) t.fail('entry-with-several-amounts', line)
      original = { amount, text }
    } else if (endsUnder(item, columns.chf)) {
      const amount = readCardAmount(text)
      if (amount === null) t.fail('unreadable-amount', line)
      if (chf) t.fail('entry-with-several-amounts', line)
      chf = amount
    } else {
      t.fail('unexpected-item', line)
    }
  }
  return { line, left, text: joinItems(left), currency, original, chf }
}

/** "<MERCHANT>, <LOCATION> <CC>": merchant before the last ", ", country the last two letters. */
function splitDetails(details: string): {
  merchant: string
  location: string | null
  country: string | null
} {
  const comma = details.lastIndexOf(', ')
  if (comma === -1) return { merchant: details, location: null, country: null }
  const place = details.slice(comma + 2)
  const country = /^(.*) ([A-Z]{2})$/.exec(place)
  return {
    merchant: details.slice(0, comma),
    location: country ? (country[1] ?? null) : place,
    country: country ? (country[2] ?? null) : null,
  }
}

function signed(amount: { amount: Rappen; credit: boolean }): Rappen {
  return amount.credit ? -amount.amount : amount.amount
}

/** The value printed after a label on page 1's bill block ("Facture du" "12.06.2025"). */
function blockValue(lines: TextLine[], label: string): { value: string; line: TextLine } | null {
  for (const line of lines) {
    const index = line.items.findIndex((item) => collapseSpaces(item.str) === label)
    if (index !== -1) return { value: joinItems(line.items.slice(index + 1)), line }
  }
  return null
}

interface PaymentSlip {
  amount: Rappen
  reference: string | null
}

/** The QR-bill payment part: every printed amount and reference must agree. */
function readPaymentSlip(pages: PageLines[]): PaymentSlip | null {
  const page = pages.find((candidate) =>
    candidate.lines.some((line) => line.items.some((item) => item.str === 'Section paiement')),
  )
  if (!page) return null
  const items = page.lines.flatMap((line) => line.items)
  const references = new Set(
    items
      .filter((item) => QR_REFERENCE.test(collapseSpaces(item.str)))
      .map((item) => item.str.replace(/\s/g, '')),
  )
  const amounts = new Set<Rappen>()
  for (const label of items.filter((item) => item.str === 'Montant')) {
    const below = items
      .filter(
        (item) => Math.abs(item.x - label.x) <= 3 && item.y < label.y - 2 && item.y > label.y - 20,
      )
      .sort((a, b) => b.y - a.y)[0]
    if (!below) continue
    const amount = readAmount(collapseSpaces(below.str))
    if (amount === null) t.fail('unreadable-amount', { page: page.page, text: below.str })
    amounts.add(amount)
  }
  if (references.size > 1 || amounts.size > 1)
    t.fail('inconsistent-document', { page: page.page, text: 'Section paiement' })
  const [reference] = references
  const [amount] = amounts
  if (reference !== undefined && !isValidQrReference(reference)) {
    t.fail('invalid-reference', { page: page.page, text: reference })
  }
  return amount === undefined ? null : { amount, reference: reference ?? null }
}

export function parseCardBill(pages: PageLines[]): CardBillParse {
  const controls = new Controls(SOURCE)
  const first = pages[0]
  if (!first) t.fail('missing-table', null)

  const billDateValue = blockValue(first.lines, 'Facture du')
  if (!billDateValue) t.fail('missing-field', null)
  const billDate = t.requireDate(billDateValue.value, billDateValue.line)
  const dueValue =
    blockValue(first.lines, "Payable jusqu'au") ?? blockValue(first.lines, 'Payable jusqu’au')
  const dueDate = dueValue ? t.requireDate(dueValue.value, dueValue.line) : null
  const accountValue = blockValue(first.lines, 'No du compte de la carte')
  const cardAccount = accountValue ? accountValue.value.replace(/\s/g, '') : null
  const holder = blockValue(first.lines, 'Titulaire du compte')?.value ?? null
  const limitValue = blockValue(first.lines, 'Limite globale')
  const globalLimit = limitValue
    ? (readWholeFrancs(limitValue.value.replace(/^CHF /, '')) ??
      t.fail('unreadable-amount', limitValue.line))
    : null

  const skippedPrevious: SkippedLine[] = []
  const skippedPayments: SkippedLine[] = []
  const skippedHeadings: SkippedLine[] = []
  const skippedLimits: SkippedLine[] = []
  const skippedOthers: SkippedLine[] = []
  const skip = (list: SkippedLine[], line: TextLine, reason: string) => {
    list.push({ page: line.page, text: line.text, reason })
  }

  let previousTotal: Rappen | null = null
  let previousDate: CalendarDate | null = null
  let payments: Rappen | null = null
  let headerCharges = 0
  const cards: CardBillCard[] = []
  const cardTotals: Rappen[] = []
  let openCard: CardBillCard | null = null
  let openCardSum = 0
  let cardRowsSum = 0
  let lastCardSubtotal: Rappen | null = null
  let lastBillSubtotal: Rappen | null = null
  let page1CardSubtotal: Rappen | null = null
  let billTotal: Rappen | null = null
  let amountDue: Rappen | null = null
  let tableSeen = false
  const rows: Row[] = []
  // The row continuation lines attach to; kept across the subtotal and carried-forward lines
  // of a page break, so that a row may continue on the next page.
  let currentRow: Row | null = null

  const billSoFar = () => (previousTotal ?? 0) - (payments ?? 0) + headerCharges + cardRowsSum

  // Text after "Montant dû" (the Cumulus block, marketing, the payment slip) is not a table.
  pageLoop: for (const page of pages) {
    const table = tableOf(page, headingColumns, PAGE_FOOTER)
    if (!table) continue
    tableSeen = true
    const { columns } = table

    for (const line of table.lines) {
      if (amountDue !== null) break pageLoop
      const cell = cells(line, columns)
      const firstItem = cell.left[0]
      const text = cell.text
      const noAmounts = cell.chf === null && cell.original === null && cell.currency === null
      const onlyChf = cell.chf !== null && cell.original === null && cell.currency === null
      const chf = cell.chf

      const previous = PREVIOUS_TOTAL.exec(text)
      if (previous && firstItem && startsAt(firstItem, columns.valeur.x)) {
        if (
          !onlyChf ||
          !chf ||
          chf.credit ||
          previousTotal !== null ||
          openCard ||
          cards.length > 0
        ) {
          t.fail('unexpected-line', line)
        }
        previousTotal = chf.amount
        previousDate = t.requireDate(previous[1] ?? '', line)
        skip(
          skippedPrevious,
          line,
          'previous bill total (Montant total dernier relevé), not a transaction',
        )
        currentRow = null
        continue
      }
      const row = ROW.exec(text)
      if (row && firstItem && startsAt(firstItem, columns.date.x)) {
        if (!chf) t.fail('entry-without-amount', line)
        if (cell.currency !== null && cell.original === null) t.fail('malformed-entry', line)
        if (cell.currency === null && cell.original !== null) t.fail('malformed-entry', line)
        const purchaseDate = t.requireDate(row[1] ?? '', line)
        const bookingDate = t.requireDate(row[2] ?? '', line)
        if (bookingDate > billDate || (previousDate !== null && bookingDate < previousDate)) {
          t.fail('entry-outside-period', line)
        }
        if (cards.length > 0 && !openCard) t.fail('unexpected-line', line)
        if (!openCard) {
          // R-IMPORT-215: before the first card, a credit is the payment received, whatever its
          // label; a debit must be a charge this parser knows.
          if (chf.credit) {
            if (!onlyChf) t.fail('unexpected-line', line)
            payments = (payments ?? 0) + chf.amount
            skip(
              skippedPayments,
              line,
              'payment received (trailing minus = credit); the matching debit is the card-bill payment on the bank account',
            )
            currentRow = null
            continue
          }
          if (!INTEREST_ROW.test(row[3] ?? '') && !FEE_ROW.test(row[3] ?? '')) {
            t.fail('unexpected-line', line)
          }
        }
        currentRow = {
          page: line.page,
          section: openCard ? 'card' : 'header',
          card: openCard,
          purchaseDate,
          bookingDate,
          details: row[3] ?? '',
          first: cell,
          continuation: [],
        }
        rows.push(currentRow)
        if (openCard) {
          openCardSum += signed(chf)
          cardRowsSum += signed(chf)
        } else {
          headerCharges += signed(chf)
        }
        continue
      }
      const heading = CARD_HEADING.exec(text)
      if (heading && firstItem && startsAt(firstItem, columns.date.x) && noAmounts) {
        const card = {
          masked: heading[1] ?? '',
          product: heading[2] ?? '',
          holder: heading[3] ?? '',
        }
        if (openCard) {
          // The heading repeats at the top of the next page while the card continues.
          if (openCard.masked !== card.masked) t.fail('unexpected-line', line)
        } else {
          if (cards.some((known) => known.masked === card.masked))
            t.fail('inconsistent-document', line)
          cards.push(card)
          openCard = card
          openCardSum = 0
          lastCardSubtotal = null
          currentRow = null
        }
        skip(skippedHeadings, line, 'card section heading (card number, product, holder)')
        continue
      }
      const limit = CARD_LIMIT.exec(text)
      if (limit && noAmounts) {
        if (!openCard) t.fail('unexpected-line', line)
        if (readWholeFrancs(limit[1] ?? '') === null) t.fail('unreadable-amount', line)
        skip(skippedLimits, line, 'card limit')
        continue
      }
      if (text === 'Total intermédiaire de la carte' && onlyChf && chf) {
        if (!openCard || chf.credit) t.fail('unexpected-line', line)
        controls.equal('card-page-subtotal', chf.amount, openCardSum, { page: line.page })
        lastCardSubtotal = chf.amount
        if (line.page === first.page && page1CardSubtotal === null) page1CardSubtotal = chf.amount
        skip(skippedOthers, line, 'page subtotal of the card')
        continue
      }
      if (text === 'Total intermédiaire' && onlyChf && chf) {
        if (chf.credit) t.fail('unexpected-line', line)
        controls.equal('bill-page-subtotal', chf.amount, billSoFar(), { page: line.page })
        lastBillSubtotal = chf.amount
        skip(skippedOthers, line, 'page subtotal of the bill')
        continue
      }
      if (text === 'Report total' && onlyChf && chf) {
        if (lastBillSubtotal === null || chf.credit) t.fail('unexpected-line', line)
        controls.equal('bill-carried-forward', chf.amount, lastBillSubtotal, { page: line.page })
        skip(skippedOthers, line, 'bill subtotal carried from the previous page')
        continue
      }
      if (text === 'Report de la carte' && onlyChf && chf) {
        if (!openCard || lastCardSubtotal === null || chf.credit) t.fail('unexpected-line', line)
        controls.equal('card-carried-forward', chf.amount, lastCardSubtotal, { page: line.page })
        skip(skippedOthers, line, 'card subtotal carried from the previous page')
        continue
      }
      const cardTotal = CARD_TOTAL.exec(text)
      if (cardTotal && onlyChf && chf) {
        if (!openCard || cardTotal[2] !== openCard.masked || chf.credit)
          t.fail('unexpected-line', line)
        controls.equal('card-total', chf.amount, openCardSum, { page: line.page })
        cardTotals.push(chf.amount)
        openCard = null
        currentRow = null
        skip(skippedOthers, line, 'card total')
        continue
      }
      if (text === 'Montant total de la facture en notre faveur' && onlyChf && chf) {
        if (openCard || billTotal !== null || chf.credit) t.fail('unexpected-line', line)
        controls.equal('bill-total', chf.amount, billSoFar(), { page: line.page })
        billTotal = chf.amount
        currentRow = null
        skip(skippedOthers, line, 'bill total')
        continue
      }
      if (text === 'Montant dû' && onlyChf && chf) {
        if (billTotal === null || chf.credit) t.fail('unexpected-line', line)
        controls.equal('amount-due', chf.amount, billTotal, { page: line.page })
        amountDue = chf.amount
        skip(skippedOthers, line, 'amount due')
        continue
      }

      // A continuation line of the current row, under the Détails column.
      if (!currentRow || !firstItem || !startsAt(firstItem, columns.details.x) || chf) {
        t.fail('unexpected-line', line)
      }
      currentRow.continuation.push(cell)
    }
  }

  if (!tableSeen) t.fail('missing-table', null)
  if (openCard || billTotal === null || amountDue === null) t.fail('missing-field', null)

  const slip = readPaymentSlip(pages)
  if (slip) controls.equal('payment-slip-amount', slip.amount, amountDue)

  const transactions: CardBillTransaction[] = []
  const entries: StatementEntry[] = []
  rows.forEach((row, index) => {
    const { transaction, entry } = readRow(row, index + 1, controls)
    transactions.push(transaction)
    entries.push(entry)
  })

  const document: CardBillDocument = {
    source: SOURCE,
    statement: {
      bank: 'Migros Bank',
      issuer: 'Viseca Payment Services SA',
      document: 'Facture (carte de crédit)',
      language: 'fr',
      currency: 'CHF',
      billDate,
      dueDate,
      cardAccount,
      holder,
      globalLimit,
      cards,
      previousBillTotal: previousTotal,
      paymentReceived: payments,
      interest: transactions
        .filter((transaction) => transaction.kind === 'interest')
        .reduce(
          (sum, transaction) =>
            sum + (transaction.direction === 'debit' ? transaction.amount : -transaction.amount),
          0,
        ),
      cardTotal: cardTotals.reduce((sum, total) => sum + total, 0),
      billTotal,
      amountDue,
      paymentSlip: slip,
    },
    checks: {
      sumOfCardLines: cardRowsSum,
      cardLinesMatchCardTotal: controls.checked('card-total'),
      billTotalIsPreviousMinusPaymentPlusInterestPlusCards: controls.checked('bill-total'),
      page1CardSubtotal,
      page1CardLinesMatchSubtotal:
        page1CardSubtotal === null ? null : controls.checked('card-page-subtotal'),
      amountDueEqualsBillTotal: controls.checked('amount-due'),
      slipAmountEqualsAmountDue: slip ? controls.checked('payment-slip-amount') : null,
    },
    transactions,
    skipped: [
      ...skippedPrevious,
      ...skippedPayments,
      ...skippedHeadings,
      ...skippedLimits,
      ...skippedOthers,
    ],
  }
  return {
    document,
    identity: { kind: 'bill', billDate, dueDate },
    period: {
      from:
        previousDate !== null
          ? addDays(previousDate, 1)
          : rows.reduce(
              (earliest, row) => (row.bookingDate < earliest ? row.bookingDate : earliest),
              billDate,
            ),
      to: billDate,
    },
    entries,
    controls: controls.list,
  }
}

function readRow(
  row: Row,
  n: number,
  controls: Controls,
): { transaction: CardBillTransaction; entry: StatementEntry } {
  const firstLine = row.first.line
  const malformed = (): never => t.fail('malformed-entry', firstLine)
  const chf = row.first.chf ?? malformed()
  const direction = chf.credit ? 'credit' : 'debit'
  const details = row.details
  const textLines = [details, ...row.continuation.map((cell) => cell.line.text)]
  const context = { entry: n, page: row.page }

  let rate: { text: string; date: CalendarDate; converted: Rappen } | null = null
  let fee: { percent: string; amount: Rappen } | null = null
  let interestRate: string | null = null
  let category: string | null = null
  for (const cell of row.continuation) {
    const rateMatch = RATE_LINE.exec(cell.text)
    const feeMatch = FEE_LINE.exec(cell.text)
    const interestMatch = INTEREST_RATE_LINE.exec(cell.text)
    const chfLine = cell.currency === 'CHF' && cell.original !== null && cell.chf === null
    if (rateMatch && chfLine && cell.original && !rate) {
      rate = {
        text: rateMatch[1] ?? '',
        date: t.requireDate(rateMatch[2] ?? '', cell.line),
        converted: cell.original.amount,
      }
    } else if (feeMatch && chfLine && cell.original && !fee) {
      fee = { percent: feeMatch[1] ?? '', amount: cell.original.amount }
    } else if (
      interestMatch &&
      cell.currency === null &&
      cell.original === null &&
      interestRate === null
    ) {
      interestRate = interestMatch[1] ?? ''
    } else if (cell.currency === null && cell.original === null) {
      // The merchant category; any further text line is kept in textLines only.
      category ??= cell.text
    } else {
      t.fail('unexpected-line', cell.line)
    }
  }

  const common = {
    n,
    page: row.page,
    purchaseDate: row.purchaseDate,
    bookingDate: row.bookingDate,
    date: row.purchaseDate,
    direction,
    amount: chf.amount,
    flags: [] as [],
    text: details,
    textLines,
  } as const

  let transaction: CardBillTransaction
  let hint: EntryHint | null = null
  let originalText: string | null = null
  if (row.section === 'header') {
    const interest = INTEREST_ROW.exec(details)
    if (rate || fee || row.first.currency !== null) malformed()
    const kind = interest ? 'interest' : 'fee'
    hint = kind
    if (kind !== 'interest' && interestRate !== null) malformed()
    transaction = {
      ...common,
      kind,
      merchant: null,
      location: null,
      country: null,
      category: null,
      card: null,
      original: null,
      fee: null,
      interestRate,
      days: interest ? Number(interest[1]) : null,
      description: details,
      handling: direction === 'debit' ? IMPORT : REVIEW_CREDIT,
    }
  } else {
    if (interestRate !== null) malformed()
    const place = splitDetails(details)
    const currency = row.first.currency
    const original = row.first.original
    let originalField: CardBillTransaction['original'] = null
    let description = place.merchant
    if (currency === null || original === null) {
      // A domestic CHF purchase: no original amount, no conversion, no fee.
      if (rate || fee) malformed()
    } else if (currency === 'CHF') {
      // A CHF amount charged abroad: a fee, no conversion; billed = amount + fee, rounded.
      if (rate) malformed()
      if (fee) checkFee(controls, fee, original.amount, context)
      controls.near(
        'chf-amount-plus-fee',
        chf.amount,
        { numerator: BigInt(original.amount + (fee?.amount ?? 0)), denominator: 1n },
        5,
        context,
      )
      originalField = { currency, amountMinor: original.amount }
    } else {
      if (!rate) return malformed()
      const rateValue = readDecimal(rate.text) ?? t.fail('unreadable-amount', firstLine)
      controls.near(
        'conversion',
        rate.converted,
        multiplyByDecimal(original.amount, rateValue),
        5,
        context,
      )
      if (fee) checkFee(controls, fee, rate.converted, context)
      controls.equal('converted-plus-fee', chf.amount, rate.converted + (fee?.amount ?? 0), context)
      originalField = {
        currency,
        amountMinor:
          toMinorUnits(original.amount, currency) ?? t.fail('unreadable-amount', firstLine),
        rate: rate.text,
        rateDate: rate.date,
        chfConverted: rate.converted,
      }
      originalText = original.text
      description = `${place.merchant} (${currency} ${original.text})`
    }
    if (direction === 'credit') hint = 'refund'
    // From the leading label or Viseca's category only, never from inside a merchant name.
    else if (/^retraits?\b/i.test(details) || /^retraits?\b/i.test(category ?? '')) {
      hint = 'cash-withdrawal'
    }
    transaction = {
      ...common,
      kind: direction === 'credit' ? 'card-refund' : 'card-purchase',
      merchant: place.merchant,
      location: place.location,
      country: place.country,
      category,
      card: row.card?.masked ?? null,
      original: originalField,
      fee,
      description,
      handling: direction === 'debit' ? IMPORT : REVIEW_CREDIT,
    }
  }

  const original = transaction.original
  const entry: StatementEntry = {
    n,
    page: row.page,
    date: transaction.date,
    direction,
    amount: chf.amount,
    description: transaction.description,
    merchant: transaction.merchant,
    bankTransactionId: null,
    hint,
    handling: transaction.handling.action,
    textLines,
    details: {
      ...emptyDetails(row.bookingDate),
      purchaseDate: row.purchaseDate,
      card: transaction.card,
      original: original && {
        currency: original.currency,
        amountMinor: original.amountMinor,
        amountText: originalText ?? row.first.original?.text ?? '',
        rate: 'rate' in original ? original.rate : null,
        rateDate: 'rateDate' in original ? original.rateDate : null,
        convertedChf: 'chfConverted' in original ? original.chfConverted : null,
      },
      fee: transaction.fee && { amount: transaction.fee.amount, percent: transaction.fee.percent },
      category: transaction.category,
      location: transaction.location,
      country: transaction.country,
      interest:
        transaction.kind === 'interest'
          ? { ratePercent: transaction.interestRate, days: transaction.days }
          : null,
    },
  }
  return { transaction, entry }
}

/** The processing fee is the printed percentage of the amount it applies to, rounded (to 0.05). */
function checkFee(
  controls: Controls,
  fee: { percent: string; amount: Rappen },
  base: Rappen,
  context: { entry: number; page: number },
): void {
  const percent = readDecimal(fee.percent.includes('.') ? fee.percent : `${fee.percent}.0`)
  if (!percent) return
  const product = multiplyByDecimal(base, percent)
  controls.near(
    'conversion-fee',
    fee.amount,
    { numerator: product.numerator, denominator: product.denominator * 100n },
    5,
    context,
  )
}
