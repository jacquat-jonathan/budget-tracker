import { useTranslation } from 'react-i18next'

import { budgetKeys } from '@/features/budgets/budget-keys'
import { unwrap, type MyBudget, type WeekendRule } from '@/features/budgets/budget-queries'
import { useBudgets } from '@/features/budgets/current-budget-context'
import { useAppMutation } from '@/hooks/use-app-mutation'
import { formatCalendarDate } from '@/lib/date'
import { supabase } from '@/lib/supabase'

export interface CreateBudgetInput {
  name: string
  endDate: string | null
  incomeName: string
  amount: number
  payDay: number
  weekendRule: WeekendRule
  /** First day of the month to start tracking from; null for the current period. */
  startMonth: string | null
}

/** create_budget: the budget, its first income, its periods and its end date, in one step. */
export function useCreateBudget(options: { onCreated: (budgetId: string) => void }) {
  const { t } = useTranslation()
  return useAppMutation<string, CreateBudgetInput>({
    errorDisplay: 'inline',
    mutationFn: async (input) =>
      unwrap(
        await supabase.rpc('create_budget', {
          p_name: input.name,
          p_income_name: input.incomeName,
          p_amount: input.amount,
          p_pay_day: input.payDay,
          p_weekend_rule: input.weekendRule,
          ...(input.startMonth ? { p_start_month: input.startMonth } : {}),
          ...(input.endDate ? { p_end_date: input.endDate } : {}),
        }),
      ),
    success: (_budgetId, input) => t('budgets.create.success', { name: input.name }),
    invalidate: () => [budgetKeys.list],
    onSuccess: (budgetId) => options.onCreated(budgetId),
  })
}

/** Rename a budget (members), sending the revision the form was opened with. */
export function useRenameBudget(budgetId: string) {
  const { t } = useTranslation()
  return useAppMutation<number, { name: string; revision: number }>({
    errorDisplay: 'inline',
    mutationFn: async ({ name, revision }) =>
      unwrap(
        await supabase.rpc('rename_budget', {
          p_budget_id: budgetId,
          p_name: name,
          p_expected_revision: revision,
        }),
      ),
    success: () => t('settings.budget.renamed'),
    invalidate: () => [budgetKeys.list],
  })
}

/**
 * Set the end date (the budget then ends with the period of that date's month), or with
 * null clear it; owner only. Returns the budget as stored, whose end_date is the final
 * period's last day.
 */
export function useSetBudgetEndDate(budgetId: string) {
  const { t } = useTranslation()
  return useAppMutation<MyBudget | null, { endDate: string | null; revision: number }>({
    errorDisplay: 'inline',
    mutationFn: async ({ endDate, revision }) => {
      const rows = unwrap(
        await supabase.rpc('set_budget_end_date', {
          p_budget_id: budgetId,
          p_expected_revision: revision,
          ...(endDate ? { p_end_date: endDate } : {}),
        }),
      )
      return rows[0] ?? null
    },
    success: (stored) =>
      stored?.end_date
        ? t('settings.budget.endDateSet', { date: formatCalendarDate(stored.end_date) })
        : t('settings.budget.endDateCleared'),
    invalidate: () => [budgetKeys.list, budgetKeys.budget(budgetId)],
  })
}

/** Delete a budget and everything in it; owner only. */
export function useDeleteBudget(budgetId: string, options: { onDeleted: () => void }) {
  const { t } = useTranslation()
  const { expectBudgetGone } = useBudgets()
  return useAppMutation<null, string>({
    errorDisplay: 'inline',
    errorMessages: { budget_not_found: 'settings.budget.alreadyDeleted' },
    mutationFn: async () => {
      unwrap(await supabase.rpc('delete_budget', { p_budget_id: budgetId }))
      return null
    },
    success: (_data, name) => t('settings.budget.deleted', { name }),
    onSuccess: () => {
      expectBudgetGone(budgetId)
      options.onDeleted()
    },
    invalidate: () => [budgetKeys.list],
  })
}
