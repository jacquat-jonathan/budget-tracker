import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { budgetKeys } from '@/features/budgets/budget-keys'
import { unwrap, usePeriodDependentQuery, type PeriodRead } from '@/features/budgets/budget-queries'
import { useRecord } from '@/features/budgets/record-queries'
import type { TermsArgs } from '@/features/subscriptions/subscription-mutations'
import type { Transaction } from '@/features/transactions/transaction-queries'
import type { Database, Tables } from '@/lib/database.types'
import { isCalendarDate } from '@/lib/date'
import { supabase } from '@/lib/supabase'

export type SubscriptionCadence = Database['public']['Enums']['subscription_cadence']
export const SUBSCRIPTION_CADENCES: readonly SubscriptionCadence[] = [
  'monthly',
  'quarterly',
  'half_yearly',
  'yearly',
]

type SubscriptionRead = Tables<'subscription_overview'>

/**
 * A subscription as the contract describes it: the counts, the monthly cost and the flags are
 * never null (the generated view type marks them nullable); next_charge_date is null once it
 * has ended or the budget has, and the category names follow the category. Narrowed here, once.
 */
export interface Subscription extends Omit<
  SubscriptionRead,
  'is_active' | 'monthly_cost' | 'charge_count' | 'awaiting_count' | 'removal_deletes'
> {
  is_active: boolean
  monthly_cost: number
  charge_count: number
  awaiting_count: number
  removal_deletes: boolean
}

export function readSubscription(row: SubscriptionRead): Subscription {
  return {
    ...row,
    is_active: row.is_active === true,
    monthly_cost: row.monthly_cost ?? 0,
    charge_count: row.charge_count ?? 0,
    awaiting_count: row.awaiting_count ?? 0,
    removal_deletes: row.removal_deletes === true,
  }
}

/** A void subscription was never in force (removed in its first period, kept for its charges). */
export function isVoidSubscription(subscription: Pick<Subscription, 'first_seq' | 'end_seq'>) {
  return subscription.end_seq !== null && subscription.end_seq <= subscription.first_seq
}

/**
 * Every subscription, ended and void ones included, by name. Next charge dates, counts and
 * "in force now" depend on today and on the charges the catch-up created, so the read waits
 * for ensure_periods (R-PERIOD-052).
 */
export function useSubscriptions(budgetId: string): PeriodRead<Subscription[]> {
  return usePeriodDependentQuery(budgetId, budgetKeys.subscriptions(budgetId), async () =>
    unwrap(
      await supabase
        .from('subscription_overview')
        .select('*')
        .eq('budget_id', budgetId)
        .order('name')
        .order('id'),
    ).map(readSubscription),
  )
}

/** One subscription read by its id (for an edit form or a removal), narrowed. */
export function useSubscriptionRecord(
  budgetId: string,
  id: string | undefined,
): Subscription | null | undefined {
  const row = useRecord('subscription_overview', budgetId, id)
  return useMemo(() => (row ? readSubscription(row) : row), [row])
}

/** A previewed charge: its date, and whether the save creates it straight away. */
export interface PreviewCharge {
  date: string
  atOnce: boolean
}

/** Upcoming charges a form shows. */
export const PREVIEW_SHOWN = 6
const PREVIEW_COUNT = PREVIEW_SHOWN
/**
 * A new subscription's preview asks for the most the database gives (60), so that the
 * charges created with it, dated in the past, are all counted, however far back it starts.
 */
export const PREVIEW_CREATE_COUNT = 60

/**
 * The charges create_subscription would make with these arguments
 * (preview_create_subscription): the client never works a schedule out (C-LOGIC-003).
 * Under the budget's key: what it answers depends on the periods and today.
 */
export function usePreviewCreate(
  budgetId: string,
  args: { cadence: SubscriptionCadence; firstChargeDate: string; fromPeriodId: string | null },
) {
  const valid = isCalendarDate(args.firstChargeDate)
  return useQuery({
    queryKey: [...budgetKeys.budget(budgetId), 'preview-create-subscription', args] as const,
    enabled: valid,
    queryFn: async (): Promise<PreviewCharge[]> =>
      unwrap(
        await supabase.rpc('preview_create_subscription', {
          p_budget_id: budgetId,
          p_cadence: args.cadence,
          p_first_charge_date: args.firstChargeDate,
          p_count: PREVIEW_CREATE_COUNT,
          ...(args.fromPeriodId ? { p_from_period_id: args.fromPeriodId } : {}),
        }),
      ).map((row) => ({ date: row.charge_date, atOnce: row.charged_at_once })),
  })
}

/**
 * The next charge dates update_subscription would produce with exactly the terms arguments
 * the save will send (preview_update_subscription, D-231).
 */
export function usePreviewUpdate(
  budgetId: string,
  subscriptionId: string | undefined,
  args: TermsArgs,
  enabled = true,
) {
  return useQuery({
    queryKey: [
      ...budgetKeys.budget(budgetId),
      'preview-update-subscription',
      subscriptionId ?? '',
      args,
    ] as const,
    enabled: enabled && subscriptionId !== undefined,
    queryFn: async (): Promise<PreviewCharge[]> =>
      unwrap(
        await supabase.rpc('preview_update_subscription', {
          p_subscription_id: subscriptionId ?? '',
          p_count: PREVIEW_COUNT,
          ...args,
        }),
      ).map((date) => ({ date, atOnce: false })),
  })
}

/**
 * The automatic charges awaiting confirmation, oldest first (R-SUBSCRIPTION-076). The call
 * catches the budget up itself, like get_current_period; it is read after ensure_periods so
 * that a new day's charges appear with the new day.
 */
export function useAwaitingCharges(budgetId: string): PeriodRead<Transaction[]> {
  return usePeriodDependentQuery(budgetId, budgetKeys.awaitingCharges(budgetId), async () =>
    unwrap(
      await supabase.rpc('list_charges_awaiting_confirmation', {
        p_budget_id: budgetId,
        p_limit: 50,
      }),
    ),
  )
}
