import { useTranslation } from 'react-i18next'

import { budgetKeys } from '@/features/budgets/budget-keys'
import { unwrap } from '@/features/budgets/budget-queries'
import type { Transaction, TransactionKind } from '@/features/transactions/transaction-queries'
import { useAppMutation } from '@/hooks/use-app-mutation'
import { formatMoney } from '@/lib/money'
import { supabase } from '@/lib/supabase'

// A transaction moves its period's spending, result and progress: refetch the budget.
const affected = (budgetId: string) => [budgetKeys.budget(budgetId)]

export interface TransactionFields {
  kind: TransactionKind
  amount: number
  date: string
  /** None for an extra income. */
  categoryId: string | null
  /** Blank means none. */
  description: string
}

function fieldArgs(input: TransactionFields) {
  const description = input.description.trim()
  return {
    p_kind: input.kind,
    p_amount: input.amount,
    p_date: input.date,
    ...(input.kind !== 'extra_income' && input.categoryId
      ? { p_category_id: input.categoryId }
      : {}),
    ...(description ? { p_description: description } : {}),
  }
}

export function useAddTransaction(budgetId: string) {
  const { t } = useTranslation()
  return useAppMutation<Transaction | null, TransactionFields>({
    errorDisplay: 'inline',
    mutationFn: async (input) => {
      const rows = unwrap(
        await supabase.rpc('add_transaction', { p_budget_id: budgetId, ...fieldArgs(input) }),
      )
      return rows[0] ?? null
    },
    success: (_row, input) =>
      t(`transactions.added.${input.kind}`, { amount: formatMoney(input.amount) }),
    invalidate: () => affected(budgetId),
  })
}

export interface UpdateTransactionInput extends TransactionFields {
  transaction: Transaction
  /** The revision when the form was opened (useEditBase). */
  revision: number
}

/** update_transaction replaces every field: all are sent. */
export function useUpdateTransaction(budgetId: string, options: { onDone: () => void }) {
  const { t } = useTranslation()
  return useAppMutation<Transaction | null, UpdateTransactionInput>({
    errorDisplay: 'inline',
    mutationFn: async (input) => {
      const rows = unwrap(
        await supabase.rpc('update_transaction', {
          p_transaction_id: input.transaction.id,
          p_expected_revision: input.revision,
          ...fieldArgs(input),
        }),
      )
      return rows[0] ?? null
    },
    success: () => t('transactions.saved'),
    onSuccess: () => options.onDone(),
    invalidate: () => affected(budgetId),
  })
}

export function useDeleteTransaction(budgetId: string) {
  const { t } = useTranslation()
  return useAppMutation<null, { transaction: Transaction; revision: number }>({
    errorDisplay: 'inline',
    mutationFn: async ({ transaction, revision }) => {
      unwrap(
        await supabase.rpc('delete_transaction', {
          p_transaction_id: transaction.id,
          p_expected_revision: revision,
        }),
      )
      return null
    },
    success: () => t('transactions.deleted'),
    invalidate: () => affected(budgetId),
  })
}
