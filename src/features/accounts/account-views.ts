import {
  BanknoteIcon,
  CreditCardIcon,
  LandmarkIcon,
  LineChartIcon,
  PiggyBankIcon,
  ReceiptTextIcon,
  ShieldIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { Account, AccountKind } from '@/features/accounts/account-queries'
import type { FieldView } from '@/hooks/use-edit-base'

export const ACCOUNT_ICONS: Record<AccountKind, LucideIcon> = {
  current: LandmarkIcon,
  savings: PiggyBankIcon,
  third_pillar: ShieldIcon,
  tax_reserve: ReceiptTextIcon,
  investment: LineChartIcon,
  cash: BanknoteIcon,
  credit_card: CreditCardIcon,
  other: WalletIcon,
}

/** Whose account it is, in words: shared, a member, or a former member (D-350). */
export function useHolderText() {
  const { t } = useTranslation()
  return (account: Pick<Account, 'user_id' | 'user_display_name' | 'user_is_member'>) =>
    account.user_id === null
      ? t('accounts.shared')
      : account.user_is_member === false
        ? t('accounts.formerMember', {
            name: account.user_display_name ?? t('members.unknownName'),
          })
        : (account.user_display_name ?? t('members.unknownName'))
}

/** An account's fields as a person reads them, for concurrent edits (R-CONCURRENCY-091). */
export function useAccountViews() {
  const { t } = useTranslation()
  const holder = useHolderText()
  return (account: Account): FieldView[] => [
    { key: 'name', label: t('concurrent.fields.name'), value: account.name },
    { key: 'kind', label: t('accounts.fields.kind'), value: t(`accounts.kinds.${account.kind}`) },
    {
      key: 'bankLabel',
      label: t('accounts.fields.bankLabel'),
      value: account.bank_label ?? t('concurrent.none'),
    },
    {
      key: 'holder',
      label: t('accounts.fields.holder'),
      value: holder(account),
      fields: ['userId'],
    },
  ]
}
