import { CalendarClockIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  useChargeDates,
  type SubscriptionCadence,
} from '@/features/subscriptions/subscription-queries'
import { formatCalendarDate } from '@/lib/date'

/**
 * The upcoming charge dates of a schedule, as subscription_charge_dates computes them: the
 * client never works a schedule out (C-LOGIC-003). Dates up to today are flagged: they are
 * charged at once, awaiting confirmation.
 */
export function ChargeDatesPreview({
  anchor,
  cadence,
  from,
  today,
  note,
  nextChargeDate,
}: {
  anchor: string | null
  cadence: SubscriptionCadence
  from: string | null
  today: string | null
  note: 'new' | 'date' | 'cadence' | 'kept'
  nextChargeDate: string | null
}) {
  const { t } = useTranslation()
  const dates = useChargeDates(anchor, cadence, from, 6)
  const explanation =
    note === 'cadence' && nextChargeDate
      ? t('subscriptions.preview.cadence', { date: formatCalendarDate(nextChargeDate) })
      : note === 'date'
        ? t('subscriptions.preview.date')
        : note === 'kept'
          ? t('subscriptions.preview.kept')
          : t('subscriptions.preview.new')
  return (
    <section
      className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 text-sm"
      aria-label={t('subscriptions.preview.title')}
      data-testid="charge-dates-preview"
    >
      <p className="flex items-center gap-2 font-medium">
        <CalendarClockIcon className="size-4 text-muted-foreground" aria-hidden />
        {t('subscriptions.preview.title')}
      </p>
      {anchor === null ? (
        <p className="text-muted-foreground">{t('subscriptions.preview.needsDate')}</p>
      ) : dates.isError ? (
        <p className="text-muted-foreground">{t('subscriptions.preview.failed')}</p>
      ) : !dates.data ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5" aria-live="polite">
          {dates.data.map((date) => {
            const due = today !== null && date <= today
            return (
              <li
                key={date}
                className="rounded-md border bg-background px-2 py-0.5 tabular-nums"
                data-due={due || undefined}
              >
                <time dateTime={date}>{formatCalendarDate(date)}</time>
                {due && (
                  <span className="text-muted-foreground"> · {t('subscriptions.preview.due')}</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{explanation}</p>
    </section>
  )
}
