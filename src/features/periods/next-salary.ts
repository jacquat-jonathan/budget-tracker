import type { MyBudget, PeriodSummary } from '@/features/budgets/budget-queries'
import { addDays } from '@/lib/date'

/**
 * What the app announces about the next salary of the primary income. One answer, used by
 * every place that announces it (dashboard, income card, periods page, toasts, previews).
 *
 * - `expected`: the current period ends the day before the next salary, so the next salary
 *   is expected the day after the period's end (projected, or set by hand). Never the
 *   schedule's next pay date (income_overview.next_pay_date): after an early salary or a
 *   date set by hand the period, not the schedule, says when the next salary starts a
 *   period.
 * - `lastPeriod`: the current period is the budget's last (it contains the end date the
 *   owner entered, R-BUDGET-008): no period starts after it, so no next salary is
 *   announced; the budget ends on `endDate`.
 * - `ended`: the budget has ended (no current period): no next salary.
 */
export type NextSalary =
  | { kind: 'expected'; date: string; manual: boolean }
  | { kind: 'lastPeriod'; endDate: string }
  | { kind: 'ended' }

type PeriodEnd = Pick<PeriodSummary, 'end_date' | 'end_is_manual'>

/**
 * The next salary, from the current period (null when the budget has ended) and the end
 * date the owner entered. `period` may also be a proposed end (a preview): the answer is
 * then what the app would announce after saving.
 */
// R-INCOME-056: one source for the next salary.
export function nextSalary(
  period: PeriodEnd | null,
  endDateEntered: MyBudget['end_date_entered'],
): NextSalary {
  if (!period) return { kind: 'ended' }
  if (isLastPeriod(period, endDateEntered)) return { kind: 'lastPeriod', endDate: period.end_date }
  return {
    kind: 'expected',
    date: addDays(period.end_date, 1),
    manual: period.end_is_manual === true,
  }
}

/**
 * The current (or a proposed current) period is the budget's last when it contains the end
 * date entered: periods never start after it, so the current period's start is on or
 * before it, and it is contained when the period ends on or after it.
 */
export function isLastPeriod(
  period: Pick<PeriodSummary, 'end_date'>,
  endDateEntered: MyBudget['end_date_entered'],
): boolean {
  return endDateEntered !== null && endDateEntered <= period.end_date
}
