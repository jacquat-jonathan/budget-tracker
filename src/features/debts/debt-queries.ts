import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { budgetKeys } from '@/features/budgets/budget-keys'
import { unwrap, usePeriodDependentQuery, type PeriodRead } from '@/features/budgets/budget-queries'
import { useRecord } from '@/features/budgets/record-queries'
import type { Database, Tables } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

type DebtRead = Tables<'debt_overview'>
export type Payoff = Database['public']['Enums']['debt_payoff']

/**
 * A debt as the contract describes it: totals, remaining and flags are never null; the
 * projection (payoff, payments_left, expected_end_date) is null for an ended debt or an ended
 * budget, payments_left and expected_end_date unless it ends. Narrowed here, once.
 */
export interface Debt extends Omit<
  DebtRead,
  | 'is_active'
  | 'interest_total'
  | 'adjustment_total'
  | 'paid_total'
  | 'remaining'
  | 'payoff'
  | 'has_history'
  | 'removal_deletes'
  | 'overpaid_by'
  | 'paid_percent'
  | 'expected_end_after_budget_end'
> {
  is_active: boolean
  interest_total: number
  adjustment_total: number
  paid_total: number
  remaining: number
  payoff: Payoff | null
  has_history: boolean
  removal_deletes: boolean
  /** How much more was paid than owed; 0 unless overpaid. */
  overpaid_by: number
  /** Paid off, a whole percent (D-215): for the bar and its label. */
  paid_percent: number
  /** The projected end falls after the budget's end (R-DEBT-132). */
  expected_end_after_budget_end: boolean
}

export function readDebt(row: DebtRead): Debt {
  return {
    ...row,
    is_active: row.is_active === true,
    interest_total: row.interest_total ?? 0,
    adjustment_total: row.adjustment_total ?? 0,
    paid_total: row.paid_total ?? 0,
    remaining: row.remaining ?? 0,
    payoff: row.payoff,
    has_history: row.has_history === true,
    removal_deletes: row.removal_deletes === true,
    overpaid_by: row.overpaid_by ?? 0,
    paid_percent: row.paid_percent ?? 0,
    expected_end_after_budget_end: row.expected_end_after_budget_end === true,
  }
}

export interface DebtTotals {
  /** The positive remaining amounts of the debts in force, added up by the database. */
  remaining_total: number
  /** How many debts in force still owe something. */
  owing_count: number
}

/** debt_totals: no row when no debt is in force (0 owed, D-216). */
// What is owed in all is the database's total (D-216); the client adds nothing up.
export function useDebtTotals(budgetId: string): PeriodRead<DebtTotals> {
  return usePeriodDependentQuery(budgetId, budgetKeys.debtTotals(budgetId), async () => {
    const row = unwrap(
      await supabase
        .from('debt_totals')
        .select('remaining_total, owing_count')
        .eq('budget_id', budgetId)
        .maybeSingle(),
    )
    return { remaining_total: row?.remaining_total ?? 0, owing_count: row?.owing_count ?? 0 }
  })
}

export function isVoidDebt(debt: Pick<Debt, 'first_seq' | 'end_seq'>) {
  return debt.end_seq !== null && debt.end_seq <= debt.first_seq
}

/** Every debt, ended and void ones included, by name; the projection depends on today. */
export function useDebts(budgetId: string): PeriodRead<Debt[]> {
  return usePeriodDependentQuery(budgetId, budgetKeys.debts(budgetId), async () =>
    unwrap(
      await supabase
        .from('debt_overview')
        .select('*')
        .eq('budget_id', budgetId)
        .order('name')
        .order('id'),
    ).map(readDebt),
  )
}

/** One debt read by its id, narrowed: undefined while unknown, null once it is gone. */
export function useDebtRecord(budgetId: string, id: string | undefined): Debt | null | undefined {
  const row = useRecord('debt_overview', budgetId, id)
  return useMemo(() => (row ? readDebt(row) : row), [row])
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * One debt for its page, with the read's error and a retry (the same cached read as
 * useDebtRecord). An id that is not a uuid is no debt of this budget: null, not a request
 * the API would refuse.
 */
export function useDebt(budgetId: string, id: string) {
  const valid = UUID.test(id)
  const query = useQuery({
    queryKey: [...budgetKeys.budget(budgetId), 'record', 'debt_overview', id] as const,
    enabled: valid,
    staleTime: 0,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('debt_overview')
          .select('*')
          .eq('budget_id', budgetId)
          .eq('id', id)
          .maybeSingle(),
      ),
  })
  const data = useMemo(
    () => (!valid ? null : query.data ? readDebt(query.data) : query.data),
    [valid, query.data],
  )
  return { data, isError: valid && query.isError, error: query.error, refetch: query.refetch }
}

type HistoryRead = Database['public']['CompositeTypes']['debt_history_row']
export type HistoryKind = 'opened' | 'interest' | 'adjustment' | 'payment'
const KINDS: readonly string[] = ['opened', 'interest', 'adjustment', 'payment']

/**
 * A row of get_debt_history: every field but description is set (the generated composite
 * type marks them all nullable); `period_id` may be null for a date no period holds.
 */
export interface HistoryEntry {
  entry_id: string
  kind: HistoryKind
  date: string
  /** Its effect on the balance: a payment is negative. */
  amount: number
  /** The remaining amount after it. */
  balance: number
  period_id: string | null
  description: string | null
  created_at: string
}

function readEntry(row: HistoryRead): HistoryEntry | null {
  if (row.kind === null || !KINDS.includes(row.kind) || row.date === null) return null
  return {
    entry_id: row.entry_id ?? '',
    kind: row.kind as HistoryKind,
    date: row.date,
    amount: row.amount ?? 0,
    balance: row.balance ?? 0,
    period_id: row.period_id,
    description: row.description,
    created_at: row.created_at ?? '',
  }
}

/** Rows per page of get_debt_history (the contract allows up to 1000). */
export const HISTORY_PAGE = 1000
/**
 * Pages the chart reads by itself before it stops and says so: 10 000 events, enough for any
 * ordinary debt; the table reads on, page after page, on request.
 */
export const HISTORY_AUTO_PAGES = 10

interface HistoryCursor {
  p_after_date: string
  p_after_kind: string
  p_after_created_at: string
  p_after_id: string
}

/**
 * The debt's history, oldest first, each row with the balance after it, a page at a time: the
 * next page continues after the last row of the one before (all four of its keys); a page
 * shorter than the limit is the last.
 */
// R-DEBT-122: the history read page by page with the database's cursor, never all at once.
export function useDebtHistory(budgetId: string, debtId: string) {
  return useInfiniteQuery({
    queryKey: budgetKeys.debtHistory(budgetId, debtId),
    initialPageParam: null as HistoryCursor | null,
    queryFn: async ({ pageParam }): Promise<HistoryEntry[]> =>
      unwrap(
        await supabase.rpc('get_debt_history', {
          p_debt_id: debtId,
          p_limit: HISTORY_PAGE,
          ...(pageParam ?? {}),
        }),
      )
        .map(readEntry)
        .filter((entry): entry is HistoryEntry => entry !== null),
    getNextPageParam: (page): HistoryCursor | null => {
      const last = page.at(-1)
      if (page.length < HISTORY_PAGE || !last) return null
      return {
        p_after_date: last.date,
        p_after_kind: last.kind,
        p_after_created_at: last.created_at,
        p_after_id: last.entry_id,
      }
    },
  })
}
