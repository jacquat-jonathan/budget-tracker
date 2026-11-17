/**
 * Types of the statement import (step 6): the pdf.js text items a statement is read from, and
 * the typed result of reading it. Everything here is data: no user-facing text. The screens
 * translate the codes (sources, hints, refusal reasons, control ids) into English or French.
 *
 * Amounts are integer rappen (CHF minor units) unless a field says otherwise; dates are
 * calendar dates "YYYY-MM-DD", never timestamps.
 */

/** A calendar date "YYYY-MM-DD" (never a timestamp, never run through a time zone). */
export type CalendarDate = string

/** An amount in integer rappen (1 CHF = 100 rappen). */
export type Rappen = number

// ---------------------------------------------------------------------------------------------
// Input: pdf.js text items (format "pdfjs-text-items/1", see test-fixtures/statements/README.md)
// ---------------------------------------------------------------------------------------------

/** Extra data of an item whose text is rotated or skewed, or not left to right. */
export interface TextItemExtra {
  transform?: number[]
  dir?: string
}

/**
 * One pdf.js `TextItem`: string, x and y of the baseline (PDF points, origin bottom left),
 * width, height, short font id, end-of-line flag (0 or 1), and optionally the extra data.
 */
export type TextItemTuple =
  | [str: string, x: number, y: number, width: number, height: number, font: string, eol: number]
  | [
      str: string,
      x: number,
      y: number,
      width: number,
      height: number,
      font: string,
      eol: number,
      extra: TextItemExtra,
    ]

export interface TextPage {
  page: number
  width: number
  height: number
  items: TextItemTuple[]
}

export interface TextFontStyle {
  family: string
  ascent: number
  descent: number
}

/** The text layer of a PDF, as `loadStatementPdf` returns it and the fixtures store it. */
export interface StatementTextDocument {
  format: 'pdfjs-text-items/1'
  pdfjs: string
  /** Present in the fixtures only, and never read: the source is recognised from the text. */
  source?: string
  item: string[]
  fonts: Record<string, TextFontStyle>
  pages: TextPage[]
}

// ---------------------------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------------------------

export type StatementSource = 'migros-bank-account' | 'migros-bank-credit-card' | 'yuh-account'

/** What identifies a statement for the user, without personal data. */
export type StatementIdentity =
  | { kind: 'period'; from: CalendarDate; to: CalendarDate }
  | { kind: 'bill'; billDate: CalendarDate; dueDate: CalendarDate | null }

export type Direction = 'debit' | 'credit'

/** What the statement says a line is. */
export type EntryHint =
  | 'card-bill-payment'
  | 'own-account-transfer'
  | 'salary'
  | 'interest'
  | 'fee'
  | 'securities-purchase'
  | 'cash-withdrawal'
  | 'refund'
  | 'transfer-to-person'

/**
 * The proposed default for an entry. `nothing-to-import`: an entry of 0.00, kept in the list
 * for the user to see, never sent to the import function.
 */
export type HandlingAction =
  'import' | 'skip-by-default' | 'skip-if-matches-income' | 'review-credit' | 'nothing-to-import'

export interface OriginalAmount {
  /** ISO currency code as printed (EUR, USD, also CHF for a CHF amount charged abroad). */
  currency: string
  /** The amount in the minor unit of that currency. */
  amountMinor: number
  /** The amount exactly as printed, for display ("1'234.50"). */
  amountText: string
  /** Exchange rate as printed (a decimal string, never a float), when printed. */
  rate: string | null
  rateDate: CalendarDate | null
  /** The converted CHF amount before fees, when printed (card bill). */
  convertedChf: Rappen | null
}

export interface EntryFee {
  amount: Rappen
  /** Percentage as printed ("1.75"), when printed. */
  percent: string | null
}

export interface SecurityDetails {
  name: string
  isin: string
  /** Quantity as printed (a decimal string). */
  quantity: string
  /** Price in the minor unit of `priceCurrency`. */
  price: number
  priceCurrency: string
  grossAmount: Rappen
  commission: Rappen
  tax: Rappen
  venue: string | null
}

export type Counterparty =
  | { type: 'person'; name: string; phone: string | null }
  | { type: 'merchant'; name: string }
  | { type: 'payee'; name: string; address: string[] }
  | { type: 'payer'; name: string; address: string[]; iban: string | null }
  | { type: 'employer'; name: string }

