import { useTranslation } from 'react-i18next'

import { budgetKeys } from '@/features/budgets/budget-keys'
import { unwrap, type IncomeOverview, type WeekendRule } from '@/features/budgets/budget-queries'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'
import { nextSalary } from '@/features/periods/next-salary'
import { useAppMutation } from '@/hooks/use-app-mutation'
import { formatCalendarDate } from '@/lib/date'
import { DbError } from '@/lib/db-errors'
import { supabase } from '@/lib/supabase'

export interface IncomeTerms {
  name: string
  amount: number
  payDay: number
  weekendRule: WeekendRule
  /** The account it is paid into; null: none (R-ACCOUNT-236). */
  accountId: string | null
}

export interface AddIncomeInput extends IncomeTerms {
  /** Whose income; the caller when null. */
  userId: string | null
  /** Period it counts from; the current one when null. */
  fromPeriodId: string | null
  /** The form's request id (useClientId). */
  clientId: string
}

// An income change can move the current period's end and changes period totals: refetch
// everything of the budget.
const affected = (budgetId: string) => [budgetKeys.budget(budgetId)]

export function useAddIncome(budgetId: string, options: { onDone: () => void }) {
  const { t } = useTranslation()
  return useAppMutation<string, AddIncomeInput>({
    errorDisplay: 'inline',
    mutationFn: async (input) =>
      unwrap(
        await supabase.rpc('add_income', {
          p_budget_id: budgetId,
          p_name: input.name,
          p_amount: input.amount,
          p_pay_day: input.payDay,
          p_weekend_rule: input.weekendRule,
          p_client_id: input.clientId,
          ...(input.userId ? { p_user_id: input.userId } : {}),
          ...(input.accountId ? { p_account_id: input.accountId } : {}),
          ...(input.fromPeriodId ? { p_from_period_id: input.fromPeriodId } : {}),
        }),
      ),
    success: (_id, input) => t('income.added', { name: input.name }),
    onSuccess: () => options.onDone(),
    invalidate: () => affected(budgetId),
  })
}

export interface EditIncomeInput extends IncomeTerms {
  /** The income's revision when the form was opened (useEditBase). */
  revision: number
  /**
   * The current period's end the preview showed (preview_update_income), sent so the save is
   * refused when the period would now end on another day. Null when nothing was previewed.
   */
  previewedEndDate: string | null
  /**
   * An explicit correction: the terms apply from this earlier period on, changing past
   * totals. Null for the normal edit, from the current period.
   */
  fromPeriodId: string | null
  /** The terms the form started from: those now, or those of the corrected period. */
  base?: {
    amount: number
    pay_day: number
    weekend_rule: WeekendRule
    account_id: string | null
  }
}

/**
 * R-INCOME-054: after the primary income's terms change, the next pay date the database now
 * expects (the current period's end, re-projected unless set by hand, plus one day). Read
 * back from the database: the client does not project it. Null when the budget has ended
 * or the current period is its last (nextSalary).
 */
async function nextExpectedPayDate(
  budgetId: string,
  endDateEntered: string | null,
): Promise<string | null> {
  const rows = unwrap(await supabase.rpc('get_current_period', { p_budget_id: budgetId }))
  const next = nextSalary(rows[0] ?? null, endDateEntered)
  return next.kind === 'expected' ? next.date : null
}

/**
 * Edit an income in one call (update_income), with the revision the form was opened with
 * (D-150): only what changed is sent, the name and any of the terms, compared with the terms
 * the form started from (for a correction, those in force in its period: today's terms are
 * never written over the past unasked); a correction changing no term is sent without it.
 * Refused with
 * record_changed when another member changed the income meanwhile, or when the period
 * would now end on another day than the preview said.
 */
