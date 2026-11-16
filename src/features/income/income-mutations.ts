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
  /** The income's revision when the form was opened (useEditBase). */
  revision: number
  /** Told the new revision once the rename is saved, should the terms then be refused. */
  onRenamed?: (revision: number) => void
  /**
   * An explicit correction: the terms apply from this earlier period on, changing past
   * totals. Null for the normal edit, from the current period.
   */
  fromPeriodId: string | null
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
 * Edit an income, sending the revision the form was opened with (D-142): a new name through
 * rename_income, then new terms through update_income_terms with the revision the rename
 * returned (docs/database.md). Either refuses with record_changed when another member
 * changed the income meanwhile.
 */
export function useEditIncome(
  budgetId: string,
  income: IncomeOverview | null | undefined,
  options: { onDone: () => void },
) {
  const { t } = useTranslation()
  const { budget } = useCurrentBudget()
  return useAppMutation<string | null, EditIncomeInput>({
    errorDisplay: 'inline',
    mutationFn: async (input) => {
      if (!income) throw new DbError('income_not_found')
      const termsChanged =
        input.amount !== income.amount ||
        input.payDay !== income.pay_day ||
        input.weekendRule !== income.weekend_rule
      let revision = input.revision
      if (input.name !== income.name) {
        revision = unwrap(
          await supabase.rpc('rename_income', {
            p_income_id: income.id,
            p_name: input.name,
            p_expected_revision: revision,
          }),
        )
        input.onRenamed?.(revision)
      }
      // A correction is always sent: it can also re-apply today's terms to earlier periods.
      if (termsChanged || input.fromPeriodId) {
        unwrap(
          await supabase.rpc('update_income_terms', {
            p_income_id: income.id,
            p_amount: input.amount,
            p_pay_day: input.payDay,
            p_weekend_rule: input.weekendRule,
            p_expected_revision: revision,
            ...(input.fromPeriodId ? { p_from_period_id: input.fromPeriodId } : {}),
          }),
        )
      }
      return income.is_primary && termsChanged
        ? nextExpectedPayDate(budgetId, budget.end_date_entered)
        : null
    },
    success: (next, input) =>
      next
        ? t('income.savedNextExpected', { name: input.name, date: formatCalendarDate(next) })
        : t('income.saved', { name: input.name }),
    onSuccess: () => options.onDone(),
    invalidate: () => affected(budgetId),
  })
}

export function useSetPrimaryIncome(budgetId: string) {
  const { t } = useTranslation()
  const { budget } = useCurrentBudget()
  return useAppMutation<string | null, IncomeOverview>({
    errorDisplay: 'inline',
    mutationFn: async (income) => {
      unwrap(await supabase.rpc('set_primary_income', { p_income_id: income.id }))
      return nextExpectedPayDate(budgetId, budget.end_date_entered)
    },
    success: (next, income) =>
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
