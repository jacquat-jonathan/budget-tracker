import { useTranslation } from 'react-i18next'

import { PageHeader } from '@/components/states'
import { CurrentPeriodCard } from '@/features/dashboard/current-period-card'
import { MyInvitations } from '@/features/invitations/my-invitations'

/**
 * The current period at a glance. A grid of cards: the period card spans two columns, and
 * later steps add their cards (progress, subscriptions, debts) next to it.
 */
export function DashboardPage() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader title={t('nav.dashboard')} description={t('pages.dashboard.description')} />
      <MyInvitations />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <CurrentPeriodCard />
      </div>
    </div>
  )
}
