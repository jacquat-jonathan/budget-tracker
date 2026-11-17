import { useState } from 'react'
import { ListChecksIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { transactionsOf } from '@/app/paths'
import { ExternalText } from '@/components/external-text'
import { ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SkippedRows, UndoImport } from '@/features/import/components/batch-actions'
import { useImportBatches, type ImportBatch } from '@/features/import/import-queries'
import { formatCalendarDate, formatTimestampWithTime } from '@/lib/date'
import { formatCount } from '@/lib/money'

const KNOWN_SOURCES = ['migros_account', 'migros_card', 'yuh', 'csv', 'script', 'other'] as const

/**
 * The budget's imports, newest first, a page at a time: from what, who (a member or a token,
 * by name), when, the statement's dates and each count as the database gives it; for each,
 * the rows not imported (import anyway), the review link and undo.
 */
// R-IMPORT-257: the history is read through the paged call only.
export function ImportHistory({ budgetId }: { budgetId: string }) {
  const { t } = useTranslation()
  const batches = useImportBatches(budgetId)
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 id="import-history">{t('import.history.title')}</h2>
        </CardTitle>
        <CardDescription>{t('import.history.help')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {batches.isError ? (
          <ErrorState error={batches.error} onRetry={() => void batches.refetch()} />
        ) : !batches.data ? (
          <LoadingState rows={2} />
        ) : batches.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('import.history.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-3" aria-labelledby="import-history">
            {batches.data.map((batch) => (
              <BatchItem key={batch.id} budgetId={budgetId} batch={batch} />
            ))}
          </ul>
        )}
        {batches.hasNextPage && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={batches.isFetchingNextPage}
            onClick={() => void batches.fetchNextPage()}
          >
            {t('import.history.more')}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function BatchItem({ budgetId, batch }: { budgetId: string; batch: ImportBatch }) {
  const [opened, setOpened] = useState(false)
  const { t } = useTranslation()
  const source = (KNOWN_SOURCES as readonly string[]).includes(batch.source)
    ? t(`import.sources.${batch.source as (typeof KNOWN_SOURCES)[number]}`)
    : batch.source
  const breakdown = (
    [
      ['imported', batch.imported_count],
      ['duplicate', batch.duplicate_count],
      ['flagged', batch.flagged_count],
      ['matched', batch.matched_count],
      ['chosen', batch.chosen_skip_count],
      ['invalid', batch.invalid_count],
      ['charges', batch.charges_confirmed_count],
    ] as const
  ).filter(([key, count]) => key === 'imported' || count > 0)
  const undone = batch.undone_at !== null
  return (
    <li className="flex flex-col gap-3 rounded-xl border p-3" data-testid="import-batch">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium">{source}</span>
          <span className="text-sm text-muted-foreground">
            {t('import.history.when', { date: formatTimestampWithTime(batch.created_at) })} ·{' '}
            {batch.token_name !== null ? (
              <>
                {t('import.history.byToken')} {t('import.history.quote.open')}
                <ExternalText>{batch.token_name}</ExternalText>
                {t('import.history.quote.close')}
                {/* R-IMPORT-445: the read keeps a deleted token's name, its id null. */}
                {batch.token_id === null && t('import.history.tokenDeleted')}
              </>
            ) : batch.created_by === null ? (
              // A token's batch whose token is gone: never "a former member".
              t('import.history.byDeletedToken')
            ) : batch.created_by_name !== null ? (
              <>
                {t('import.history.by')} <ExternalText>{batch.created_by_name}</ExternalText>
              </>
            ) : (
              // R-IMPORT-445: "a former member" only when the read names no one (R-IMPORT-422).
              t('import.history.byUnknown')
            )}
          </span>
          {batch.statement_from && batch.statement_to && (
            <span className="text-sm text-muted-foreground">
              {t('import.history.period', {
                from: formatCalendarDate(batch.statement_from),
                to: formatCalendarDate(batch.statement_to),
              })}
            </span>
          )}
          {undone && batch.undone_at && (
            <span className="text-sm font-medium">
              {t('import.undo.undone', { date: formatTimestampWithTime(batch.undone_at) })}
            </span>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 text-sm">
          <span>{t('import.history.rows', { count: batch.row_count })}</span>
          {(batch.to_review_count ?? 0) > 0 && (
            <Link
              to={transactionsOf({ review: true, batch: batch.id })}
              className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
            >
              <ListChecksIcon className="size-4" aria-hidden />
              {t('import.history.toReview', { count: batch.to_review_count ?? 0 })}
            </Link>
          )}
        </div>
      </div>
      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm" data-testid="batch-counts">
        {breakdown.map(([key, count]) => (
          <div key={key} className="flex gap-1.5">
            <dt className="text-muted-foreground">{t(`import.history.breakdown.${key}`)}</dt>
            <dd className="tabular-nums">{formatCount(count)}</dd>
          </div>
        ))}
      </dl>
      <details
        className="text-sm"
        onToggle={(event) => setOpened(event.currentTarget.open || opened)}
      >
        <summary className="w-fit cursor-pointer rounded font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          {t('import.history.details')}
        </summary>
        {/* Read once opened: a long history does not ask for every batch's rows. */}
        {opened && (
          <div className="mt-3 flex flex-col gap-3">
            <SkippedRows budgetId={budgetId} batchId={batch.id} undone={undone} />
            {!undone && (
              <div>
                <UndoImport
                  budgetId={budgetId}
                  batchId={batch.id}
                  toReview={batch.to_review_count}
                />
              </div>
            )}
          </div>
        )}
      </details>
    </li>
  )
}
