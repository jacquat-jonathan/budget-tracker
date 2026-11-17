/**
 * From a parsed statement to the rows the import function takes. Pure: the screens send the
 * rows (in chunks of at most IMPORT_CHUNK_SIZE) and show the database's answer for each row
 * next to its statement entry, by `n`.
 *
 * A row holds only the keys of the import function's contract. Never in a row: the
 * counterparty's phone number, address or IBAN, the statement's text lines, QR references,
 * balances, and the holder's name or address (an own transfer goes without description and
 * merchant, since its payee is the holder).
 *
 * `details` encodes amounts as integers: `fee` in rappen, `original_amount` in the minor unit
 * of `original_currency` (cents for EUR, yen for JPY), always together with the currency; the
 * exchange rate is the decimal string as printed, never a float.
 */
import type {
  CalendarDate,
  EntryHint,
  ParsedStatement,
  Rappen,
  StatementEntry,
  StatementSource,
} from './types'

export const IMPORT_CHUNK_SIZE = 500
export const MAX_DESCRIPTION_LENGTH = 500
export const MAX_MERCHANT_LENGTH = 200
export const MAX_BANK_TRANSACTION_ID_LENGTH = 100
export const MAX_DETAILS_BYTES = 2000
export const MAX_ROW_AMOUNT = 1_000_000_000

export type ImportSource = 'migros_account' | 'migros_card' | 'yuh'

export type ImportHint =
  | 'card_bill_payment'
  | 'own_transfer'
  | 'transfer_to_person'
  | 'salary'
  | 'interest'
  | 'fee'
  | 'securities_purchase'
  | 'cash_withdrawal'
  | 'refund'

export interface ImportRowDetails {
  purchase_time?: string
  booking_date?: CalendarDate
  value_date?: CalendarDate
  card?: string
  original_currency?: string
  /** In the minor unit of `original_currency`. */
  original_amount?: number
  /** As printed, e.g. "0.9041442". */
  exchange_rate?: string
  /** In rappen. */
  fee?: Rappen
  merchant_category?: string
  /** The ISIN of the security bought. */
  security?: string
  /** Place and country code of a card purchase ("LILLE FR"). */
  location?: string
}

export type ImportDetailKey = keyof ImportRowDetails

export interface ImportRow {
  date: CalendarDate
  amount: Rappen
  direction: 'debit' | 'credit'
  description?: string
  merchant?: string
  bank_transaction_id?: string
  hint?: ImportHint
  details?: ImportRowDetails
}

export const IMPORT_ROW_KEYS = [
  'date',
  'amount',
  'direction',
  'description',
  'merchant',
  'bank_transaction_id',
  'hint',
  'details',
] as const satisfies readonly (keyof ImportRow)[]

/**
 * Details keys in the order they are dropped when `details` would exceed MAX_DETAILS_BYTES:
 * the least useful for recognising the purchase first. The original currency and amount go
 * together.
 */
export const DETAILS_DROP_ORDER = [
  'location',
  'security',
  'merchant_category',
  'exchange_rate',
  'original_amount',
  'fee',
  'card',
  'value_date',
  'purchase_time',
  'booking_date',
] as const satisfies readonly ImportDetailKey[]

export type ImportAdjustment =
  | { n: number; field: 'description' | 'merchant'; change: 'truncated' }
  | { n: number; field: 'bank_transaction_id'; change: 'dropped' }
  | { n: number; field: 'details'; change: 'dropped'; keys: ImportDetailKey[] }

export interface ImportBatch {
  source: ImportSource
  statementFrom: CalendarDate
  statementTo: CalendarDate
  /** In statement order; `n` is the entry's number, beside the row, never inside it. */
  rows: { n: number; row: ImportRow }[]
  /** Entries that produce no row. */
  notSent: { n: number; code: 'zero-amount' | 'amount-too-large' }[]
  /** Where a row was shortened to fit the contract rather than refused by the database. */
  adjustments: ImportAdjustment[]
}

const SOURCES: Record<StatementSource, ImportSource> = {
  'migros-bank-account': 'migros_account',
  'migros-bank-credit-card': 'migros_card',
  'yuh-account': 'yuh',
}

const HINTS: Record<EntryHint, ImportHint> = {
  'card-bill-payment': 'card_bill_payment',
  'own-account-transfer': 'own_transfer',
  'transfer-to-person': 'transfer_to_person',
  salary: 'salary',
  interest: 'interest',
  fee: 'fee',
  'securities-purchase': 'securities_purchase',
  'cash-withdrawal': 'cash_withdrawal',
  refund: 'refund',
}

