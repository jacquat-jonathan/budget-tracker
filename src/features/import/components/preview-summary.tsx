import { LoaderCircleIcon, TriangleAlertIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import type { RowAction } from '@/features/import/import-queries'
import type { PreviewState } from '@/features/import/use-import'
import { formatCount, formatMoney } from '@/lib/money'

const COUNTED: readonly RowAction[] = [
  'import',
  'skip_duplicate',
  'skip_flagged',
  'skip_matched',
  'confirm_match',
  'skip_chosen',
  'invalid',
]

/**
 * The statement's totals as the last part's preview brings them (D-455): how many rows of each
 * action, the rows to import by kind with their sum, the room left and whether they fit. While
 * a part is being checked the totals are those of the last answer, marked as being checked.
 */
// R-IMPORT-340: the totals shown before importing are the database's, for the whole statement.
export function PreviewSummary({
  preview,
  parts,
  recordedParts,
}: {
  preview: PreviewState
  parts: number
  recordedParts: number
}) {
  const { t } = useTranslation()
  const totals = preview.totals
  const statement = totals?.statement
  const allRecorded = recordedParts >= parts
  const checkingPart = preview.progress.done + recordedParts + 1
  // D-522: a part once written is no longer staged, so the totals never cover the parts
  // recorded before the interruption, nor those found written meanwhile.
  const writtenNow = preview.written.filter((part) => !preview.expired.includes(part))
  return (
    <div
      className="flex flex-col gap-2"
      data-testid="preview-counts"
      aria-live="polite"
      aria-busy={!preview.current}
    >
      {preview.checking && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircleIcon className="size-4 animate-spin" aria-hidden />
          {parts > 1 && checkingPart <= parts
            ? t('import.preview.summary.checkingPart', { part: checkingPart, parts })
            : t('import.preview.checking')}
        </p>
      )}
      {allRecorded ? (
        <p className="text-sm" data-testid="all-recorded">
          {t('import.preview.summary.allRecorded')}
        </p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {COUNTED.filter(
              (action) => action === 'import' || (statement ? statement[action] > 0 : false),
            ).map((action) => (
              <li
                key={action}
                className={action === 'import' ? 'font-medium' : undefined}
                data-testid={`count-${action}`}
              >
                {t(`import.preview.counts.${action}`, { count: statement?.[action] ?? 0 })}
              </li>
            ))}
          </ul>
          {statement && statement.import > 0 && (
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm" data-testid="preview-kinds">
              {(['expense', 'refund', 'extra_income'] as const)
                .filter((kind) => statement[`${kind}_count`] > 0)
                .map((kind) => (
                  <li key={kind} className="tabular-nums" data-testid={`kind-${kind}`}>
                    {t(`import.preview.summary.kinds.${kind}`, {
                      count: statement[`${kind}_count`],
                      amount: formatMoney(statement[`${kind}_amount`]),
                    })}
                  </li>
                ))}
            </ul>
          )}
          {totals && !totals.fits && (
            <Alert variant="destructive" data-testid="preview-no-room">
              <TriangleAlertIcon aria-hidden />
              <AlertDescription>
                {t('import.preview.summary.noRoom', {
                  room: formatCount(totals.room),
                  count: totals.statement.import,
                })}
              </AlertDescription>
            </Alert>
          )}
          {totals?.fits && (
            <p className="text-sm text-muted-foreground" data-testid="preview-room">
              {t('import.preview.summary.room', { count: totals.room })}
            </p>
          )}
          {recordedParts > 0 && (
            <p className="text-sm text-muted-foreground" data-testid="preview-recorded-note">
              {t('import.preview.summary.recordedNote', {
                range:
                  recordedParts + 1 === parts
                    ? t('import.preview.summary.onePart', { part: parts })
                    : t('import.preview.summary.partRange', { from: recordedParts + 1, to: parts }),
                count: recordedParts,
              })}
            </p>
          )}
          {writtenNow.length > 0 && (
            <p className="text-sm text-muted-foreground" data-testid="preview-written-note">
              {t('import.preview.summary.writtenMeanwhile', {
                count: writtenNow.length,
                parts: writtenNow.join(', '),
              })}
            </p>
          )}
          {preview.expired.length > 0 && (
            <p className="text-sm text-muted-foreground" data-testid="preview-expired-note">
              {t('import.preview.summary.expiredMeanwhile', {
                count: preview.expired.length,
                parts: preview.expired.join(', '),
              })}
            </p>
          )}
          {parts > 1 && (
            <p className="text-sm text-muted-foreground">
              {t('import.preview.parts', { count: parts })} {t('import.preview.partsNote')}
            </p>
          )}
        </>
      )}
    </div>
  )
}
