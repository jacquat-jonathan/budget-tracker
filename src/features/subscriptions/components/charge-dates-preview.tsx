import { CalendarClockIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  PREVIEW_CREATE_COUNT,
  PREVIEW_SHOWN,
  type PreviewCharge,
} from '@/features/subscriptions/subscription-queries'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { formatCalendarDate } from '@/lib/date'

/**
 * The charges a save would make, exactly as the database previews them for the arguments
 * the save will send (preview_create_subscription / preview_update_subscription): the client
 * never works a schedule out (C-LOGIC-003). Charges created with the save are said in words.
 * A preview the database refuses shows its reason: the save would be refused alike.
 */
// R-SUBSCRIPTION-121: the preview is the database's answer for the save's own arguments.
export function ChargeDatesPreview({
  charges,
  pending,
  error,
  needsDate,
  note,
}: {
  charges: PreviewCharge[] | undefined
  pending: boolean
  error: unknown
  /** No date typed yet (a new subscription): nothing to preview. */
  needsDate: boolean
  /** How the schedule follows from what was entered (the nominal day, a kept cadence…). */
  note: string | null
}) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const list = charges ?? []
  const atOnce = list.filter((charge) => charge.atOnce).length
  // Every date the database gave is charged at once: there may be more than it gave.
  const atLeast = atOnce === PREVIEW_CREATE_COUNT
  // The charges made with the save, when few, then the next ones.
  const shown = [
    ...(atOnce <= PREVIEW_SHOWN ? list.filter((charge) => charge.atOnce) : []),
    ...list.filter((charge) => !charge.atOnce).slice(0, PREVIEW_SHOWN),
  ]
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
      {needsDate ? (
        <p className="text-muted-foreground">{t('subscriptions.preview.needsDate')}</p>
      ) : error !== null && error !== undefined ? (
        <p className="text-destructive" data-testid="preview-refused">
          {errorMessage(error)}
        </p>
      ) : pending || !charges ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : charges.length === 0 ? (
        <p className="text-muted-foreground">{t('subscriptions.preview.none')}</p>
      ) : (
        <>
          {atOnce > 0 && (
            <p className="font-medium" data-testid="charged-at-once">
              {atLeast
                ? t('subscriptions.preview.atOnceAtLeast', { count: atOnce })
                : t('subscriptions.preview.atOnce', { count: atOnce })}
            </p>
          )}
          <ul className="flex flex-wrap gap-1.5" aria-live="polite">
            {shown.map((charge) => (
              <li
                key={charge.date}
                className="rounded-md border bg-background px-2 py-0.5 tabular-nums"
                data-due={charge.atOnce || undefined}
              >
                <time dateTime={charge.date}>{formatCalendarDate(charge.date)}</time>
                {charge.atOnce && (
                  <span className="text-muted-foreground"> · {t('subscriptions.preview.due')}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </section>
  )
}