/** The extra data the statement gives for an entry, for the review screen. */
export interface EntryDetails {
  bookingDate: CalendarDate
  valueDate: CalendarDate | null
  purchaseDate: CalendarDate | null
  /** "HH:MM" as printed (Migros Bank account card purchases). */
  purchaseTime: string | null
  /** The masked card as printed. */
  card: string | null
  original: OriginalAmount | null
  fee: EntryFee | null
  /** Merchant category (card bill). */
  category: string | null
  location: string | null
  country: string | null
  security: SecurityDetails | null
  counterparty: Counterparty | null
  /** A QR or payment reference: never a bank transaction id. */
  paymentReference: string | null
  /** The balance the statement prints after this entry, when it prints one. */
  balanceAfter: Rappen | null
  /** Interest rate and number of days of an interest line, when printed. */
  interest: { ratePercent: string | null; days: number | null } | null
}

/** One candidate transaction: one entry of the statement's transaction table. */
export interface StatementEntry {
  /** 1-based position in the statement. */
  n: number
  /** Page of the entry's first line. */
  page: number
  /** The purchase date when the statement gives one, otherwise the booking date. */
  date: CalendarDate
  direction: Direction
  /** Always positive; `direction` says which way. */
  amount: Rappen
  /** The proposed stored description. */
  description: string
  /** The merchant or counterparty string as printed, when the layout isolates one. */
  merchant: string | null
  /** A stable bank transaction id (TWINT id, Yuh reference), never a QR reference. */
  bankTransactionId: string | null
  hint: EntryHint | null
  handling: HandlingAction
  details: EntryDetails
  /** All text lines of the entry, as printed. */
  textLines: string[]
}

export type ControlId =
  // all sources
  | 'debits-total'
  | 'credits-total'
  | 'closing-balance'
  | 'running-balance'
  // Migros Bank account
  | 'summary-opening-balance'
  | 'summary-debits'
  | 'summary-credits'
  | 'summary-closing-balance'
  | 'final-balance'
  | 'card-purchase-amount'
  | 'foreign-currency-amount'
  // card bill
  | 'card-page-subtotal'
  | 'bill-page-subtotal'
  | 'card-carried-forward'
  | 'bill-carried-forward'
  | 'card-total'
  | 'bill-total'
  | 'amount-due'
  | 'payment-slip-amount'
  | 'conversion'
  | 'conversion-fee'
  | 'converted-plus-fee'
  | 'chf-amount-plus-fee'
  // Yuh
  | 'opening-row'
  | 'closing-row'
  | 'summary-currency-closing-balance'
  | 'securities-amount'
  | 'securities-quantity'

/**
 * A figure the statement prints, compared with what the parse computes from the entries.
 * `tolerance` 0 means the two must be equal; otherwise their difference must be smaller than
 * `tolerance` rappen (used only where the statement rounds a product, such as an exchange rate).
 */
export interface StatementControl {
  id: ControlId
  page: number | null
  /** The entry the control is about, when it is about one. */
  entry: number | null
  /** Currency of the figures (rappen for CHF). */
  currency: string
  printed: number
  computed: number
  tolerance: number
}

/** Why a line inside the transaction area was not understood. */
export type LayoutProblem =
  | 'missing-table'
  | 'missing-field'
  | 'unexpected-item'
  | 'unexpected-line'
  | 'unreadable-amount'
  | 'unreadable-date'
  | 'entry-without-amount'
  | 'entry-with-several-amounts'
  | 'malformed-entry'
  | 'entry-outside-period'
  | 'invalid-reference'
  | 'inconsistent-document'

export type UnsupportedLanguage = 'de' | 'it' | 'en' | 'unknown'

