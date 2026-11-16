import { useQuery } from '@tanstack/react-query'

import { budgetKeys } from '@/features/budgets/budget-keys'
import { unwrap, usePeriodDependentQuery, type PeriodRead } from '@/features/budgets/budget-queries'
import type { Database, Tables } from '@/lib/database.types'
import { isCalendarDate } from '@/lib/date'
import { supabase } from '@/lib/supabase'

export type Category = Tables<'category_overview'>
export type Cadence = Database['public']['Enums']['expectation_cadence']
type CategoryChoiceRead =
  Database['public']['Functions']['list_categories_for_date']['Returns'][number]

/**
 * A leaf a transaction may use, as the contract describes it: only parent_id and parent_name
 * (top level) are ever null; the generated type marks every field of the composite type
 * nullable, so the others are read once here.
 */
export interface CategoryForDate {
  category_id: string
  parent_id: string | null
  name: string
  parent_name: string | null
  display_order: number
}

function readChoice(row: CategoryChoiceRead): CategoryForDate {
  return {
    category_id: row.category_id ?? '',
    parent_id: row.parent_id,
    name: row.name ?? '',
    parent_name: row.parent_name,
    display_order: row.display_order ?? 0,
  }
}

export const CADENCES: readonly Cadence[] = ['monthly', 'yearly']

/**
 * Every category and subcategory, ended and void ones included, in display order (top level
 * by sort_order, then each one's subcategories). "In force now" (is_active) depends on which
 * periods exist, so the read waits for ensure_periods (R-PERIOD-052).
 */
export function useCategories(budgetId: string): PeriodRead<Category[]> {
  return usePeriodDependentQuery(budgetId, budgetKeys.categories(budgetId), async () =>
    unwrap(
      await supabase
        .from('category_overview')
        .select('*')
        .eq('budget_id', budgetId)
        .order('sort_order')
        .order('created_at')
        .order('id'),
    ),
  )
}

/** A void category was never in force (removed in the period it started in, or by a reopen). */
export function isVoid(category: Pick<Category, 'first_seq' | 'end_seq'>): boolean {
  return category.end_seq !== null && category.end_seq <= category.first_seq
}

export interface CategoryTree {
  /** Top-level categories in force now, each with its subcategories in force. */
  active: { category: Category; children: Category[] }[]
  /**
   * Categories and subcategories that have ended, for the record and to be restored: those
   * that counted in some period, and void ones (never in force) that still hold transactions
   * (R-CATEGORY-054). Each group comes before its subcategories, in display order.
   */
  ended: Category[]
}

/** Arrange the flat list as the budget page shows it; order is the database's sort_order. */
export function categoryTree(categories: readonly Category[]): CategoryTree {
  const active = categories
    .filter((category) => category.parent_id === null && category.is_active === true)
    .map((category) => ({
      category,
      children: categories.filter(
        (child) => child.parent_id === category.id && child.is_active === true,
      ),
    }))
  const isEnded = (category: Category) =>
    category.is_active !== true &&
    category.end_seq !== null &&
    (!isVoid(category) || category.has_transactions === true)
  // Display order: each top-level category (by sort_order), then its subcategories.
  const ended: Category[] = []
  for (const top of categories.filter((category) => category.parent_id === null)) {
    if (isEnded(top)) ended.push(top)
    ended.push(...categories.filter((child) => child.parent_id === top.id && isEnded(child)))
  }
  return { active, ended }
}

/**
 * The leaves a transaction dated `date` may use (list_categories_for_date), in display order:
 * read again whenever the date changes (R-TRANSACTION-091).
 */
export function useCategoriesForDate(budgetId: string, date: string) {
  const valid = isCalendarDate(date)
  return useQuery({
    queryKey: budgetKeys.categoriesForDate(budgetId, date),
    enabled: valid,
    queryFn: async (): Promise<CategoryForDate[]> =>
      unwrap(
        await supabase.rpc('list_categories_for_date', { p_budget_id: budgetId, p_date: date }),
      ).map(readChoice),
  })
}