/** Cut to at most `max` characters (code points, never inside one), trimmed. */
function fit(text: string, max: number): { text: string; truncated: boolean } {
  const trimmed = text.trim()
  const characters = Array.from(trimmed)
  if (characters.length <= max) return { text: trimmed, truncated: false }
  return { text: characters.slice(0, max).join('').trim(), truncated: true }
}

function byteLength(details: ImportRowDetails): number {
  return new TextEncoder().encode(JSON.stringify(details)).length
}

function detailsOf(entry: StatementEntry): ImportRowDetails {
  const { details } = entry
  const out: ImportRowDetails = { booking_date: details.bookingDate }
  if (details.purchaseTime !== null) out.purchase_time = details.purchaseTime
  if (details.valueDate !== null) out.value_date = details.valueDate
  if (details.card !== null) out.card = details.card
  if (details.original !== null) {
    out.original_currency = details.original.currency
    out.original_amount = details.original.amountMinor
    if (details.original.rate !== null) out.exchange_rate = details.original.rate
  }
  if (details.fee !== null) out.fee = details.fee.amount
  if (details.category !== null) out.merchant_category = details.category
  if (details.security !== null) out.security = details.security.isin
  const place = [details.location, details.country].filter((part) => part !== null).join(' ')
  if (place !== '') out.location = place
  return out
}

// R-IMPORT-219: only the contract's keys, within its bounds; no personal data beyond the entry.
function toRow(entry: StatementEntry, adjustments: ImportAdjustment[]): ImportRow {
  const row: ImportRow = { date: entry.date, amount: entry.amount, direction: entry.direction }
  const { n } = entry
  // The payee of an own transfer is the holder: no name in the row.
  const ownTransfer = entry.hint === 'own-account-transfer'
  if (!ownTransfer) {
    const description = fit(entry.description, MAX_DESCRIPTION_LENGTH)
    if (description.text !== '') row.description = description.text
    if (description.truncated) adjustments.push({ n, field: 'description', change: 'truncated' })
    if (entry.merchant !== null) {
      const merchant = fit(entry.merchant, MAX_MERCHANT_LENGTH)
      if (merchant.text !== '') row.merchant = merchant.text
      if (merchant.truncated) adjustments.push({ n, field: 'merchant', change: 'truncated' })
    }
  }
  if (entry.bankTransactionId !== null) {
    // A shortened id would be another id: drop it instead.
    if (entry.bankTransactionId.length <= MAX_BANK_TRANSACTION_ID_LENGTH) {
      row.bank_transaction_id = entry.bankTransactionId
    } else {
      adjustments.push({ n, field: 'bank_transaction_id', change: 'dropped' })
    }
  }
  if (entry.hint !== null) row.hint = HINTS[entry.hint]
  const details = detailsOf(entry)
  const dropped: ImportDetailKey[] = []
  for (const key of DETAILS_DROP_ORDER) {
    if (byteLength(details) <= MAX_DETAILS_BYTES) break
    if (details[key] === undefined) continue
    details[key] = undefined
    dropped.push(key)
    if (key === 'original_amount' && details.original_currency !== undefined) {
      details.original_currency = undefined
      dropped.push('original_currency')
    }
  }
  if (dropped.length > 0)
    adjustments.push({ n, field: 'details', change: 'dropped', keys: dropped })
  const kept = Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined),
  ) as ImportRowDetails
  if (Object.keys(kept).length > 0) row.details = kept
  return row
}

/** The rows of a parsed statement for the import function, with what was left out and why. */
export function toImportBatch(statement: ParsedStatement): ImportBatch {
  const rows: ImportBatch['rows'] = []
  const notSent: ImportBatch['notSent'] = []
  const adjustments: ImportAdjustment[] = []
  for (const entry of statement.entries) {
    // R-IMPORT-220: the import function refuses 0.00; such an entry produces no row.
    if (entry.amount === 0) notSent.push({ n: entry.n, code: 'zero-amount' })
    else if (entry.amount > MAX_ROW_AMOUNT) notSent.push({ n: entry.n, code: 'amount-too-large' })
    else rows.push({ n: entry.n, row: toRow(entry, adjustments) })
  }
  return {
    source: SOURCES[statement.source],
    statementFrom: statement.period.from,
    statementTo: statement.period.to,
    rows,
    notSent,
    adjustments,
  }
}

/** Rows in chunks of at most `size` (the import function takes at most 500 per call). */
export function chunkRows<T>(rows: readonly T[], size = IMPORT_CHUNK_SIZE): T[][] {
  const chunks: T[][] = []
  for (let start = 0; start < rows.length; start += size)
    chunks.push(rows.slice(start, start + size))
  return chunks
}
