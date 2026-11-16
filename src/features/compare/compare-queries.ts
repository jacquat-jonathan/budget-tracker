import { budgetKeys } from '@/features/budgets/budget-keys'
import { unwrap, usePeriodDependentQuery, type PeriodRead } from '@/features/budgets/budget-queries'
import { supabase } from '@/lib/supabase'

/** The ranges the screens offer (R-COMPARE-171). */
export const COUNTS = [6, 12, 24] as const
export type Count = (typeof COUNTS)[number]
export const DEFAULT_COUNT: Count = 12

export function readCount(value: string | null): Count {
  const number = Number(value)
  return (COUNTS as readonly number[]).includes(number) ? (number as Count) : DEFAULT_COUNT
}

/**
 * One period of the range, as get_period_trend gives it (its period_summaries row). The
 * averages are the range's, the same on every row, null without a completed period
 * (the generated types say non-null: docs/database.md says they may be null).
 */
export interface TrendPeriod {
  period_id: string
  seq: number
  start_date: string
  end_date: string
  days: number
  is_current: boolean
  is_completed: boolean
  income_total: number
  salary_total: number
  extra_income_total: number
  spent_total: number
  expected_total: number
  committed_total: number
  result: number
  completed_count: number
  average_income: number | null
  average_spent: number | null
  average_result: number | null
}

/** One category line across the range (get_category_trend), arrays aligned with periodIds. */
export interface CategoryLine {
  category_id: string
  parent_id: string | null
  name: string
  is_group: boolean
  display_order: number
  period_ids: string[]
  in_force: boolean[]
  /** Null where not in force (not 0). */
  planned: (number | null)[]
  spent: number[]
  committed: number[]
  transaction_count: number[]
  completed_count: number
  average_spent: number | null
}

/** One row of get_period_comparison: the totals first, then the categories. */
export interface ComparisonRow {
  kind: 'total' | 'category'
  category_id: string | null
  parent_id: string | null
  name: string | null
  is_group: boolean | null
  display_order: number | null
  a_period_id: string | null
  a_start_date: string | null
  a_end_date: string | null
  a_days: number | null
  b_period_id: string
  b_start_date: string
  b_end_date: string
  b_days: number
  a_in_force: boolean | null
  b_in_force: boolean | null
  a_planned: number | null
  b_planned: number | null
  planned_difference: number | null
  a_spent: number | null
  b_spent: number | null
  spent_difference: number | null
  a_committed: number | null
  b_committed: number | null
  committed_difference: number | null
  a_transaction_count: number | null
  b_transaction_count: number | null
  a_income: number | null
  b_income: number | null
  income_difference: number | null
  a_result: number | null
  b_result: number | null
  result_difference: number | null
}

async function readTrend(budgetId: string, count: Count): Promise<TrendPeriod[]> {
  const rows = unwrap(
    await supabase.rpc('get_period_trend', { p_budget_id: budgetId, p_count: count }),
  )
  return rows
}

/** The trend of the last `count` periods, oldest first (R-COMPARE-002). */
// C-QUERY-001: keyed by budget id and count, read again after each catch-up and write.
export function usePeriodTrend(budgetId: string, count: Count): PeriodRead<TrendPeriod[]> {
  return usePeriodDependentQuery(budgetId, [...budgetKeys.compare(budgetId), 'trend', count], () =>
    readTrend(budgetId, count),
  )
}

export interface CategoryRange {
  periods: TrendPeriod[]
  lines: CategoryLine[]
}

/** How many times the two reads are taken again when their ranges differ. */
const RANGE_ATTEMPTS = 3

/**
 * The category lines with the periods they are aligned with: both reads, checked against each
 * other (period_ids is the trend's period_id column for the same count); when they differ, a
 * period was created or merged between the two calls, and both are read again (D-262).
 */
// R-COMPARE-193: the lines' periods are the trend's, or both are read again.
export function useCategoryRange(budgetId: string, count: Count): PeriodRead<CategoryRange> {
  return usePeriodDependentQuery(
    budgetId,
    [...budgetKeys.compare(budgetId), 'categories', count],
    async () => {
      for (let attempt = 1; ; attempt += 1) {
        const [periods, raw] = await Promise.all([
          readTrend(budgetId, count),
          supabase.rpc('get_category_trend', { p_budget_id: budgetId, p_count: count }),
        ])
        const lines = unwrap(raw) as unknown as CategoryLine[]
        const ids = periods.map((period) => period.period_id).join(',')
        if (lines.every((line) => line.period_ids.join(',') === ids)) return { periods, lines }
        if (attempt >= RANGE_ATTEMPTS) throw new Error('compare: the two reads kept differing')
      }
    },
    // The attempts above are the only ones: three in all, never three more on an error.
    { retry: false },
  )
}

/** Two periods side by side; null ids take the database's defaults (R-COMPARE-071). */
export function usePeriodComparison(
  budgetId: string,
  a: string | null,
  b: string | null,
): PeriodRead<ComparisonRow[]> {
  return usePeriodDependentQuery(
    budgetId,
    [...budgetKeys.compare(budgetId), 'side', a ?? '', b ?? ''],
    async () =>
      unwrap(
        await supabase.rpc('get_period_comparison', {
          p_budget_id: budgetId,
          ...(a ? { p_period_a_id: a } : {}),
          ...(b ? { p_period_b_id: b } : {}),
        }),
      ) as unknown as ComparisonRow[],
  )
}
