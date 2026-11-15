import { useTranslation } from 'react-i18next'

import { budgetKeys } from '@/features/budgets/budget-keys'
import { unwrap, type WeekendRule } from '@/features/budgets/budget-queries'
import { useAppMutation } from '@/hooks/use-app-mutation'
import { formatCalendarDate } from '@/lib/date'
import { DbError } from '@/lib/db-errors'
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

export interface CreateBudgetResult {
  budgetId: string
  /** Set when an end date was asked for but could not be stored. */
  endDateError?: unknown
}

/**
 * create_budget, then the end date if one was given. create_budget takes no end date, so
 * this is two calls: when the second fails, the budget exists without an end date and the
 * caller says so (see the report: contract gap).
 */
export function useCreateBudget(options: { onCreated: (result: CreateBudgetResult) => void }) {
  const { t } = useTranslation()
  return useAppMutation<CreateBudgetResult, CreateBudgetInput>({
    errorDisplay: 'inline',
    mutationFn: async (input) => {
      const budgetId = unwrap(
        await supabase.rpc('create_budget', {
          p_name: input.name,
          p_income_name: input.incomeName,
          p_amount: input.amount,
          p_pay_day: input.payDay,
          p_weekend_rule: input.weekendRule,
          ...(input.startMonth ? { p_start_month: input.startMonth } : {}),
        }),
      )
      if (input.endDate) {
        const { error } = await supabase.rpc('set_budget_end_date', {
          p_budget_id: budgetId,
          p_end_date: input.endDate,
        })
        if (error) return { budgetId, endDateError: error }
      }
      return { budgetId }
    },
    success: (_result, input) => t('budgets.create.success', { name: input.name }),
    invalidate: () => [budgetKeys.list],
    onSuccess: (result) => options.onCreated(result),
  })
}

/** Rename a budget: a direct update of budgets.name (members). */
export function useRenameBudget(budgetId: string) {
  const { t } = useTranslation()
  return useAppMutation<void, string>({
    errorDisplay: 'inline',
    mutationFn: async (name) => {
      const rows = unwrap(
        await supabase.from('budgets').update({ name }).eq('id', budgetId).select('id'),
      )
      if (rows.length === 0) throw new DbError('budget_not_found')
    },
    success: () => t('settings.budget.renamed'),
    invalidate: () => [budgetKeys.list],
  })
}

/** Set (or with null, clear) the end date; owner only. Returns the stored date. */
export function useSetBudgetEndDate(budgetId: string) {
  const { t } = useTranslation()
  return useAppMutation<string | null, string | null>({
    errorDisplay: 'inline',
    mutationFn: async (endDate) =>
      unwrap(
        await supabase.rpc('set_budget_end_date', {
          p_budget_id: budgetId,
          // The contract takes null to clear the end date; the generated type says string.
          p_end_date: endDate as string,
        }),
      ),
    success: (stored) =>
      stored
        ? t('settings.budget.endDateSet', { date: formatCalendarDate(stored) })
        : t('settings.budget.endDateCleared'),
    invalidate: () => [budgetKeys.list, budgetKeys.budget(budgetId)],
  })
}

/** Delete a budget and everything in it; owner only (a member's delete affects 0 rows). */
export function useDeleteBudget(budgetId: string, options: { onDeleted: () => void }) {
  const { t } = useTranslation()
  return useAppMutation<void, string>({
    errorDisplay: 'inline',
    mutationFn: async () => {
      const rows = unwrap(await supabase.from('budgets').delete().eq('id', budgetId).select('id'))
      if (rows.length === 0) throw new DbError('not_owner')
    },
    success: (_data, name) => t('settings.budget.deleted', { name }),
    onSuccess: () => options.onDeleted(),
    invalidate: () => [budgetKeys.list],
  })
}
