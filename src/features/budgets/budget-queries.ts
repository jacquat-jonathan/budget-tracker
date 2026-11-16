import { keepPreviousData, useInfiniteQuery, useQuery, type QueryKey } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'

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
 * After a very long absence one ensure_periods call creates at most 120 periods; it is called
 * again until it answers 0 (each call keeps its progress). Bounded so that a database that
 * never answered 0 would end in an error, not a loop: 100 calls are 1000 years.
 */
const ENSURE_ROUNDS = 100

/**
 * Periods are created on demand: this runs ensure_periods when a budget is opened (until it
 * is caught up), again when the window regains focus after a while, and reports how many it
 * made.
 */
export function useEnsurePeriods(budgetId: string | undefined) {
  return useQuery({
    queryKey: budgetKeys.ensurePeriods(budgetId ?? ''),
    enabled: Boolean(budgetId),
    staleTime: 5 * 60_000,
    // A tab left open across a pay day or midnight catches up: new period, new "today".
    refetchInterval: 15 * 60_000,
    refetchOnWindowFocus: true,
    // R-PERIOD-150: called until caught up, before anything that needs the current period.
    queryFn: async (): Promise<number> => {
      let created = 0
      for (let round = 0; round < ENSURE_ROUNDS; round += 1) {
        const made = unwrap(await supabase.rpc('ensure_periods', { p_budget_id: budgetId ?? '' }))
        if (made === 0) return created
        created += made
      }
      throw new Error('ensure_periods did not catch up')
    },
  })
}

export interface BudgetStatus {
  /** How many automatic charges await confirmation (R-SUBSCRIPTION-135). */
  charges_awaiting: number
  caught_up: boolean
}

/** This budget's counts from my_budgets, read again after each catch-up and each write. */
export function useBudgetStatus(budgetId: string): PeriodRead<BudgetStatus> {
  return usePeriodDependentQuery(budgetId, budgetKeys.status(budgetId), async () => {
    const row = unwrap(
      await supabase
        .from('my_budgets')
        .select('charges_awaiting, caught_up')
        .eq('id', budgetId)
        .maybeSingle(),
    )
    return { charges_awaiting: row?.charges_awaiting ?? 0, caught_up: row?.caught_up !== false }
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

/** Periods per page of list_periods (1 to 200; ten years of monthly periods). */
export const PERIOD_PAGE = 120

export interface PeriodsRead extends PeriodRead<PeriodSummary[]> {
  /** Older periods than those read exist: `loadOlder` reads the next page. */
  hasOlder: boolean
  loadingOlder: boolean
  /** Reads the next page; resolves to every period read so far. */
  loadOlder: () => Promise<PeriodSummary[] | undefined>
}

/**
 * The periods, newest first, a page at a time (list_periods, R-APP-170): the newest page at
 * once, older ones on request. Every caller shares the pages read so far (one cache entry).
 */
// R-PERIOD-191: periods are listed in pages, never all at once.
export function usePeriods(budgetId: string): PeriodsRead {
  const ensured = useEnsurePeriods(budgetId)
  const query = useInfiniteQuery({
    queryKey: [...budgetKeys.periods(budgetId), ensured.dataUpdatedAt],
    enabled: ensured.isSuccess,
    placeholderData: keepPreviousData,
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }): Promise<PeriodSummary[]> =>
      unwrap(
        await supabase.rpc('list_periods', {
          p_budget_id: budgetId,
          p_limit: PERIOD_PAGE,
          ...(pageParam !== null ? { p_before_seq: pageParam } : {}),
        }),
      ),
    getNextPageParam: (page): number | null => {
      const last = page.at(-1)
      return page.length < PERIOD_PAGE || !last ? null : last.seq
    },
  })
  const pages = query.data?.pages
  const data = useMemo(() => pages?.flat(), [pages])
  const { fetchNextPage } = query
  const loadOlder = useCallback(
    async () => (await fetchNextPage()).data?.pages.flat(),
    [fetchNextPage],
  )
  const older = {
    hasOlder: query.hasNextPage,
    loadingOlder: query.isFetchingNextPage,
    loadOlder,
  }
  if (ensured.isError && data === undefined) {
    return {
      data: undefined,
      isPending: false,
      isSuccess: false,
      isError: true,
      error: ensured.error,
      refetch: () => void ensured.refetch(),
      ...older,
    }
  }
  return {
    data,
    isPending: data === undefined && !query.isError,
    isSuccess: data !== undefined,
    isError: query.isError && data === undefined,
    error: query.error,
    refetch: () => void query.refetch(),
    ...older,
  }
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
