import { CheckCircle2Icon, CircleSlashIcon, TriangleAlertIcon, Undo2Icon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { ExternalText } from '@/components/external-text'
import { ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { budgetKeys } from '@/features/budgets/budget-keys'
import { unwrap } from '@/features/budgets/budget-queries'
import { reasonText } from '@/features/import/statement-words'
import { useSkippedRows, type SkippedRow } from '@/features/import/import-queries'
import { useAppMutation } from '@/hooks/use-app-mutation'
import { formatCalendarDate } from '@/lib/date'
import { formatCount, formatMoney } from '@/lib/money'
import { supabase } from '@/lib/supabase'

/** The fields kept of a skipped row (row_data: its known keys within their limits). */
function rowData(row: SkippedRow): {
  date: string | null
  amount: number | null
  direction: string | null
  description: string | null
} {
  const data = (
    typeof row.row_data === 'object' && !Array.isArray(row.row_data) ? row.row_data : {}
  ) as Record<string, unknown>
  return {
    date: typeof data.date === 'string' ? data.date : null,
    amount:
      typeof data.amount === 'number' && Number.isSafeInteger(data.amount) ? data.amount : null,
    direction: typeof data.direction === 'string' ? data.direction : null,
    description:
      typeof data.description === 'string'
        ? data.description
        : typeof data.merchant === 'string'
          ? data.merchant
          : null,
  }
}

const FLAGS = ['card_bill_payment', 'own_transfer', 'transfer_to_person', 'salary'] as const

/**
 * A batch's rows that were not imported, in statement order (list_import_skipped_rows), each
 * with why, and "import anyway" for a row or for all of them (import_skipped_anyway, which
 * plans each row again with action import). An invalid row cannot be imported anyway.
 */
// R-IMPORT-073: skipped rows can be imported anyway, one by one or all at once.
export function SkippedRows({
  budgetId,
  batchId,
  undone,
}: {
  budgetId: string
  batchId: string
  /** An undone batch takes nothing more. */
  undone: boolean
}) {
  const { t } = useTranslation()
  const skipped = useSkippedRows(budgetId, batchId)
  const [done, setDone] = useState<number | null>(null)
  const anyway = useAppMutation<number, string[] | null>({
    mutationFn: async (ids) => {
      const rows = unwrap(
        await supabase.rpc('import_skipped_anyway', {
          p_batch_id: batchId,
          ...(ids ? { p_skipped_row_ids: ids } : {}),
        }),
      )
      return rows.filter((row) => row.action === 'import').length
    },
    onSuccess: (count) => setDone(count),
    invalidate: () => [budgetKeys.budget(budgetId)],
  })
  if (skipped.isError)
    return <ErrorState error={skipped.error} onRetry={() => void skipped.refetch()} />
  if (!skipped.data) return <LoadingState rows={2} />
  const rows = skipped.data
  const open = rows.filter(
    (row) => row.reason !== 'invalid' && row.imported_transaction_id === null,
  )
  const reason = (row: SkippedRow) => {
    switch (row.reason) {
      case 'flagged':
        return t('import.skipped.reasons.flagged', {
          flag: (FLAGS as readonly string[]).includes(row.detail ?? '')
            ? t(`import.preview.flags.${row.detail as (typeof FLAGS)[number]}`)
            : '',
        })
      case 'invalid':
        return t('import.skipped.reasons.invalid', { reason: reasonText(t, row.detail) })
      case 'duplicate':
      case 'matched':
      case 'chosen':
        return t(`import.skipped.reasons.${row.reason}`)
      default:
        return row.reason
    }
  }
  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby={`skipped-${batchId}`}
      data-testid="skipped-rows"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`skipped-${batchId}`} className="font-medium">
          {t('import.skipped.title')}
        </h3>
        {!undone && open.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={anyway.isPending}
            onClick={() => anyway.mutate(null)}
          >
            {t('import.skipped.importAllAnyway')}
          </Button>
        )}
      </div>
      {done !== null && (
        <p role="status" className="text-sm" data-testid="anyway-done">
          {t('import.skipped.importedAnywayDone', { count: done })}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('import.skipped.none')}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border text-sm">
          {rows.map((row) => {
            const data = rowData(row)
            const label = t('import.skipped.row', {
              date: data.date ? formatCalendarDate(data.date) : '—',
              amount: data.amount !== null ? formatMoney(data.amount) : '—',
              direction:
                data.direction === 'credit'
                  ? t('import.preview.money.credit')
                  : t('import.preview.money.debit'),
            })
            const imported = row.imported_transaction_id !== null
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-start justify-between gap-2 p-2.5"
                data-testid="skipped-row"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground tabular-nums">{label}</span>
                  <span className="min-w-0">
                    <ExternalText>{data.description}</ExternalText>
                  </span>
                  <span className="flex items-start gap-1.5 text-xs">
                    {row.reason === 'invalid' ? (
                      <TriangleAlertIcon
                        className="size-3.5 shrink-0 text-destructive"
                        aria-hidden
                      />
                    ) : imported ? (
                      <CheckCircle2Icon className="size-3.5 shrink-0 text-positive" aria-hidden />
                    ) : (
                      <CircleSlashIcon
                        className="size-3.5 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    )}
                    {imported ? t('import.skipped.importedAnyway') : reason(row)}
                  </span>
                </div>
                {!undone && !imported && row.reason !== 'invalid' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={anyway.isPending}
                    aria-label={t('import.skipped.importAnywayFor', {
                      row: `${label} ${data.description ?? ''}`,
                    })}
                    onClick={() => anyway.mutate([row.id])}
                  >
                    {t('import.skipped.importAnyway')}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {skipped.hasNextPage && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={skipped.isFetchingNextPage}
          onClick={() => void skipped.fetchNextPage()}
        >
          {t('import.skipped.more')}
        </Button>
      )}
    </section>
  )
}

interface UndoAnswer {
  deleted: number
  kept_confirmed: number
  kept_linked: number
  charges_confirmed: number
}

/**
 * Undo a batch, behind a confirmation that says what goes and what stays; afterwards, what
 * the database did (undo_import_batch).
 */
// R-IMPORT-206: an import is undone once, what stays said before and after.
export function UndoImport({
  budgetId,
  batchId,
  toReview,
  onUndone,
}: {
  budgetId: string
  batchId: string
  toReview: number | null
  onUndone?: () => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [answer, setAnswer] = useState<UndoAnswer | null>(null)
  const undo = useAppMutation<UndoAnswer | null>({
    errorDisplay: 'inline',
    mutationFn: async () =>
      unwrap(await supabase.rpc('undo_import_batch', { p_batch_id: batchId }))[0] ?? null,
    onSuccess: (result) => {
      setAnswer(result)
      setOpen(false)
      onUndone?.()
    },
    invalidate: () => [budgetKeys.budget(budgetId)],
  })
  if (answer) {
    return (
      <p role="status" className="text-sm" data-testid="undo-done">
        {t('import.undo.done', {
          deleted: formatCount(answer.deleted),
          confirmed: formatCount(answer.kept_confirmed),
          linked: formatCount(answer.kept_linked),
          charges: formatCount(answer.charges_confirmed),
        })}
      </p>
    )
  }
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Undo2Icon aria-hidden />
        {t('import.undo.action')}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) undo.reset()
        }}
        title={t('import.undo.title')}
        description={
          <>
            <span>{t('import.undo.body', { toReview: formatCount(toReview ?? 0) })}</span>
            <span>{t('import.undo.keeps')}</span>
            <span>{t('import.undo.once')}</span>
          </>
        }
        confirmLabel={t('import.undo.confirm')}
        onConfirm={() => undo.mutate()}
        pending={undo.isPending}
        error={undo.error}
        destructive
      />
    </>
  )
}
