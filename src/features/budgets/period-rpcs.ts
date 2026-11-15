import { unwrap } from '@/features/budgets/budget-queries'
import { supabase } from '@/lib/supabase'

/*
 * The two RPCs whose argument may be null to mean "clear". The generated types say
 * `string` for now (contract gap, being fixed); the casts live here and nowhere else, so the
 * fix is one line each.
 */

/** set_budget_end_date: the stored (snapped) end date, or null once cleared. */
export async function setBudgetEndDate(
  budgetId: string,
  endDate: string | null,
): Promise<string | null> {
  return unwrap(
    await supabase.rpc('set_budget_end_date', {
      p_budget_id: budgetId,
      p_end_date: endDate as string,
    }),
  )
}

/** move_period_boundary: a new last day for the period, or null to re-project the latest. */
export async function movePeriodBoundary(periodId: string, newEnd: string | null): Promise<void> {
  unwrap(
    await supabase.rpc('move_period_boundary', {
      p_period_id: periodId,
      p_new_end: newEnd as string,
    }),
  )
}
