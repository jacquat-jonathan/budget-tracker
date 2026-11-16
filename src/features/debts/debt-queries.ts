import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { budgetKeys } from '@/features/budgets/budget-keys'
import { unwrap, usePeriodDependentQuery, type PeriodRead } from '@/features/budgets/budget-queries'
import { useRecord } from '@/features/budgets/record-queries'
import type { Database, Tables } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

type DebtRead = Tables<'debt_overview'>
export type Payoff = 'paid_off' | 'ends' | 'never'

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
> {
  is_active: boolean
  interest_total: number
  adjustment_total: number
  paid_total: number
  remaining: number
  payoff: Payoff | null
  has_history: boolean
  removal_deletes: boolean
}

const PAYOFFS: readonly string[] = ['paid_off', 'ends', 'never']

export function readDebt(row: DebtRead): Debt {
  return {
    ...row,
    is_active: row.is_active === true,
    interest_total: row.interest_total ?? 0,
    adjustment_total: row.adjustment_total ?? 0,
    paid_total: row.paid_total ?? 0,
    remaining: row.remaining ?? 0,
    payoff: row.payoff !== null && PAYOFFS.includes(row.payoff) ? (row.payoff as Payoff) : null,
    has_history: row.has_history === true,
    removal_deletes: row.removal_deletes === true,
  }
}

/**
 * How much of what was owed is paid off, in percent, for a bar only: never a money figure.
 * Paid and remaining are the database's.
 */
export function paidShare(debt: Pick<Debt, 'paid_total' | 'remaining'>): number {
  const paid = Math.max(debt.paid_total, 0)
  const owed = paid + Math.max(debt.remaining, 0)
  return owed <= 0 ? 0 : Math.round((paid / owed) * 100)
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

/** R-DEBT-004: the debt's history, oldest first, each row with the balance after it. */
export function useDebtHistory(budgetId: string, debtId: string) {
  return useQuery({
    queryKey: budgetKeys.debtHistory(budgetId, debtId),
    queryFn: async (): Promise<HistoryEntry[]> =>
      unwrap(await supabase.rpc('get_debt_history', { p_debt_id: debtId }))
        .map(readEntry)
        .filter((entry): entry is HistoryEntry => entry !== null),
  })
}
