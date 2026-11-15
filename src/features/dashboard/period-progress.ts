import type { PeriodSummary } from '@/features/budgets/budget-queries'
import { daysInclusive } from '@/lib/date'

/**
 * Day N of M of a period. The contract gives no "today", so N uses the browser's date,
 * clamped to the period: it is display only, while which period is current, its dates and
 * its totals all come from the database (C-LOGIC-003).
 */
export function periodProgress(
  period: Pick<PeriodSummary, 'start_date' | 'end_date'>,
  today: string,
): { day: number; total: number; percent: number } {
  const total = daysInclusive(period.start_date, period.end_date)
  const day = Math.min(Math.max(daysInclusive(period.start_date, today), 1), total)
  return { day, total, percent: Math.round((day / total) * 100) }
}
