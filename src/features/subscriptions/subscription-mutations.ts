import { useTranslation } from 'react-i18next'

import { budgetKeys } from '@/features/budgets/budget-keys'
import { unwrap } from '@/features/budgets/budget-queries'
import type {
  Subscription,
  SubscriptionCadence,
} from '@/features/subscriptions/subscription-queries'
import type { Transaction } from '@/features/transactions/transaction-queries'
import { useAppMutation } from '@/hooks/use-app-mutation'
import { formatMoney } from '@/lib/money'
import { supabase } from '@/lib/supabase'

// A subscription moves committed figures, charges (transactions), totals and progress:
// refetch everything of the budget.
const affected = (budgetId: string) => [budgetKeys.budget(budgetId)]

export interface CreateSubscriptionInput {
  name: string
  price: number
  cadence: SubscriptionCadence
  categoryId: string
  firstChargeDate: string
  /** An earlier period it counts from (an explicit correction); the current one when null. */
  fromPeriodId: string | null
}

export function useCreateSubscription(budgetId: string, options: { onDone: () => void }) {
  const { t } = useTranslation()
  return useAppMutation<string, CreateSubscriptionInput>({
    errorDisplay: 'inline',
    mutationFn: async (input) => {
      const rows = unwrap(
        await supabase.rpc('create_subscription', {
          p_budget_id: budgetId,
          p_name: input.name,
          p_price: input.price,
          p_cadence: input.cadence,
          p_category_id: input.categoryId,
          p_first_charge_date: input.firstChargeDate,
          ...(input.fromPeriodId ? { p_from_period_id: input.fromPeriodId } : {}),
        }),
      )
      return rows[0]?.id ?? ''
    },
    success: (_row, input) => t('subscriptions.created', { name: input.name }),
    onSuccess: () => options.onDone(),
    invalidate: () => affected(budgetId),
  })
}

/** The terms a save compares with: those in force now, or in the period a correction starts. */
export interface TermsBase {
  price: number
  cadence: SubscriptionCadence
  category_id: string
}

export interface UpdateSubscriptionInput {
  /** The version the form saves over (useEditBase). */
  subscription: Subscription
  /** What the form started from: the terms now, or those of the corrected period. */
  base: TermsBase
  name: string
  price: number
  cadence: SubscriptionCadence
  categoryId: string
  /** A new next charge date (after today, or any date for a correction); null keeps the schedule. */
  nextChargeDate: string | null
  /** An explicit correction from an earlier period; the current period when null. */
  fromPeriodId: string | null
}

/** The terms arguments of an edit, as the save and its preview both send them. */
export interface TermsArgs {
  p_price?: number
  p_cadence?: SubscriptionCadence
  p_next_charge_date?: string
  p_category_id?: string
  p_from_period_id?: string
}

/**
 * The terms part of one edit: only what differs from the terms the form started from (for a
 * correction, those of the period it corrects: never today's terms written over the past),
 * except that price, cadence and the next charge date form one group: when any of them
 * changed, the group is sent whole, as the form shows it. A correction that changes no term is
 * no correction. preview_update_subscription receives exactly these arguments (D-231).
 */
// R-SUBSCRIPTION-122 R-SUBSCRIPTION-140: the group together; only what the user changed.
export function termsArgs(
  input: Pick<
    UpdateSubscriptionInput,
    'base' | 'price' | 'cadence' | 'categoryId' | 'nextChargeDate' | 'fromPeriodId'
  >,
): TermsArgs {
  const { base } = input
  const terms =
    input.price !== base.price || input.cadence !== base.cadence || input.nextChargeDate !== null
  const category = input.categoryId !== base.category_id
  const correcting = input.fromPeriodId !== null && (terms || category)
  return {
    ...(terms ? { p_price: input.price, p_cadence: input.cadence } : {}),
    ...(terms && input.nextChargeDate ? { p_next_charge_date: input.nextChargeDate } : {}),
    ...(category ? { p_category_id: input.categoryId } : {}),
    ...(correcting && input.fromPeriodId ? { p_from_period_id: input.fromPeriodId } : {}),
  }
}