export type StatementRefusal =
  /** The file has no text layer (a scan, an image): nothing to read. */
  | { reason: 'no-text-layer' }
  /** None of the three statements this import reads. */
  | { reason: 'unrecognised-document' }
  /** One of the three, in a language other than French. */
  | {
      reason: 'unsupported-language'
      language: UnsupportedLanguage
      supportedLanguages: ['fr']
    }
  /** Something in the transaction area was not understood. */
  | {
      reason: 'unreadable-layout'
      source: StatementSource
      problem: LayoutProblem
      page: number | null
      /**
       * The statement line that was not understood (or the reference that failed its check),
       * for the user to locate it. It can hold amounts, names, phone numbers and references:
       * it may be shown on the device, and must never be logged or sent anywhere.
       */
      text: string | null
    }
  /** A purchase date after its booking date, or more than 366 days before it. */
  | {
      reason: 'implausible-date'
      source: StatementSource
      control: 'purchase-after-booking' | 'purchase-long-before-booking'
      entry: number
      page: number
      purchaseDate: CalendarDate
      bookingDate: CalendarDate
    }
  /** A printed figure differs from what the entries add up to. */
  | { reason: 'does-not-add-up'; source: StatementSource; control: StatementControl }
  /** Movements in a currency other than CHF. */
  | { reason: 'unsupported-currency'; source: StatementSource; currency: string }
  // File-level refusals (loader).
  | { reason: 'not-a-pdf' }
  | { reason: 'password-protected' }
  | { reason: 'corrupt-file' }
  | { reason: 'file-too-large'; maxBytes: number; bytes: number }
  | { reason: 'too-many-pages'; maxPages: number; pages: number }
  | {
      reason: 'too-many-text-items'
      maxPerPage: number
      maxPerDocument: number
      page: number | null
    }
  | { reason: 'unexpected-page-size'; page: number; width: number; height: number }
  | { reason: 'timed-out'; limitMs: number }
  /** The PDF reader could not be loaded (offline, or the app was updated meanwhile). */
  | { reason: 'reader-unavailable' }
  /** A fault of the reader itself; nothing was imported. */
  | { reason: 'unexpected-error' }

export type StatementRefusalReason = StatementRefusal['reason']

// ---------------------------------------------------------------------------------------------
// Source-specific documents: the full parse, in the shape of test-fixtures/statements/*/expected.json
// ---------------------------------------------------------------------------------------------

export interface Handling {
  action: HandlingAction
  /** A developer-facing note naming the decision; screens translate `action` instead. */
  why: string | null
}

export interface SkippedLine {
  page: number
  text: string
  /** A developer-facing note; the screens do not show skipped lines. */
  reason: string
}

// Migros Bank account ---------------------------------------------------------------------------

export type MigrosAccountKind =
  | 'card-purchase'
  | 'card-refund'
  | 'twint-debit'
  | 'twint-credit'
  | 'payment'
  | 'standing-order'
  | 'salary'
  | 'cash-withdrawal'
  | 'other'

export type MigrosAccountFlag = 'card-bill-payment' | 'own-account-transfer' | 'salary'

export interface MigrosAccountTransaction {
  n: number
  page: number
  bookingDate: CalendarDate
  valueDate: CalendarDate
  purchaseDate: CalendarDate | null
  purchaseTime: string | null
  date: CalendarDate
  direction: Direction
  amount: Rappen
  kind: MigrosAccountKind
  merchant: string | null
  counterparty:
    | { type: 'person'; name: string; phone: string | null }
    | { type: 'merchant'; name: string }
    | { type: 'payee'; name: string; address: string[] }
    | { type: 'employer'; name: string }
    | null
  reference: string | null
  card: string | null
  original: { currency: string; amountMinor: number; rate: string; fee: Rappen | null } | null
  balanceAfter: Rappen | null
  flags: MigrosAccountFlag[]
  text: string
  textLines: string[]
  description: string
  handling: Handling
}

export interface MigrosAccountDocument {
  source: 'migros-bank-account'
  statement: {
    bank: 'Migros Bank'
    document: 'Extrait de compte'
    language: 'fr'
    currency: string
    holder: string | null
    iban: string | null
    accountNumber: string | null
    periodFrom: CalendarDate
    periodTo: CalendarDate
    openingBalance: Rappen
    closingBalance: Rappen
    totalDebits: Rappen
    totalCredits: Rappen
  }
  checks: {
    sumOfDebits: Rappen
    sumOfCredits: Rappen
    debitsMatchPrintedTotal: boolean
    creditsMatchPrintedTotal: boolean
    openingPlusCreditsMinusDebitsIsClosing: boolean
    printedBalancesMatchRunningBalance: boolean
    summaryBlockMatchesTable: boolean
  }
  transactions: MigrosAccountTransaction[]
  skipped: SkippedLine[]
}

// Migros Bank credit-card bill --------------------------------------------------------------

export interface CardBillCard {
  masked: string
  product: string
  holder: string
}

interface CardBillTransactionBase {
  n: number
  page: number
  purchaseDate: CalendarDate
  bookingDate: CalendarDate
  date: CalendarDate
  direction: Direction
  amount: Rappen
  merchant: string | null
  location: string | null
  country: string | null
  category: string | null
  card: string | null
  original:
    | { currency: string; amountMinor: number }
    | {
        currency: string
        amountMinor: number
        rate: string
        rateDate: CalendarDate
        chfConverted: Rappen
      }
    | null
  fee: { percent: string; amount: Rappen } | null
  flags: []
  text: string
  textLines: string[]
  description: string
  handling: Handling
}