export function useEditIncome(
  budgetId: string,
  income: IncomeOverview | null | undefined,
  options: { onDone: () => void },
) {
  const { t } = useTranslation()
  const { budget } = useCurrentBudget()
  // false: nothing to send (the window stays open and says so).
  return useAppMutation<string | null | false, EditIncomeInput>({
    errorDisplay: 'inline',
    // A change this form does not show (the primary switch moves both incomes' revisions).
    errorMessages: { record_changed: 'corrections.changedNotShown' },
    mutationFn: async (input) => {
      if (!income) throw new DbError('income_not_found')
      const from = input.base ?? income
      const amount = input.amount !== from.amount
      // The pay day and its weekend rule are one value (D-160): either changed sends both.
      const payDay = input.payDay !== from.pay_day || input.weekendRule !== from.weekend_rule
      const weekendRule = payDay
      // R-ACCOUNT-236: the account is a term like the amount, sent only when it changed.
      const account = input.accountId !== (from.account_id ?? null)
      // R-VERSION-140: a correction sends only what the user changed.
      const correcting = input.fromPeriodId !== null && (amount || payDay || account)
      const renamed = input.name !== income.name
      if (!renamed && !amount && !payDay && !weekendRule && !account) return false
      unwrap(
        await supabase.rpc('update_income', {
          p_income_id: income.id,
          p_expected_revision: input.revision,
          ...(renamed ? { p_name: input.name } : {}),
          ...(amount ? { p_amount: input.amount } : {}),
          ...(payDay ? { p_pay_day: input.payDay } : {}),
          ...(weekendRule ? { p_weekend_rule: input.weekendRule } : {}),
          ...(account
            ? input.accountId
              ? { p_account_id: input.accountId }
              : { p_clear_account: true }
            : {}),
          ...(correcting && input.fromPeriodId ? { p_from_period_id: input.fromPeriodId } : {}),
          ...(input.previewedEndDate ? { p_previewed_end_date: input.previewedEndDate } : {}),
        }),
      )
      const scheduleChanged =
        input.payDay !== income.pay_day || input.weekendRule !== income.weekend_rule
      return income.is_primary && scheduleChanged
        ? nextExpectedPayDate(budgetId, budget.end_date_entered)
        : null
    },
    success: (next, input) =>
      next === false
        ? ''
        : next
          ? t('income.savedNextExpected', { name: input.name, date: formatCalendarDate(next) })
          : t('income.saved', { name: input.name }),
    onSuccess: (next) => {
      if (next !== false) options.onDone()
    },
    invalidate: () => affected(budgetId),
  })
}

export interface SetPrimaryInput {
  income: IncomeOverview
  /** The budget's revision when the confirmation was opened. */
  budgetRevision: number
  /** The current period's end the preview showed. */
  previewedEndDate: string | null
}

export function useSetPrimaryIncome(budgetId: string) {
  const { t } = useTranslation()
  const { budget } = useCurrentBudget()
  return useAppMutation<string | null, SetPrimaryInput>({
    errorDisplay: 'inline',
    mutationFn: async ({ income, budgetRevision, previewedEndDate }) => {
      unwrap(
        await supabase.rpc('set_primary_income', {
          p_income_id: income.id,
          // The primary income is a field of the budget: the budget's revision (D-150).
          p_expected_revision: budgetRevision,
          ...(previewedEndDate ? { p_previewed_end_date: previewedEndDate } : {}),
        }),
      )
      return nextExpectedPayDate(budgetId, budget.end_date_entered)
    },
    success: (next, { income }) =>
      next
        ? t('income.madePrimaryNextExpected', { name: income.name, date: formatCalendarDate(next) })
        : t('income.madePrimary', { name: income.name }),
    invalidate: () => [...affected(budgetId), budgetKeys.list],
  })
}

export interface RemoveIncomeInput {
  income: IncomeOverview
  /** The revision when the confirmation was opened. */
  revision: number
  /** An explicit correction: removed from this earlier period on. */
  fromPeriodId: string | null
}

export function useRemoveIncome(budgetId: string) {
  const { t } = useTranslation()
  return useAppMutation<string, RemoveIncomeInput>({
    errorDisplay: 'inline',
    mutationFn: async ({ income, revision, fromPeriodId }) =>
      unwrap(
        await supabase.rpc('remove_income', {
          p_income_id: income.id,
          p_expected_revision: revision,
          ...(fromPeriodId ? { p_from_period_id: fromPeriodId } : {}),
        }),
      ),
    success: (outcome, { income }) =>
      outcome === 'ended'
        ? t('income.removedEnded', { name: income.name })
        : t('income.removedDeleted', { name: income.name }),
    invalidate: () => affected(budgetId),
  })
}
