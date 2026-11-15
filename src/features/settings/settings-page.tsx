import { useTranslation } from 'react-i18next'

import { PageHeader } from '@/components/states'
import { AccountSettings } from '@/features/settings/account-settings'
import { BudgetSettings } from '@/features/settings/budget-settings'
import { MembersSettings } from '@/features/settings/members-settings'

export function SettingsPage() {
  const { t } = useTranslation()

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title={t('nav.settings')} description={t('pages.settings.description')} />
      <BudgetSettings />
      <MembersSettings />
      <AccountSettings />
    </div>
  )
}
