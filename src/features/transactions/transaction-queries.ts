import { useInfiniteQuery } from '@tanstack/react-query'

import { budgetKeys } from '@/features/budgets/budget-keys'
import { unwrap } from '@/features/budgets/budget-queries'
import type { Database, Tables } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

export type Transaction = Tables<'transaction_list'>
export type TransactionKind = Database['public']['Enums']['transaction_kind']

export const TRANSACTION_KINDS: readonly TransactionKind[] = ['expense', 'refund', 'extra_income']

/** Page size of the transaction list (the contract allows 1 to 200). */
export const TRANSACTION_PAGE_SIZE = 50

export interface TransactionFilters {
  /** A period's dates, inclusive; all periods when null. */
  from: string | null
  to: string | null
  /** A leaf, or a group with its subcategories. */
  categoryId: string | null
  kind: TransactionKind | null
}

interface Cursor {
  date: string
  createdAt: string
  id: string
}

/**
 * R-TRANSACTION-095: the list, newest first, a page at a time through the database's
 * cursor (the last row's date, created_at and id), with the same filters on every page.
 */
export function useTransactions(budgetId: string, filters: TransactionFilters, enabled = true) {
  return useInfiniteQuery({
    queryKey: [...budgetKeys.transactions(budgetId), filters] as const,
    enabled,
    initialPageParam: null as Cursor | null,
    queryFn: async ({ pageParam }): Promise<Transaction[]> =>
      unwrap(
        await supabase.rpc('list_transactions', {
          p_budget_id: budgetId,
          p_limit: TRANSACTION_PAGE_SIZE,
          ...(filters.from ? { p_from_date: filters.from } : {}),
          ...(filters.to ? { p_to_date: filters.to } : {}),
          ...(filters.categoryId ? { p_category_id: filters.categoryId } : {}),
          ...(filters.kind ? { p_kind: filters.kind } : {}),
          ...(pageParam
            ? {
                p_before_date: pageParam.date,
                p_before_created_at: pageParam.createdAt,
                p_before_id: pageParam.id,
              }
            : {}),
        }),
      ),
    // A page shorter than the limit is the last.
    getNextPageParam: (page): Cursor | null => {
      const last = page.at(-1)
      if (page.length < TRANSACTION_PAGE_SIZE || !last) return null
      return { date: last.date, createdAt: last.created_at, id: last.id }
    },
  })
}
