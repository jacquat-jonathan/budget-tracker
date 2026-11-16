/**
 * Shared machinery of the three parsers: typed failures that become refusals, the control
 * recorder that refuses a statement as soon as a printed figure does not add up, table
 * columns, and the checks every entry list gets once parsed.
 */
import { addDays } from '@/lib/date'

import { collapseSpaces, isWithin, readAmount, readDate, roundExact } from './reading'
import type { PageLines, TextItem, TextLine } from './text-lines'
import type {
  CalendarDate,
  ControlId,
  EntryDetails,
  Handling,
  LayoutProblem,
  Rappen,
  StatementControl,
  StatementEntry,
  StatementRefusal,
  StatementSource,
} from './types'

/** Thrown inside a parser; `parseStatementText` turns it into the refusal it carries. */
export class StatementRefusalError extends Error {
  readonly refusal: StatementRefusal

  constructor(refusal: StatementRefusal) {
    super(refusal.reason)
    this.name = 'StatementRefusalError'
    this.refusal = refusal
  }
}

type LineRef = { page: number; text: string } | null

/** The reading helpers of one parser, refusing in the name of its source. */
export interface ParserTools {
  fail(problem: LayoutProblem, line: LineRef): never
  requireDate(text: string, line: TextLine): CalendarDate
  requireAmount(text: string, line: TextLine): Rappen
}

export function parserTools(source: StatementSource): ParserTools {
  const fail = (problem: LayoutProblem, line: LineRef): never => {
    throw new StatementRefusalError({
      reason: 'unreadable-layout',
      source,
      problem,
      page: line?.page ?? null,
      text: line?.text ?? null,
    })
  }
  return {
    fail,
    requireDate: (text, line) => readDate(collapseSpaces(text)) ?? fail('unreadable-date', line),
    requireAmount: (text, line) =>
      readAmount(collapseSpaces(text)) ?? fail('unreadable-amount', line),
  }
}

interface ControlContext {
  page?: number | null
  entry?: number | null
  currency?: string
}

// R-IMPORT-088: every printed figure is compared; the first that differs refuses the statement.
export class Controls {
  readonly list: StatementControl[] = []
  private readonly source: StatementSource

  constructor(source: StatementSource) {
    this.source = source
  }

  private record(control: StatementControl, passed: boolean): void {
    this.list.push(control)
    if (!passed) {
      throw new StatementRefusalError({ reason: 'does-not-add-up', source: this.source, control })
    }
  }

  /** The printed figure must equal the computed one. */
  equal(id: ControlId, printed: number, computed: number, context: ControlContext = {}): void {
    this.record(
      {
        id,
        page: context.page ?? null,
        entry: context.entry ?? null,
        currency: context.currency ?? 'CHF',
        printed,
        computed,
        tolerance: 0,
      },
      printed === computed,
    )
  }

  /** The printed figure must differ from the exact computed value by less than `tolerance`. */
  near(
    id: ControlId,
    printed: number,
    exact: { numerator: bigint; denominator: bigint },
    tolerance: number,
    context: ControlContext = {},
  ): void {
    this.record(
      {
        id,
        page: context.page ?? null,
        entry: context.entry ?? null,
        currency: context.currency ?? 'CHF',
        printed,
        computed: roundExact(exact),
        tolerance,
      },
      isWithin(printed, exact, tolerance),
    )
  }

  /** True when a control of this kind was checked (and so passed: a failure refuses). */
  checked(id: ControlId): boolean {
    return this.list.some((control) => control.id === id)
  }
}

/** A column of a table, from its heading label: [x, right]. */
export interface Column {
  x: number
  right: number
}

export function column(item: TextItem): Column {
  return { x: item.x, right: item.right }
}

/** Tolerance for "starts at the column's x" and for amounts ending at a heading's right edge. */
export const COLUMN_TOLERANCE = 4

export function startsAt(item: TextItem, columnX: number): boolean {
  return Math.abs(item.x - columnX) <= COLUMN_TOLERANCE
}

/** An amount belongs to a column when its right edge lies within the heading's span. */
export function endsUnder(item: TextItem, heading: Column): boolean {
  return (
    item.right >= heading.x - COLUMN_TOLERANCE && item.right <= heading.right + COLUMN_TOLERANCE
  )
}

/**
 * The table of a page: the heading line found by `heading`, and the lines below it down to
 * the page footer (a line with an item matching `footer`). Null for a page without a table.
 */
