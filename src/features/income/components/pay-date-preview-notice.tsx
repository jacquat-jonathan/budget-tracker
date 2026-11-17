import { CalendarClockIcon, LoaderIcon, TriangleAlertIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { PreviewLoadFailed } from '@/components/preview-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { ExpectedPayDatePreview } from '@/features/income/pay-date-preview'
import type { ArrivedOffer } from '@/features/periods/boundary-ranges'
import { nextSalary } from '@/features/periods/next-salary'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { TransferCounts } from '@/features/transfers/components/transfer-counts'
import { formatCalendarDate } from '@/lib/date'
import { previewLoadFailed } from '@/lib/preview'

/**
 * The expected next pay date that saving would give (R-INCOME-055), worded as everywhere
 * else (nextSalary: none in the budget's last period), and, when a salary under the new
 * terms is already due, what the app will ask about it (R-PERIOD-037).
 */
export function PayDatePreviewNotice({
  preview,
  offer,
  endDateEntered,
}: {
  preview: {
    data: ExpectedPayDatePreview | null | undefined
    isError: boolean
    error: unknown
    isFetching: boolean
    refetch: () => unknown
  }
  offer: ArrivedOffer | null
  endDateEntered: string | null
}) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  if (previewLoadFailed(preview)) {
    return (
      <PreviewLoadFailed
        error={preview.error}
        fetching={preview.isFetching}
        onRetry={() => void preview.refetch()}
      />
    )
  }
  if (preview.isError) {
    return (
      <Alert data-testid="pay-date-preview">
        <TriangleAlertIcon aria-hidden />
        <AlertDescription>
          {t('income.preview.failed', { reason: errorMessage(preview.error) })}
        </AlertDescription>
      </Alert>
    )
  }
  if (preview.data === undefined) {
    return (
      <Alert data-testid="pay-date-preview">
        <LoaderIcon className="animate-spin" aria-hidden />
        <AlertDescription>{t('income.preview.checking')}</AlertDescription>
      </Alert>
    )
  }
  if (preview.data === null) return null
  const { end_date: end, end_is_manual: manual } = preview.data
  const next = nextSalary({ end_date: end, end_is_manual: manual }, endDateEntered)
  const fmt = formatCalendarDate
  return (
    <>
      <Alert data-testid="pay-date-preview">
        <CalendarClockIcon aria-hidden />
        <AlertDescription>
          <p>
            {manual
              ? t('income.preview.manual', { end: fmt(end) })
              : next.kind === 'expected'
                ? t('income.preview.expected', { date: fmt(next.date), end: fmt(end) })
                : t('income.preview.lastPeriod', { end: fmt(end) })}
          </p>
          {offer && (
            <p>
              {offer.kind === 'early'
                ? t('income.preview.arrivedDue', { date: fmt(offer.date) })
                : t('income.preview.arrivedDueMoveStart', { date: fmt(offer.date) })}
            </p>
          )}
        </AlertDescription>
      </Alert>
      {/* R-ACCOUNT-303: what the change does to the planned transfers, as the write counts it. */}
      <TransferCounts
        removed={preview.data.transfer_transactions_removed}
        created={preview.data.transfer_transactions_created}
        unplanned={preview.data.transfer_marks_unplanned}
        moved={preview.data.transfer_transactions_moved}
      />
    </>
  )
}
