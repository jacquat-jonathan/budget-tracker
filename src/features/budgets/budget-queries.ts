import { useQuery } from '@tanstack/react-query'

import { budgetKeys } from '@/features/budgets/budget-keys'
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
 * Periods are created on demand (R-PERIOD-009): this runs ensure_periods when a budget is
 * opened, again when the window regains focus after a while, and reports how many it made.
 */
export function useEnsurePeriods(budgetId: string | undefined) {
  return useQuery({
    queryKey: budgetKeys.ensurePeriods(budgetId ?? ''),
    enabled: Boolean(budgetId),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<number> =>
      unwrap(await supabase.rpc('ensure_periods', { p_budget_id: budgetId ?? '' })),
  })
}

/** The current period, or null when the budget has ended (get_current_period, no row). */
export function useCurrentPeriod(budgetId: string) {
  return useQuery({
    queryKey: budgetKeys.currentPeriod(budgetId),
    queryFn: async (): Promise<PeriodSummary | null> => {
      const rows = unwrap(await supabase.rpc('get_current_period', { p_budget_id: budgetId }))
      return rows[0] ?? null
    },
  })
}

/** All existing periods, newest first. */
export function usePeriods(budgetId: string) {
  return useQuery({
    queryKey: budgetKeys.periods(budgetId),
    queryFn: async (): Promise<PeriodSummary[]> =>
      unwrap(
        await supabase
          .from('period_summaries')
          .select('*')
          .eq('budget_id', budgetId)
          .order('seq', { ascending: false }),
      ),
  })
}

/** Incomes, ended ones included, oldest first. */
export function useIncomes(budgetId: string) {
  return useQuery({
    queryKey: budgetKeys.incomes(budgetId),
    queryFn: async (): Promise<IncomeOverview[]> =>
      unwrap(
        await supabase
          .from('income_overview')
          .select('*')
          .eq('budget_id', budgetId)
          .order('created_at')
          .order('id'),
      ),
  })
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
