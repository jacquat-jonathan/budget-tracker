import { useTranslation } from 'react-i18next'

import { PageHeader } from '@/components/states'
import { CurrentPeriodCard } from '@/features/dashboard/current-period-card'
import { MyInvitations } from '@/features/invitations/my-invitations'
import { PeriodProgressCard } from '@/features/progress/period-progress-card'

/**
 * The current period at a glance, and the progress of any period (the current one by
 * default). A grid of cards: later steps add theirs (subscriptions, debts).
 */
export function DashboardPage() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader title={t('nav.dashboard')} description={t('pages.dashboard.description')} />
      <MyInvitations />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <CurrentPeriodCard />
        <PeriodProgressCard className="md:col-span-2 xl:col-span-3" />
      </div>
    </div>
  )
}
