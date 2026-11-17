import type { PeriodSummary } from '@/features/budgets/budget-queries'
import { addDays } from '@/lib/date'

/**
 * Which dates a boundary operation can take, so the app never offers an operation, or a
 * date, that the database is bound to refuse. The database stays the judge (it refuses with
 * invalid_boundary); these bounds only decide what is offered and explained. They follow
 * docs/database.md: every period is 7 to 92 days long (R-PERIOD-020), an arrival is today or
 * earlier, and no period starts after the end date the owner entered.
 */
export const PERIOD_MIN_DAYS = 7
export const PERIOD_MAX_DAYS = 92

/** Inclusive range of dates an operation can take; empty when `min` is after `max`. */
export interface DateRange {
  min: string
  max: string
}

/** Why "the salary arrived early" cannot apply to the current period. */
export type EarlyUnavailable =
  /** The budget's end date leaves no day on which a new period could start. */
  | { reason: 'budgetEnds'; endDateEntered: string }
  /** The period is too young: the earliest arrival is after today. */
  | { reason: 'tooSoon'; earliest: string }

const earlier = (a: string, b: string) => (a < b ? a : b)
const later = (a: string, b: string) => (a > b ? a : b)

export function isEmpty(range: DateRange): boolean {
  return range.min > range.max
}

export function inRange(date: string, range: DateRange): boolean {
  return range.min <= date && date <= range.max
}

/**
 * "The salary arrived early" (record_early_pay_date): the new period starts on a day from
 * the 7th day after the current one started, up to today, and not after the end date
 * entered.
 */
export function earlyRange(
  current: Pick<PeriodSummary, 'start_date' | 'today'>,
  endDateEntered: string | null,
): DateRange {
  const today = current.today ?? current.start_date
  return {
    min: addDays(current.start_date, PERIOD_MIN_DAYS),
    max: endDateEntered ? earlier(today, endDateEntered) : today,
  }
}

// R-PERIOD-054: offered only when some date can be accepted; otherwise say why.
/** Why "the salary arrived early" is unavailable, or null when some date can work. */
export function earlyUnavailable(
  current: Pick<PeriodSummary, 'start_date' | 'today'>,
  endDateEntered: string | null,
): EarlyUnavailable | null {
  const range = earlyRange(current, endDateEntered)
  if (!isEmpty(range)) return null
  if (endDateEntered && endDateEntered < range.min) {
    return { reason: 'budgetEnds', endDateEntered }
  }
  return { reason: 'tooSoon', earliest: range.min }
}

/**
 * "This period's salary actually arrived on another day" (move_period_start): both the
 * previous period and this one stay 7 to 92 days long, and the new start is up to today and
 * not after the end date entered. `end` is this period's end (by default its stored end).
 */
export function moveStartRange(
  period: Pick<PeriodSummary, 'end_date' | 'today' | 'start_date'>,
  previous: Pick<PeriodSummary, 'start_date'>,
  endDateEntered: string | null,
  end: string = period.end_date,
): DateRange {
  const today = period.today ?? period.start_date
  let max = earlier(today, addDays(end, 1 - PERIOD_MIN_DAYS))
  max = earlier(max, addDays(previous.start_date, PERIOD_MAX_DAYS))
  if (endDateEntered) max = earlier(max, endDateEntered)
  const min = later(
    addDays(previous.start_date, PERIOD_MIN_DAYS),
    addDays(end, 1 - PERIOD_MAX_DAYS),
  )
  return { min, max }
}

/** What to ask after a pay-day correction under which a salary was already due. */
export interface ArrivedOffer {
  /**
   * `early`: a new salary arrived since the period started: record it early (the period
   * closes). `moveStart`: it is this period's own salary, which arrived a few days after
   * the period started: move the period's start to it.
   */
  kind: 'early' | 'moveStart'
  date: string
}

// R-PERIOD-037: prompt only for the operation that fits and that the database can accept.
/**
 * Under corrected terms of the primary income, this month's salary was due on `due`, after
 * the current period started and up to today. If a new period can start on `due`, it is a
 * new salary that arrived early. If not, because `due` is less than 7 days after the start,
 * it is this period's own salary, which really arrived on `due`: the period's start moves
 * there, if both periods stay valid. Otherwise nothing that fits can be saved: null, and the
 * app does not ask. `endAfterSave`: the current period's end once the terms are saved (from
 * the preview), which the move must leave 7 days long.
 */
export function arrivedOffer({
  due,
  current,
  previous,
  endDateEntered,
  endAfterSave,
}: {
  due: string
  current: Pick<PeriodSummary, 'start_date' | 'end_date' | 'today'>
  previous: Pick<PeriodSummary, 'start_date'> | undefined
  endDateEntered: string | null
  endAfterSave?: string
}): ArrivedOffer | null {
  const today = current.today ?? current.start_date
  if (!(current.start_date < due && due <= today)) return null
  if (inRange(due, earlyRange(current, endDateEntered))) return { kind: 'early', date: due }
  if (due >= addDays(current.start_date, PERIOD_MIN_DAYS)) return null
  if (!previous) return null
  const range = moveStartRange(current, previous, endDateEntered, endAfterSave ?? current.end_date)
  return inRange(due, range) ? { kind: 'moveStart', date: due } : null
}
