import { usePayDate, type PeriodSummary, type WeekendRule } from '@/features/budgets/budget-queries'
import { addMonths } from '@/lib/date'

/**
 * What saving terms as the primary income's (a new pay day or weekend rule, or another
 * income made primary) does to the current period. The current period keeps its start and
 * ends the day before the next month's pay date under the new terms; when that date has
 * already come, it closes at once. A manual end is kept while it lies within 14 days of the
 * new schedule (R-PERIOD-026): the database decides that, so it is described, not computed.
 */
export type TermsEffect =
  | { kind: 'none' }
  | { kind: 'checking' }
  | { kind: 'unknown' }
  /** The next month's pay date has come: the current period closes on saving. */
  | { kind: 'closes'; month: string; payDate: string }
  /** The current period now ends the day before `payDate`. */
  | { kind: 'moves'; month: string; payDate: string }
  /** The current end was set by hand; kept if within 14 days of `payDate`. */
  | { kind: 'manual'; month: string; payDate: string; manualEnd: string; closesIfReset: boolean }

/** R-INCOME-052: the preview behind the warning before new primary terms are saved. */
export function useTermsEffect({
  enabled,
  currentPeriod,
  payDay,
  weekendRule,
}: {
  enabled: boolean
  currentPeriod: PeriodSummary | null | undefined
  payDay: number
  weekendRule: WeekendRule
}): TermsEffect {
  const month = currentPeriod ? addMonths(currentPeriod.month, 1) : null
  const payDate = usePayDate(month, payDay, weekendRule, enabled && month !== null)
  const today = currentPeriod?.today ?? null
  if (!enabled || !currentPeriod || !month || today === null) return { kind: 'none' }
  if (payDate.isError) return { kind: 'unknown' }
  if (payDate.data === undefined) return { kind: 'checking' }
  const closes = payDate.data <= today
  if (currentPeriod.end_is_manual) {
    return {
      kind: 'manual',
      month,
      payDate: payDate.data,
      manualEnd: currentPeriod.end_date,
      closesIfReset: closes,
    }
  }
  return { kind: closes ? 'closes' : 'moves', month, payDate: payDate.data }
}
