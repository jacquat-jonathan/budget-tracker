import type { PeriodSummary } from '@/features/budgets/budget-queries'
import { daysInclusive } from '@/lib/date'

/**
 * Day N of M of a period, counted to the database's "today" (period_summaries.today,
 * R-PERIOD-028) and clamped to the period. Calendar arithmetic only, no time zone.
 */
export function periodProgress(
  period: Pick<PeriodSummary, 'start_date' | 'end_date'>,
  today: string,
): { day: number; total: number; percent: number } {
  const total = daysInclusive(period.start_date, period.end_date)
  const day = Math.min(Math.max(daysInclusive(period.start_date, today), 1), total)
  return { day, total, percent: Math.round((day / total) * 100) }
}
