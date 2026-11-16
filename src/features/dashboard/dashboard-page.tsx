import { useTranslation } from 'react-i18next'

import { PageHeader } from '@/components/states'
import { CurrentPeriodCard } from '@/features/dashboard/current-period-card'
import { ToReviewCard } from '@/features/import/components/review'
import { MyInvitations } from '@/features/invitations/my-invitations'
import { PeriodProgressCard } from '@/features/progress/period-progress-card'
import { ChargesToConfirmCard } from '@/features/subscriptions/components/charges-to-confirm-card'

/**
 * The current period at a glance, and the progress of any period (the current one by
 * default), with the subscription charges awaiting confirmation first. A column of cards.
 */
export function DashboardPage() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader title={t('nav.dashboard')} description={t('pages.dashboard.description')} />
      <MyInvitations />
      {/* One column of full-width cards: no hole beside a narrower one at any width. */}
      <div className="flex flex-col gap-4">
        <ChargesToConfirmCard />
        <ToReviewCard />
        <CurrentPeriodCard />
        <PeriodProgressCard />
      </div>
    </div>
  )
}
