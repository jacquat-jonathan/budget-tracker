import { CalendarClockIcon, LoaderIcon, TriangleAlertIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import type { ExpectedPayDatePreview } from '@/features/income/pay-date-preview'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { formatCalendarDate } from '@/lib/date'

/**
 * The expected next pay date that saving would give (R-INCOME-055), and, when this month's
 * salary under the new terms is already due, that the app will ask about it (R-PERIOD-037).
 */
export function PayDatePreviewNotice({
  preview,
  arrivedDue,
}: {
  preview: { data: ExpectedPayDatePreview | null | undefined; isError: boolean; error: unknown }
  arrivedDue: string | null
}) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
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
  const { end_date: end, expected_pay_date: expected, end_is_manual: manual } = preview.data
  return (
    <Alert data-testid="pay-date-preview">
      <CalendarClockIcon aria-hidden />
      <AlertDescription>
        <p>
          {manual
            ? t('income.preview.manual', { end: formatCalendarDate(end) })
            : t('income.preview.expected', {
                date: formatCalendarDate(expected),
                end: formatCalendarDate(end),
              })}
        </p>
        {arrivedDue && (
          <p>{t('income.preview.arrivedDue', { date: formatCalendarDate(arrivedDue) })}</p>
        )}
      </AlertDescription>
    </Alert>
  )
}
