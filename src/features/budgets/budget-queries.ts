import { keepPreviousData, useQuery, type QueryKey } from '@tanstack/react-query'

import { budgetKeys } from '@/features/budgets/budget-keys'
import { calendarMonth } from '@/lib/date'
import type { Database, Tables } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

export type MyBudget = Tables<'my_budgets'>
export type PeriodSummary = Tables<'period_summaries'>
export type IncomeOverview = Tables<'income_overview'>
export type BudgetMember = Tables<'budget_member_list'>
export type BudgetInvitation = Tables<'budget_invitations'>
export type MyInvitation = Database['public']['Functions']['list_my_invitations']['Returns'][number]
export type WeekendRule = Database['public']['Enums']['weekend_rule']

export const WEEKEND_RULES: readonly WeekendRule[] = ['nearest', 'previous', 'next', 'none']

/** The data of a successful supabase-js response (its success branch has `error: null`). */
type SuccessData<R> = R extends { error: null; data: infer D } ? D : never

/** Throw the error of a supabase-js call, return its data otherwise. */
export function unwrap<R extends { data: unknown; error: unknown }>(result: R): SuccessData<R> {
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- a PostgrestError, mapped by dbErrorKey
  if (result.error) throw result.error
  return result.data as SuccessData<R>
}

/** The budgets I belong to, by name. Refetched on focus: I may have been removed meanwhile. */
export function useMyBudgets(enabled = true) {
  return useQuery({
    queryKey: budgetKeys.list,
    enabled,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<MyBudget[]> =>
      unwrap(await supabase.from('my_budgets').select('*').order('name').order('id')),
  })
}

/**
 * Periods are created on demand: this runs ensure_periods when a budget is
 * opened, again when the window regains focus after a while, and reports how many it made.
 */
export function useEnsurePeriods(budgetId: string | undefined) {
  return useQuery({
    queryKey: budgetKeys.ensurePeriods(budgetId ?? ''),
    enabled: Boolean(budgetId),
    staleTime: 5 * 60_000,
    // A tab left open across a pay day or midnight catches up: new period, new "today".
    refetchInterval: 15 * 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<number> =>
      unwrap(await supabase.rpc('ensure_periods', { p_budget_id: budgetId ?? '' })),
  })
}

/** The shape pages use from a read: data, its loading and error states, and a retry. */
export interface PeriodRead<T> {
  data: T | undefined
  isPending: boolean
  isSuccess: boolean
  isError: boolean
  error: unknown
  refetch: () => void
}

/**
 * R-PERIOD-052: a read that depends on which periods exist (periods, the current one, and
 * what "today" makes of incomes) waits for ensure_periods to have run, is read again after
 * each run, and fails visibly when ensure_periods fails, never as "no current period".
 */
export function usePeriodDependentQuery<T>(
  budgetId: string,
  queryKey: QueryKey,
  queryFn: () => Promise<T>,
): PeriodRead<T> {
  const ensured = useEnsurePeriods(budgetId)
  const query = useQuery({
    queryKey: [...queryKey, ensured.dataUpdatedAt],
    enabled: ensured.isSuccess,
    // Keep showing the last answer while it is read again after an ensure_periods run.
    placeholderData: keepPreviousData,
    queryFn,
  })
  if (ensured.isError && query.data === undefined) {
    return {
      data: undefined,
      isPending: false,
      isSuccess: false,
      isError: true,
      error: ensured.error,
      refetch: () => void ensured.refetch(),
    }
  }
  return {
    data: query.data,
    isPending: query.data === undefined && !query.isError,
    isSuccess: query.data !== undefined,
    isError: query.isError,
    error: query.error,
    refetch: () => void query.refetch(),
  }
}

/** The actual pay date of a pay day in a month (pay_date), for previews in forms. */
export function usePayDate(
  month: string | null,
  payDay: number,
  weekendRule: WeekendRule,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['pay-date', month, payDay, weekendRule] as const,
    enabled: enabled && month !== null,
    staleTime: Infinity,
    queryFn: async (): Promise<string> => {
      const { year, month: monthNumber } = calendarMonth(month ?? '')
      return unwrap(
        await supabase.rpc('pay_date', {
          p_year: year,
          p_month: monthNumber,
          p_pay_day: payDay,
          p_weekend_rule: weekendRule,
        }),
      )
    },
  })
}

/**
 * The current period, or null when the budget has ended: the database's own answer
 * (get_current_period returns no row), never inferred from a list of periods.
 */
export function useCurrentPeriod(budgetId: string): PeriodRead<PeriodSummary | null> {
  return usePeriodDependentQuery(budgetId, budgetKeys.currentPeriod(budgetId), async () => {
    const rows = unwrap(await supabase.rpc('get_current_period', { p_budget_id: budgetId }))
    return rows[0] ?? null
  })
}

/** All existing periods, newest first. */
export function usePeriods(budgetId: string): PeriodRead<PeriodSummary[]> {
  return usePeriodDependentQuery(budgetId, budgetKeys.periods(budgetId), async () =>
    unwrap(
      await supabase
        .from('period_summaries')
        .select('*')
        .eq('budget_id', budgetId)
        .order('seq', { ascending: false }),
    ),
  )
}

/** Incomes, ended ones included, oldest first (next_pay_date depends on today). */
export function useIncomes(budgetId: string): PeriodRead<IncomeOverview[]> {
  return usePeriodDependentQuery(budgetId, budgetKeys.incomes(budgetId), async () =>
    unwrap(
      await supabase
        .from('income_overview')
        .select('*')
        .eq('budget_id', budgetId)
        .order('created_at')
        .order('id'),
    ),
  )
}

export function useMembers(budgetId: string) {
  return useQuery({
    queryKey: budgetKeys.members(budgetId),
    queryFn: async (): Promise<BudgetMember[]> =>
      unwrap(
        await supabase
          .from('budget_member_list')
          .select('*')
          .eq('budget_id', budgetId)
          .order('joined_at')
          .order('user_id'),
      ),
  })
}

/** Pending invitations of a budget; readable by the owner only. */
export function useBudgetInvitations(budgetId: string, enabled: boolean) {
  return useQuery({
    queryKey: budgetKeys.invitations(budgetId),
    enabled,
    queryFn: async (): Promise<BudgetInvitation[]> =>
      unwrap(
        await supabase
          .from('budget_invitations')
          .select('*')
          .eq('budget_id', budgetId)
          .order('created_at')
          .order('id'),
      ),
  })
}

/** Invitations addressed to my verified email. */
export function useMyInvitations() {
  return useQuery({
    queryKey: budgetKeys.myInvitations,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<MyInvitation[]> => unwrap(await supabase.rpc('list_my_invitations')),
  })
}

/** A member's name for display: display name, then email. */
export function memberName(member: Pick<BudgetMember, 'display_name' | 'email'>): string | null {
  return member.display_name?.trim() || member.email || null
}
