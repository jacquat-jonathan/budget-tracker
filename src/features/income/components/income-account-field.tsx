import type { Control, FieldPath, FieldValues } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { SelectField } from '@/components/form/select-field'
import { inForceIn, useAccounts } from '@/features/accounts/account-queries'
import type { PeriodSummary } from '@/features/budgets/budget-queries'

/**
 * The account an income is paid into (R-ACCOUNT-236): the accounts in force in the period the
 * terms take effect, or none ("not assigned"). A household without accounts sees nothing here:
 * accounts are optional (D-501).
 */
export function IncomeAccountField<TValues extends FieldValues, TOut extends FieldValues>({
  control,
  budgetId,
  period,
  keep,
  keepName,
}: {
  control: Control<TValues, unknown, TOut>
  budgetId: string
  /** The period the terms take effect in. */
  period: PeriodSummary | null
  /** The income's account now: kept as a choice even when not in force there. */
  keep: string | null
  keepName: string | null
}) {
  const { t } = useTranslation()
  const accounts = useAccounts(budgetId)
  const list = (accounts.data ?? []).filter((account) => inForceIn(account, period))
  if (list.length === 0 && keep === null) return null
  const options = [
    { value: '', label: t('accounts.income.none') },
    ...list.map((account) => ({ value: account.id, label: account.name })),
    ...(keep && !list.some((account) => account.id === keep)
      ? [{ value: keep, label: keepName ?? keep }]
      : []),
  ]
  return (
    <SelectField
      control={control}
      name={'accountId' as FieldPath<TValues>}
      label={t('accounts.income.field')}
      description={t('accounts.income.fieldHelp')}
      options={options}
    />
  )
}
