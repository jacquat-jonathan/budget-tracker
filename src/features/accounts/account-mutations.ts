import { useTranslation } from 'react-i18next'

import type { Account, AccountKind } from '@/features/accounts/account-queries'
import { budgetKeys } from '@/features/budgets/budget-keys'
import { unwrap } from '@/features/budgets/budget-queries'
import { useAppMutation } from '@/hooks/use-app-mutation'
import { supabase } from '@/lib/supabase'

// An account appears in incomes, transfers, checklists and the money flow: refetch the budget.
const affected = (budgetId: string) => [budgetKeys.budget(budgetId)]

export interface AccountFields {
  name: string
  kind: AccountKind
  /** Blank is none. */
  bankLabel: string
  /** The member it belongs to; null: shared. */
  userId: string | null
}

export interface CreateAccountInput extends AccountFields {
  /** An earlier period it counts from; the current one when null. */
  fromPeriodId: string | null
  clientId: string
}

export function useCreateAccount(budgetId: string, options: { onDone: () => void }) {
  const { t } = useTranslation()
  return useAppMutation<string, CreateAccountInput>({
    errorDisplay: 'inline',
    mutationFn: async (input) => {
      const label = input.bankLabel.trim()
      const rows = unwrap(
        await supabase.rpc('create_account', {
          p_budget_id: budgetId,
          p_name: input.name,
          p_kind: input.kind,
          p_client_id: input.clientId,
          ...(label ? { p_bank_label: label } : {}),
          ...(input.userId ? { p_user_id: input.userId } : {}),
          ...(input.fromPeriodId ? { p_from_period_id: input.fromPeriodId } : {}),
        }),
      )
      return rows[0]?.id ?? ''
    },
    success: (_id, input) => t('accounts.created', { name: input.name }),
    onSuccess: () => options.onDone(),
    invalidate: () => affected(budgetId),
  })
}

/**
 * The arguments of one edit: only what differs from the version opened, a cleared label or
 * holder said with its p_clear_* flag. Empty when nothing changed.
 */
export function accountEditArgs(account: Account, input: AccountFields) {
  const label = input.bankLabel.trim()
  const before = account.bank_label ?? ''
  return {
    ...(input.name !== account.name ? { p_name: input.name } : {}),
    ...(input.kind !== account.kind ? { p_kind: input.kind } : {}),
    ...(label !== before ? (label ? { p_bank_label: label } : { p_clear_bank_label: true }) : {}),
    ...(input.userId !== account.user_id
      ? input.userId
        ? { p_user_id: input.userId }
        : { p_clear_user: true }
      : {}),
  }
}

/** One edit (rename, kind, label, holder). Returns false when there was nothing to save. */
export function useUpdateAccount(budgetId: string, options: { onDone: () => void }) {
  const { t } = useTranslation()
  return useAppMutation<boolean, AccountFields & { account: Account }>({
    errorDisplay: 'inline',
    errorMessages: { record_changed: 'accounts.changedNotShown' },
    mutationFn: async ({ account, ...input }) => {
      const args = accountEditArgs(account, input)
      if (Object.keys(args).length === 0) return false
      unwrap(
        await supabase.rpc('update_account', {
          p_account_id: account.id,
          p_expected_revision: account.revision,
          ...args,
        }),
      )
      return true
    },
    success: (saved, input) => (saved ? t('accounts.saved', { name: input.name }) : ''),
    onSuccess: (saved) => {
      if (saved) options.onDone()
    },
    invalidate: () => affected(budgetId),
  })
}

export function useCloseAccount(budgetId: string) {
  const { t } = useTranslation()
  return useAppMutation<
    string,
    { account: Account; revision: number; fromPeriodId: string | null }
  >({
    errorDisplay: 'inline',
    errorMessages: { record_changed: 'accounts.changedNotShown' },
    mutationFn: async ({ account, revision, fromPeriodId }) =>
      unwrap(
        await supabase.rpc('close_account', {
          p_account_id: account.id,
          p_expected_revision: revision,
          ...(fromPeriodId ? { p_from_period_id: fromPeriodId } : {}),
        }),
      ),
    success: (outcome, { account }) =>
      outcome === 'deleted'
        ? t('accounts.deleted', { name: account.name })
        : t('accounts.closed', { name: account.name }),
    invalidate: () => affected(budgetId),
  })
}
