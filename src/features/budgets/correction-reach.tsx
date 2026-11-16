import { useTranslation } from 'react-i18next'

import type { PeriodSummary } from '@/features/budgets/budget-queries'
import type { TermsAt } from '@/features/budgets/terms-at'
import { formatCalendarDate } from '@/lib/date'

/**
 * Under a correction's period choice: whether the fields now show that period's terms, and
 * how far the correction reaches, as the database says (until_period_id): "from 25.09 to
 * 24.11; from 25.11 the terms recorded later stay", or "from 25.09 on". A record that was not
 * in force in that period has nothing to correct there: said in words (the form offers no
 * save).
 */
// R-VERSION-150: how far a correction reaches, and when there is nothing to correct.
export function CorrectionReach({
  periods,
  periodId,
  terms,
  pending,
  error,
}: {
  periods: readonly PeriodSummary[]
  periodId: string
  terms: TermsAt<unknown> | undefined
  pending: boolean
  error: string | null
}) {
  const { t } = useTranslation()
  const chosen = periods.find((period) => period.id === periodId)
  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (pending || !terms || !chosen) {
    return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
  }
  if (!terms.inForce) {
    return (
      <p className="text-sm text-destructive" data-testid="correction-not-in-force">
        {t('corrections.notInForce')}
      </p>
    )
  }
  const until = periods.find((period) => period.id === terms.untilPeriodId)
  const last = until ? periods.find((period) => period.seq === until.seq - 1) : undefined
  return (
    <p className="text-sm text-muted-foreground" data-testid="correction-start">
      {t('corrections.showsPeriodTerms')}{' '}
      {until && last
        ? t('corrections.reachUntil', {
            start: formatCalendarDate(chosen.start_date),
            end: formatCalendarDate(last.end_date),
            next: formatCalendarDate(until.start_date),
          })
        : t('corrections.reachOn', { start: formatCalendarDate(chosen.start_date) })}
    </p>
  )
}
