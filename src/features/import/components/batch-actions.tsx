import { CheckCircle2Icon, CircleSlashIcon, TriangleAlertIcon, Undo2Icon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { ExternalText } from '@/components/external-text'
import { ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { budgetKeys } from '@/features/budgets/budget-keys'
import { unwrap } from '@/features/budgets/budget-queries'
import { reasonText } from '@/features/import/statement-words'
import {
  useExistingTransactions,
  useImportBatches,
  useSkippedRows,
  type ExistingTransaction,
  type SkippedRow,
} from '@/features/import/import-queries'
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

/** What a skipped row is, for the words and for the question before importing it anyway. */
type SkippedKind =
  | 'salary'
  | 'card_bill_payment'
  | 'own_transfer'
  | 'transfer_to_person'
  | 'flagged'
  | 'duplicate'
  | 'charge'
  | 'typed'
  | 'matched'
  | 'chosen'
  | 'invalid'

const SKIPPED_KINDS: readonly Exclude<SkippedKind, 'invalid'>[] = [
  'salary',
  'card_bill_payment',
  'own_transfer',
  'transfer_to_person',
  'flagged',
  'charge',
  'typed',
  'matched',
  'duplicate',
  'chosen',
]

/**
 * A skipped row's kind: its flag, or for a match whether the existing transaction is a
 * subscription charge (the import confirmed it) or one entered by hand.
 */
function skippedKind(
  row: Pick<SkippedRow, 'reason' | 'detail' | 'match_of'>,
  existing: ReadonlyMap<string, ExistingTransaction> | undefined,
): SkippedKind {
  switch (row.reason) {
    case 'flagged':
      return (FLAGS as readonly string[]).includes(row.detail ?? '')
        ? (row.detail as (typeof FLAGS)[number])
        : 'flagged'
    case 'matched': {
      const match = row.match_of ? existing?.get(row.match_of) : undefined
      if (!match) return 'matched'
      return match.subscription_name !== null ? 'charge' : 'typed'
    }
    case 'duplicate':
    case 'chosen':
    case 'invalid':
      return row.reason
    default:
      return 'invalid'
  }
}

/** Rows imported anyway per call (import_skipped_anyway takes at most 500). */
const ANYWAY_CALL = 500

/**
 * A batch's rows that were not imported, in statement order (list_import_skipped_rows), each
 * with why, and "import anyway" for a row or for all of them (import_skipped_anyway, which
 * plans each row again with action import). An invalid row cannot be imported anyway. Before
 * all are imported anyway, or one that matched a charge or a typed transaction, the page asks:
 * how many, of which kinds, and that they count twice if they are what the import thought.
 */
// R-IMPORT-360: importing skipped rows anyway asks first when they may count twice.
export function SkippedRows({
  budgetId,
  batchId,
  undone,
  onImported,
}: {
  budgetId: string
  batchId: string
  /** An undone batch takes nothing more. */
  undone: boolean
  /** How many rows were just imported anyway. */
  onImported?: (count: number) => void
}) {
  const { t } = useTranslation()
  const skipped = useSkippedRows(budgetId, batchId)
  const matchIds = useMemo(
    () =>
      (skipped.data ?? []).flatMap((row) =>
        row.reason === 'matched' && row.match_of ? [row.match_of] : [],
      ),
    [skipped.data],
  )
  const existing = useExistingTransactions(budgetId, matchIds)
  const [done, setDone] = useState<number | null>(null)
  const [asking, setAsking] = useState<{ ids: string[] | 'all' } | null>(null)
  const focusAfter = useRef<string | null>(null)
  const anyway = useAppMutation<number, string[]>({
    errorDisplay: 'inline',
    mutationFn: async (ids) => {
      let count = 0
      for (let start = 0; start < ids.length; start += ANYWAY_CALL) {
        const rows = unwrap(
          await supabase.rpc('import_skipped_anyway', {
            p_batch_id: batchId,
            p_skipped_row_ids: ids.slice(start, start + ANYWAY_CALL),
          }),
        )
        count += rows.filter((row) => row.action === 'import').length
      }
      return count
    },
    onSuccess: (count) => {
      setDone(count)
      setAsking(null)
      onImported?.(count)
    },
    invalidate: () => [budgetKeys.budget(budgetId)],
  })
  const rows = useMemo(() => skipped.data ?? [], [skipped.data])
  const open = rows.filter(
    (row) => row.reason !== 'invalid' && row.imported_transaction_id === null,
  )
  // Every page is read before "all" is counted and sent: the question names every row.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = skipped
  const readingAll = asking?.ids === 'all' && hasNextPage
  useEffect(() => {
    if (asking?.ids === 'all' && hasNextPage && !isFetchingNextPage) void fetchNextPage()
  }, [asking, hasNextPage, isFetchingNextPage, fetchNextPage])
  // After "import anyway" the focus goes to that row's new state, never to the page's body.
  useEffect(() => {
    const id = focusAfter.current
    if (id === null || done === null) return
    focusAfter.current = null
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-skipped-state="${id}"]`)?.focus()
    })
  }, [done, rows])
  if (skipped.isError)
    return <ErrorState error={skipped.error} onRetry={() => void skipped.refetch()} />
  if (!skipped.data) return <LoadingState rows={2} />
  const kindOf = (row: SkippedRow) => skippedKind(row, existing.data)
  const reason = (row: SkippedRow) => {
    const kind = kindOf(row)
    if (kind === 'invalid')
      return t('import.skipped.reasons.invalid', { reason: reasonText(t, row.detail) })
    return t(`import.skipped.kinds.${kind}`)
  }
  const askedRows =
    asking === null
      ? []
      : asking.ids === 'all'
        ? open
        : open.filter((row) => (asking.ids as string[]).includes(row.id))
  const askedKinds = SKIPPED_KINDS.map((kind) => ({
    kind,
    count: askedRows.filter((row) => kindOf(row) === kind).length,
  })).filter(({ count }) => count > 0)
  const importOne = (row: SkippedRow) => {
    focusAfter.current = row.id
    // A row that confirmed a charge or matched a typed transaction would count twice: asked.
    const kind = kindOf(row)
    if (kind === 'charge' || kind === 'typed' || kind === 'matched') setAsking({ ids: [row.id] })
    else anyway.mutate([row.id])
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
            onClick={() => {
              anyway.reset()
              setAsking({ ids: 'all' })
            }}
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
      {anyway.error !== null && asking === null && (
        <p role="alert" className="text-sm text-destructive">
          {t('import.skipped.anywayFailed')}
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
                  <span
                    className="flex items-start gap-1.5 rounded-sm text-xs focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    tabIndex={-1}
                    data-skipped-state={row.id}
                  >
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
                    onClick={() => importOne(row)}
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
      <ConfirmDialog
        open={asking !== null}
        onOpenChange={(next) => {
          if (!next) {
            setAsking(null)
            anyway.reset()
          }
        }}
        title={t('import.skipped.ask.title', { count: askedRows.length })}
        description={
          readingAll || existing.isFetching ? (
            <span>{t('common.loading')}</span>
          ) : (
            <>
              <span>{t('import.skipped.ask.body', { count: askedRows.length })}</span>
              <span className="flex flex-col" data-testid="anyway-kinds">
                {askedKinds.map(({ kind, count }) => (
                  <span key={kind}>{t(`import.skipped.ask.kinds.${kind}`, { count })}</span>
                ))}
              </span>
              <span className="font-medium">
                {t('import.skipped.ask.twice', { count: askedRows.length })}
              </span>
            </>
          )
        }
        confirmLabel={t('import.skipped.ask.confirm', { count: askedRows.length })}
        disabled={readingAll || existing.isFetching || askedRows.length === 0}
        pending={anyway.isPending}
        error={anyway.error}
        onConfirm={() => anyway.mutate(askedRows.map((row) => row.id))}
      />
    </section>
  )
}

export interface UndoAnswer {
  deleted: number
  kept_confirmed: number
  kept_linked: number
  charges_confirmed: number
}

/**
 * Undo a batch, behind a confirmation that says what goes and what stays (how many are still
 * to review, read from the batch itself); afterwards, what the database did (undo_import_batch).
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
  /** How many are still to review when the batch cannot be read (the newest page holds it). */
  toReview: number | null
  onUndone?: (answer: UndoAnswer | null) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [answer, setAnswer] = useState<UndoAnswer | null>(null)
  // The batch's own count, read again when the dialog opens: imports anyway since are in it.
  const batches = useImportBatches(budgetId)
  const batch = batches.data?.find((item) => item.id === batchId)
  const stillToReview = batch?.to_review_count ?? toReview
  const undo = useAppMutation<UndoAnswer | null>({
    errorDisplay: 'inline',
    mutationFn: async () =>
      unwrap(await supabase.rpc('undo_import_batch', { p_batch_id: batchId }))[0] ?? null,
    onSuccess: (result) => {
      setAnswer(result)
      setOpen(false)
      onUndone?.(result)
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true)
          void batches.refetch()
        }}
      >
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
            <span data-testid="undo-to-review">
              {batches.isFetching
                ? t('common.loading')
                : stillToReview === null
                  ? t('import.undo.bodyUnknown')
                  : t('import.undo.body', { count: stillToReview })}
            </span>
            <span>{t('import.undo.keeps')}</span>
            <span>{t('import.undo.once')}</span>
          </>
        }
        confirmLabel={t('import.undo.confirm')}
        onConfirm={() => undo.mutate()}
        disabled={batches.isFetching}
        pending={undo.isPending}
        error={undo.error}
        destructive
      />
    </>
  )
}