/** One edit: rename and/or new terms (termsArgs). Returns false when there was nothing to save. */
export function useUpdateSubscription(budgetId: string, options: { onDone: () => void }) {
  const { t } = useTranslation()
  return useAppMutation<boolean, UpdateSubscriptionInput>({
    errorDisplay: 'inline',
    // Shown only when what changed is not on the form (the banner says the rest).
    errorMessages: { record_changed: 'subscriptions.changedNotShown' },
    mutationFn: async (input) => {
      const { subscription } = input
      const renamed = input.name !== subscription.name
      const args = termsArgs(input)
      if (!renamed && Object.keys(args).length === 0) return false
      unwrap(
        await supabase.rpc('update_subscription', {
          p_subscription_id: subscription.id,
          p_expected_revision: subscription.revision,
          ...(renamed ? { p_name: input.name } : {}),
          ...args,
        }),
      )
      return true
    },
    success: (saved, input) => (saved ? t('subscriptions.saved', { name: input.name }) : ''),
    onSuccess: (saved) => {
      if (saved) options.onDone()
    },
    invalidate: () => affected(budgetId),
  })
}

export interface EndSubscriptionInput {
  subscription: Subscription
  revision: number
  /** An explicit correction from an earlier period; the current period when null. */
  fromPeriodId: string | null
}

export function useEndSubscription(budgetId: string) {
  const { t } = useTranslation()
  return useAppMutation<string, EndSubscriptionInput>({
    errorDisplay: 'inline',
    errorMessages: { record_changed: 'subscriptions.changedNotShown' },
    mutationFn: async ({ subscription, revision, fromPeriodId }) =>
      unwrap(
        await supabase.rpc('end_subscription', {
          p_subscription_id: subscription.id,
          p_expected_revision: revision,
          ...(fromPeriodId ? { p_from_period_id: fromPeriodId } : {}),
        }),
      ),
    success: (outcome, { subscription }) =>
      outcome === 'deleted'
        ? t('subscriptions.deleted', { name: subscription.name })
        : t('subscriptions.ended', { name: subscription.name }),
    invalidate: () => affected(budgetId),
  })
}

/**
 * Answers to an automatic charge (R-SUBSCRIPTION-075, R-SUBSCRIPTION-077), with the
 * transaction's revision. When another member answered first (record_changed, or the charge is
 * gone), the list is read again and the message says so; nothing is sent again.
 */
/**
 * Every charge awaiting confirmation up to the date, in one call (it acts on what awaits when
 * it runs): the message says how many it confirmed, and when that is not the number the
 * confirmation stated.
 */
export function useConfirmAllCharges(budgetId: string) {
  const { t } = useTranslation()
  return useAppMutation<number, { throughDate: string; stated: number }>({
    mutationFn: async ({ throughDate }) =>
      unwrap(
        await supabase.rpc('confirm_subscription_charges', {
          p_budget_id: budgetId,
          p_through_date: throughDate,
        }),
      ),
    success: (confirmed, { stated }) =>
      confirmed === stated
        ? t('charges.confirmedAll', { count: confirmed })
        : t('charges.confirmedAllOther', { count: confirmed, stated }),
    invalidate: () => affected(budgetId),
  })
}

export function useAnswerCharge(budgetId: string) {
  const { t } = useTranslation()
  const answeredElsewhere = {
    record_changed: 'charges.answeredElsewhere',
    transaction_not_found: 'charges.answeredElsewhere',
  } as const
  const confirm = useAppMutation<null, Transaction>({
    mutationFn: async (charge) => {
      unwrap(
        await supabase.rpc('confirm_subscription_charge', {
          p_transaction_id: charge.id,
          p_expected_revision: charge.revision,
        }),
      )
      return null
    },
    success: (_data, charge) =>
      t('charges.confirmed', {
        name: charge.subscription_name ?? '',
        amount: formatMoney(charge.amount),
      }),
    errorMessages: answeredElsewhere,
    invalidate: () => affected(budgetId),
  })
  const dismiss = useAppMutation<null, Transaction>({
    mutationFn: async (charge) => {
      unwrap(
        await supabase.rpc('dismiss_subscription_charge', {
          p_transaction_id: charge.id,
          p_expected_revision: charge.revision,
        }),
      )
      return null
    },
    success: (_data, charge) =>
      t('charges.dismissed', {
        name: charge.subscription_name ?? '',
        amount: formatMoney(charge.amount),
      }),
    errorMessages: answeredElsewhere,
    invalidate: () => affected(budgetId),
  })
  return { confirm, dismiss }
}
