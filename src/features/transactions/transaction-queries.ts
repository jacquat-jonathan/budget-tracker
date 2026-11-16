import { useInfiniteQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { useBudgetEnded } from '@/features/budgets/budget-ended'
import { budgetKeys } from '@/features/budgets/budget-keys'
import {
  unwrap,
  useCurrentPeriod,
  useFirstPeriodStart,
  usePeriods,
} from '@/features/budgets/budget-queries'
import type { Database, Tables } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

export type Transaction = Tables<'transaction_list'>
export type TransactionKind = Database['public']['Enums']['transaction_kind']

export const TRANSACTION_KINDS: readonly TransactionKind[] = ['expense', 'refund', 'extra_income']

/**
 * R-TRANSACTION-090: the dates a transaction may take, from the first period's start to today,
 * not after an ended budget's last day (null until the periods are known), and the database's
 * today. For forms opened outside the transactions page (a debt payment).
 */
export function useTransactionDateRange(budgetId: string) {
  const periods = usePeriods(budgetId)
  const current = useCurrentPeriod(budgetId)
  const list = periods.data
  const today = current.data?.today ?? list?.[0]?.today ?? null
  const min = useFirstPeriodStart(budgetId)
  const lastEnd = list?.[0]?.end_date
  const max = lastEnd && today ? (today < lastEnd ? today : lastEnd) : undefined
  const range = useMemo(() => (min && max ? { min, max } : null), [min, max])
  return { range, today, ended: useBudgetEnded(budgetId) }
}

/** Page size of the transaction list (the contract allows 1 to 200). */
export const TRANSACTION_PAGE_SIZE = 50

export interface TransactionFilters {
  /** A period's dates, inclusive; all periods when null. */
  from: string | null
  to: string | null
  /** A leaf, or a group with its subcategories. */
  categoryId: string | null
  kind: TransactionKind | null
  /** Its charges and the transactions linked to it. */
  subscriptionId?: string | null
  /** Its payments. */
  debtId?: string | null
  /** Only the charges awaiting confirmation. */
  awaitingOnly?: boolean
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
          ...(filters.subscriptionId ? { p_subscription_id: filters.subscriptionId } : {}),
          ...(filters.debtId ? { p_debt_id: filters.debtId } : {}),
          ...(filters.awaitingOnly ? { p_awaiting_only: true } : {}),
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