export interface CardBillPurchaseTransaction extends CardBillTransactionBase {
  kind: 'card-purchase' | 'card-refund'
}

export interface CardBillChargeTransaction extends CardBillTransactionBase {
  kind: 'interest' | 'fee'
  interestRate: string | null
  days: number | null
}

export type CardBillTransaction = CardBillPurchaseTransaction | CardBillChargeTransaction

export interface CardBillDocument {
  source: 'migros-bank-credit-card'
  statement: {
    bank: 'Migros Bank'
    issuer: 'Viseca Payment Services SA'
    document: 'Facture (carte de crédit)'
    language: 'fr'
    currency: 'CHF'
    billDate: CalendarDate
    dueDate: CalendarDate | null
    cardAccount: string | null
    holder: string | null
    globalLimit: Rappen | null
    cards: CardBillCard[]
    previousBillTotal: Rappen | null
    paymentReceived: Rappen | null
    interest: Rappen
    cardTotal: Rappen
    billTotal: Rappen
    amountDue: Rappen
    paymentSlip: { amount: Rappen; reference: string | null } | null
  }
  checks: {
    sumOfCardLines: Rappen
    cardLinesMatchCardTotal: boolean
    billTotalIsPreviousMinusPaymentPlusInterestPlusCards: boolean
    page1CardSubtotal: Rappen | null
    page1CardLinesMatchSubtotal: boolean | null
    amountDueEqualsBillTotal: boolean
    slipAmountEqualsAmountDue: boolean | null
  }
  transactions: CardBillTransaction[]
  skipped: SkippedLine[]
}

// Yuh account ------------------------------------------------------------------------------

export type YuhKind = 'securities-purchase' | 'transfer-in' | 'other'

export interface YuhTransaction {
  n: number
  page: number
  bookingDate: CalendarDate
  valueDate: CalendarDate | null
  date: CalendarDate
  direction: Direction
  amount: Rappen
  kind: YuhKind
  merchant: string | null
  counterparty: { type: 'payer'; name: string; address: string[]; iban: string | null } | null
  reference: string | null
  security: SecurityDetails | null
  balanceAfter: Rappen
  flags: 'own-account-transfer'[]
  text: string
  textLines: string[]
  description: string
  handling: Handling
}

export interface YuhDocument {
  source: 'yuh-account'
  statement: {
    bank: 'Yuh (Swissquote Bank Ltd)'
    document: 'Relevé de ton compte'
    language: 'fr'
    holder: string | null
    iban: string | null
    clientNumber: string | null
    periodFrom: CalendarDate
    periodTo: CalendarDate
    generatedOn: CalendarDate | null
    currencySections: string[]
    openingBalance: Rappen
    closingBalance: Rappen
    totalDebit: Rappen
    totalCredit: Rappen
    savingsAccountBalance: Rappen | null
  }
  checks: {
    sumOfDebits: Rappen
    sumOfCredits: Rappen
    debitsMatchPrintedTotal: boolean
    creditsMatchPrintedTotal: boolean
    openingPlusCreditsMinusDebitsIsClosing: boolean
    everyRowBalanceMatchesRunningBalance: boolean
    purchaseDebitIsAmountPlusCommissionPlusTax: boolean | null
  }
  transactions: YuhTransaction[]
  skipped: SkippedLine[]
}

export type StatementDocument = MigrosAccountDocument | CardBillDocument | YuhDocument

/** A statement that was recognised, read completely and adds up. */
export interface ParsedStatement {
  source: StatementSource
  identity: StatementIdentity
  /**
   * The dates the statement covers: its period; for a card bill, the day after the previous
   * bill to the bill date (from the earliest booking date when no previous bill is printed).
   * Purchase dates can lie before `from`.
   */
  period: { from: CalendarDate; to: CalendarDate }
  /** One per entry of the transaction table, in statement order. */
  entries: StatementEntry[]
  /** Every printed figure that was checked; all passed, or the statement would be refused. */
  controls: StatementControl[]
}

/**
 * The parse with the full source-specific document (holder, IBAN, balances, skipped lines and
 * the English notes of the fixtures): for tests only, never exposed to the screens.
 */
export interface StatementParse extends ParsedStatement {
  document: StatementDocument
}

export type StatementReadResult =
  { ok: true; statement: ParsedStatement } | { ok: false; refusal: StatementRefusal }

export type StatementParseResult =
  { ok: true; statement: StatementParse } | { ok: false; refusal: StatementRefusal }
