import { useTranslation } from 'react-i18next'

import { budgetKeys } from '@/features/budgets/budget-keys'
import { unwrap } from '@/features/budgets/budget-queries'
import type { Debt } from '@/features/debts/debt-queries'
import { useAppMutation } from '@/hooks/use-app-mutation'
import { interestRateValue } from '@/lib/interest-rate'
import { formatMoney } from '@/lib/money'
import { supabase } from '@/lib/supabase'

// A debt moves its remaining amount, its projection and the history; refetch the budget.
const affected = (budgetId: string) => [budgetKeys.budget(budgetId)]

export interface CreateDebtInput {
  name: string
  principal: number
  categoryId: string
  monthlyPayment: number
  /** The canonical decimal string (parseInterestRate); "0" for none. */
  rate: string
  fromPeriodId: string | null
}

export function useCreateDebt(budgetId: string, options: { onDone: (id: string) => void }) {
  const { t } = useTranslation()
  return useAppMutation<string, CreateDebtInput>({
    errorDisplay: 'inline',
    mutationFn: async (input) => {
      const rows = unwrap(
        await supabase.rpc('create_debt', {
          p_budget_id: budgetId,
          p_name: input.name,
          p_principal: input.principal,
          p_category_id: input.categoryId,
          p_monthly_payment: input.monthlyPayment,
          ...(input.rate !== '0' ? { p_interest_rate: interestRateValue(input.rate) } : {}),
          ...(input.fromPeriodId ? { p_from_period_id: input.fromPeriodId } : {}),
        }),
      )
      return rows[0]?.id ?? ''
    },
    success: (_id, input) => t('debts.created', { name: input.name }),
    onSuccess: (id) => options.onDone(id),
    invalidate: () => affected(budgetId),
  })
}

export interface UpdateDebtInput {
  /** The version the form saves over (useEditBase). */
  debt: Debt
  name: string
  categoryId: string
  /** Only while the debt has no history. */
  principal: number
  rate: string
  monthlyPayment: number
  fromPeriodId: string | null
}

/** One edit, only what changed; a correction always sends the terms. */
export function useUpdateDebt(budgetId: string, options: { onDone: () => void }) {
  const { t } = useTranslation()
  return useAppMutation<boolean, UpdateDebtInput>({
    errorDisplay: 'inline',
    mutationFn: async (input) => {
      const { debt } = input
      const correcting = input.fromPeriodId !== null
      const rate = interestRateValue(input.rate)
      const changes = {
        ...(input.name !== debt.name ? { p_name: input.name } : {}),
        ...(input.categoryId !== debt.category_id ? { p_category_id: input.categoryId } : {}),
        ...(!debt.has_history && input.principal !== debt.principal
          ? { p_principal: input.principal }
          : {}),
        ...(correcting || rate !== debt.interest_rate ? { p_interest_rate: rate } : {}),
        ...(correcting || input.monthlyPayment !== debt.monthly_payment
          ? { p_monthly_payment: input.monthlyPayment }
          : {}),
      }
      if (Object.keys(changes).length === 0) return false
      unwrap(
        await supabase.rpc('update_debt', {
          p_debt_id: debt.id,
          p_expected_revision: debt.revision,
          ...changes,
          ...(correcting && input.fromPeriodId ? { p_from_period_id: input.fromPeriodId } : {}),
        }),
      )
      return true
    },
    success: (saved, input) => (saved ? t('debts.saved', { name: input.name }) : ''),
    onSuccess: () => options.onDone(),
    invalidate: () => affected(budgetId),
  })
}

export function useRemoveDebt(budgetId: string) {
  const { t } = useTranslation()
  return useAppMutation<string, { debt: Debt; revision: number; fromPeriodId: string | null }>({
    errorDisplay: 'inline',
    mutationFn: async ({ debt, revision, fromPeriodId }) =>
      unwrap(
        await supabase.rpc('remove_debt', {
          p_debt_id: debt.id,
          p_expected_revision: revision,
          ...(fromPeriodId ? { p_from_period_id: fromPeriodId } : {}),
        }),
      ),
    success: (outcome, { debt }) =>
      outcome === 'deleted'
        ? t('debts.deleted', { name: debt.name })
        : t('debts.ended', { name: debt.name }),
    invalidate: () => affected(budgetId),
  })
}

export interface AdjustBalanceInput {
  debt: Debt
  revision: number
  /** The balance the bank shows; the database records the difference. */
  balance: number
  /** Today when null. */
  date: string | null
  note: string
}

/** R-DEBT-075: match the bank statement. */
export function useAdjustBalance(budgetId: string, options: { onDone: () => void }) {
  const { t } = useTranslation()
  return useAppMutation<null, AdjustBalanceInput>({
    errorDisplay: 'inline',
    mutationFn: async ({ debt, revision, balance, date, note }) => {
      const trimmed = note.trim()
      unwrap(
        await supabase.rpc('adjust_debt_balance', {
          p_debt_id: debt.id,
          p_expected_revision: revision,
          p_balance: balance,
          ...(date ? { p_date: date } : {}),
          ...(trimmed ? { p_note: trimmed } : {}),
        }),
      )
      return null
    },
    success: (_data, { balance }) => t('debts.adjust.done', { amount: formatMoney(balance) }),
    onSuccess: () => options.onDone(),
    invalidate: () => affected(budgetId),
  })
}

/** Deleting an adjustment names the **debt's** revision (docs/database.md). */
export function useDeleteAdjustment(budgetId: string) {
  const { t } = useTranslation()
  return useAppMutation<null, { adjustmentId: string; debtRevision: number }>({
    errorDisplay: 'inline',
    mutationFn: async ({ adjustmentId, debtRevision }) => {
      unwrap(
        await supabase.rpc('delete_debt_adjustment', {
          p_adjustment_id: adjustmentId,
          p_expected_revision: debtRevision,
        }),
      )
      return null
    },
    success: () => t('debts.adjust.deleted'),
    invalidate: () => affected(budgetId),
  })
}
