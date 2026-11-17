import { CalendarClockIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { PreviewLoadFailed } from '@/components/preview-state'
import { previewLoadFailed } from '@/lib/preview'
import type { TransferPreview } from '@/features/transfers/transfer-queries'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { formatCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'

/**
 * What saving would do, exactly as the database previews it for the save's own arguments
 * (preview_create_transfer / preview_update_transfer run the write and roll it back, D-428):
 * the next due dates and amounts, what is recorded at once, and, with counts, what the
 * app's own transactions and the members' marks become (R-ACCOUNT-303). Nothing is computed
 * here; a refusal shows its reason, as the save would be refused alike.
 */
// R-ACCOUNT-233: the preview is the database's answer for the save's own arguments.
export function TransferPreviewBox({
  preview,
  pending,
  error,
  needsInput,
  creating,
  recordsPast,
  firstDateInPast = false,
  fetching = false,
  onRetry,
}: {
  preview: TransferPreview | undefined
  pending: boolean
  error: unknown
  /** Not enough is typed yet to ask the database. */
  needsInput: boolean
  creating: boolean
  /** Create: the member chose to record what already happened. */
  recordsPast: boolean
  /** Create: a quarterly or yearly date before today without "It already ran" (not sent). */
  firstDateInPast?: boolean
  fetching?: boolean
  onRetry?: () => void
}) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage({ category_to_categorise: 'transfers.errors.toCategorise' })
  return (
    <section
      className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 text-sm"
      aria-label={t('transfers.preview.title')}
      data-testid="transfer-preview"
    >
      <p className="flex items-center gap-2 font-medium">
        <CalendarClockIcon className="size-4 text-muted-foreground" aria-hidden />
        {t('transfers.preview.title')}
      </p>
      {firstDateInPast ? (
        <p className="text-muted-foreground" data-testid="preview-date-in-past">
          {t('transfers.preview.firstDateInPast')}
        </p>
      ) : needsInput ? (
        <p className="text-muted-foreground">{t('transfers.preview.needsInput')}</p>
      ) : previewLoadFailed({ isError: error !== null && error !== undefined, error }) ? (
        <PreviewLoadFailed error={error} fetching={fetching} onRetry={() => onRetry?.()} />
      ) : error !== null && error !== undefined ? (
        <p className="text-destructive" data-testid="transfer-preview-refused">
          {errorMessage(error)}
        </p>
      ) : pending || !preview ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <div className="flex flex-col gap-2" aria-live="polite">
          {preview.rows.length === 0 ? (
            <p className="text-muted-foreground">{t('transfers.preview.none')}</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-md border bg-background">
              {preview.rows.map((row) => (
                <li
                  key={`${row.period_id}-${row.occurrence_date}-${row.due_date}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 px-2.5 py-1.5"
                  data-testid="preview-occurrence"
                >
                  <span className="tabular-nums">
                    <time dateTime={row.due_date}>{formatCalendarDate(row.due_date)}</time>
                    {row.created_at_once && (
                      <span className="text-muted-foreground">
                        {' '}
                        · {t('transfers.preview.atOnceRow')}
                      </span>
                    )}
                    {row.projected && (
                      <span className="text-muted-foreground">
                        {' '}
                        · {t('transfers.preview.projected')}
                      </span>
                    )}
                  </span>
                  <span className="font-medium tabular-nums">{formatMoney(row.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          {preview.rows.some((row) => row.follows_primary) && (
            <p className="text-muted-foreground">{t('transfers.preview.followsPrimary')}</p>
          )}
          {preview.createdAtOnce > 0 ? (
            <p className="font-medium" data-testid="created-at-once">
              {t('transfers.preview.createdAtOnce', { count: preview.createdAtOnce })}
            </p>
          ) : (
            creating && (
              <p className="text-muted-foreground" data-testid="nothing-past">
                {recordsPast
                  ? t('transfers.preview.nothingAtOnce')
                  : t('transfers.preview.nothingBeforeToday')}
              </p>
            )
          )}
          {preview.transactionsRemoved > 0 && (
            <p data-testid="transactions-removed">
              {t('transfers.preview.transactionsRemoved', { count: preview.transactionsRemoved })}
            </p>
          )}
          {preview.marksUnplanned > 0 && (
            <p data-testid="marks-unplanned">
              {t('transfers.preview.marksUnplanned', { count: preview.marksUnplanned })}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