export function tableOf<C>(
  page: PageLines,
  heading: (line: TextLine) => C | null,
  footer: RegExp,
): { columns: C; lines: TextLine[] } | null {
  for (const [index, line] of page.lines.entries()) {
    const columns = heading(line)
    if (columns === null) continue
    const body = page.lines.slice(index + 1)
    const end = body.findIndex((candidate) => candidate.items.some((item) => footer.test(item.str)))
    return { columns, lines: end === -1 ? body : body.slice(0, end) }
  }
  return null
}

export const WHY = {
  credit: 'credit: proposed as a refund in a category or as extra income (D-130)',
  cardBillPayment: 'card-bill payment: the card purchases are imported from the card bill (D-129)',
  ownTransfer: "transfer between the owner's own accounts (D-129)",
  salary:
    "salary credit: skipped when it matches one of the budget's incomes, else reviewed (D-130)",
} as const

export const IMPORT: Handling = { action: 'import', why: null }
export const REVIEW_CREDIT: Handling = { action: 'review-credit', why: WHY.credit }
export const SKIP_CARD_BILL_PAYMENT: Handling = {
  action: 'skip-by-default',
  why: WHY.cardBillPayment,
}
export const SKIP_OWN_TRANSFER: Handling = { action: 'skip-by-default', why: WHY.ownTransfer }
export const SKIP_IF_INCOME: Handling = { action: 'skip-if-matches-income', why: WHY.salary }

/** Words of a person's name, for comparing "First Last" with "Last First". */
function nameWords(name: string): string {
  return name
    .toLocaleLowerCase('fr-CH')
    .split(/[\s,]+/)
    .filter((word) => word !== '')
    .sort()
    .join(' ')
}

export function sameName(a: string, b: string): boolean {
  const left = nameWords(a)
  return left !== '' && left === nameWords(b)
}

/** An address line compared without case, punctuation or spacing differences. */
function addressKey(line: string): string {
  return line.toLocaleLowerCase('fr-CH').replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** True when the two addresses (street and town lines) are the same. */
export function sameAddress(a: readonly string[], b: readonly string[]): boolean {
  return (
    a.length > 0 &&
    a.length === b.length &&
    a.every((line, i) => addressKey(line) === addressKey(b[i] ?? ''))
  )
}

/** Entry details with nothing but the booking date; each parser fills what its layout gives. */
export function emptyDetails(bookingDate: CalendarDate): EntryDetails {
  return {
    bookingDate,
    valueDate: null,
    purchaseDate: null,
    purchaseTime: null,
    card: null,
    original: null,
    fee: null,
    category: null,
    location: null,
    country: null,
    security: null,
    counterparty: null,
    paymentReference: null,
    balanceAfter: null,
    interest: null,
  }
}

/** The longest a purchase may precede its booking (a year, and a leap day). */
export const MAX_PURCHASE_LEAD_DAYS = 366

/**
 * What every entry list gets once parsed: plausible purchase dates, bank transaction ids that
 * identify one entry each, and a handling of their own for entries of 0.00.
 */
export function finishEntries(source: StatementSource, entries: StatementEntry[]): void {
  for (const entry of entries) {
    const { purchaseDate, bookingDate } = entry.details
    if (purchaseDate === null) continue
    // R-IMPORT-217: the purchase date decides the period; it must be plausible.
    const control =
      purchaseDate > bookingDate
        ? 'purchase-after-booking'
        : purchaseDate < addDays(bookingDate, -MAX_PURCHASE_LEAD_DAYS)
          ? 'purchase-long-before-booking'
          : null
    if (control) {
      throw new StatementRefusalError({
        reason: 'implausible-date',
        source,
        control,
        entry: entry.n,
        page: entry.page,
        purchaseDate,
        bookingDate,
      })
    }
  }
  // R-IMPORT-218: an id printed on several entries identifies none of them.
  const counts = new Map<string, number>()
  for (const { bankTransactionId: id } of entries) {
    if (id !== null) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  for (const entry of entries) {
    const id = entry.bankTransactionId
    if (id !== null && (counts.get(id) ?? 0) > 1) entry.bankTransactionId = null
    // R-IMPORT-220: an entry of 0.00 is shown, never imported.
    if (entry.amount === 0) entry.handling = 'nothing-to-import'
  }
}
