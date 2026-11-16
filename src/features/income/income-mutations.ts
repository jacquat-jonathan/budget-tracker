import { useTranslation } from 'react-i18next'

import { budgetKeys } from '@/features/budgets/budget-keys'
import { unwrap, type IncomeOverview, type WeekendRule } from '@/features/budgets/budget-queries'
import { useAppMutation } from '@/hooks/use-app-mutation'
import { DbError } from '@/lib/db-errors'
import { supabase } from '@/lib/supabase'

export interface IncomeTerms {
  name: string
  amount: number
  payDay: number
  weekendRule: WeekendRule
}

export interface AddIncomeInput extends IncomeTerms {
  /** Whose income; the caller when null. */
  userId: string | null
  /** Period it counts from; the current one when null. */
  fromPeriodId: string | null
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
          ...(input.userId ? { p_user_id: input.userId } : {}),
          ...(input.fromPeriodId ? { p_from_period_id: input.fromPeriodId } : {}),
        }),
      ),
    success: (_id, input) => t('income.added', { name: input.name }),
    onSuccess: () => options.onDone(),
    invalidate: () => affected(budgetId),
  })
}

export interface EditIncomeInput extends IncomeTerms {
  /**
   * An explicit correction: the terms apply from this earlier period on, changing past
   * totals (R-VERSION-010). Null for the normal edit, from the current period.
   */
  fromPeriodId: string | null
}

/**
 * Edit an income: new terms through update_income_terms (a new version from the current
 * period, or from an earlier one as a correction), a new name through a direct update.
 * Terms go first, so a refused change of terms leaves the income as it was.
 */
export function useEditIncome(
  budgetId: string,
  income: IncomeOverview | undefined,
  options: { onDone: () => void },
) {
  const { t } = useTranslation()
  return useAppMutation<null, EditIncomeInput>({
    errorDisplay: 'inline',
    mutationFn: async (input) => {
      if (!income) throw new DbError('income_not_found')
      const termsChanged =
        input.amount !== income.amount ||
        input.payDay !== income.pay_day ||
        input.weekendRule !== income.weekend_rule
      // A correction is always sent: it can also re-apply today's terms to earlier periods.
      if (termsChanged || input.fromPeriodId) {
        unwrap(
          await supabase.rpc('update_income_terms', {
            p_income_id: income.id,
            p_amount: input.amount,
            p_pay_day: input.payDay,
            p_weekend_rule: input.weekendRule,
            ...(input.fromPeriodId ? { p_from_period_id: input.fromPeriodId } : {}),
          }),
        )
      }
      if (input.name !== income.name) {
        const rows = unwrap(
          await supabase
            .from('incomes')
            .update({ name: input.name })
            .eq('id', income.id)
            .select('id'),
        )
        if (rows.length === 0) throw new DbError('income_not_found')
      }
      return null
    },
    success: (_data, input) => t('income.saved', { name: input.name }),
    onSuccess: () => options.onDone(),
    invalidate: () => affected(budgetId),
  })
}

export function useSetPrimaryIncome(budgetId: string) {
  const { t } = useTranslation()
  return useAppMutation<null, IncomeOverview>({
    errorDisplay: 'inline',
    mutationFn: async (income) => {
      unwrap(await supabase.rpc('set_primary_income', { p_income_id: income.id }))
      return null
    },
    success: (_data, income) => t('income.madePrimary', { name: income.name }),
    invalidate: () => [...affected(budgetId), budgetKeys.list],
  })
}

export interface RemoveIncomeInput {
  income: IncomeOverview
  /** An explicit correction: removed from this earlier period on (R-INCOME-015). */
  fromPeriodId: string | null
}

export function useRemoveIncome(budgetId: string) {
  const { t } = useTranslation()
  return useAppMutation<string, RemoveIncomeInput>({
    errorDisplay: 'inline',
    mutationFn: async ({ income, fromPeriodId }) =>
      unwrap(
        await supabase.rpc('remove_income', {
          p_income_id: income.id,
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
