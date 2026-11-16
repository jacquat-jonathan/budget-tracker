import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeftIcon,
  InfoIcon,
  ListChecksIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { transactionsOf } from '@/app/paths'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ExternalText } from '@/components/external-text'
import { LoadingState, PageHeader } from '@/components/states'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useBudgetEnded } from '@/features/budgets/budget-ended'
import { budgetKeys } from '@/features/budgets/budget-keys'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'
import { useCategories } from '@/features/categories/category-queries'
import {
  SkippedRows,
  UndoImport,
  type UndoAnswer,
} from '@/features/import/components/batch-actions'
import { ImportHistory } from '@/features/import/components/import-history'
import { PreviewRows } from '@/features/import/components/preview-rows'
import { ReadSummary, type ReadInfo } from '@/features/import/components/read-summary'
import { SourceChooser } from '@/features/import/components/source-chooser'
import type { CsvReady } from '@/features/import/csv/csv-mapper'
import {
  chunksOf,
  dateRange,
  fingerprint as fingerprintOf,
  type Choices,
  type ImportDraft,
} from '@/features/import/import-model'
import {
  rowAction,
  useExistingTransactions,
  type ImportRowResult,
  type RowAction,
} from '@/features/import/import-queries'
import {
  clearPendingImport,
  readPendingImport,
  type PendingImport,
} from '@/features/import/pending-import'
import { refusalText } from '@/features/import/statement-words'
import type { StatementRefusal } from '@/features/import/statements/types'
import {
  partsToSend,
  useImportPreview,
  useImportRun,
  type EntryAnswer,
  type RunState,
} from '@/features/import/use-import'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { isBusyError } from '@/lib/db-errors'
import { formatTimestamp } from '@/lib/date'

// The CSV mapping step and its parser are a chunk of their own, loaded when a CSV is opened.
const CsvMapper = lazy(() =>
  import('@/features/import/csv/csv-mapper').then((m) => ({ default: m.CsvMapper })),
)

type Stage =
  | { kind: 'choose' }
  | { kind: 'reading' }
  | { kind: 'refused'; refusal: StatementRefusal }
  | { kind: 'csv'; text: string }
  | {
      kind: 'preview'
      draft: ImportDraft
      info: ReadInfo
      batchId: string
      draftId: string
      fingerprint: string
      resumed: boolean
      /** Parts the interrupted import had recorded: locked, sent again unchanged. */
      recordedParts: number
    }

/**
 * The import page (F-IMPORT): choose a PDF statement (read on this device) or a CSV (mapped
 * here), see what the budget would do with each row and change it, import in parts, then the
 * summary with the rows not imported, "import anyway", review and undo. Below, the history.
 */
// R-IMPORT-005: the import is reachable from a screen of the app.
export function ImportPage() {
  const { t } = useTranslation()
  const { budgetId } = useCurrentBudget()
  const [stage, setStage] = useState<Stage>({ kind: 'choose' })
  const [pending, setPending] = useState<PendingImport | null>(() => readPendingImport(budgetId))
  const heading = useRef<HTMLHeadingElement>(null)
  // Focus follows each step: the new step's heading, never the page's body.
  const focusStep = useCallback(() => {
    window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>('[data-step-heading]') ?? heading.current
      target?.setAttribute('tabindex', '-1')
      target?.focus()
    })
  }, [])
  useEffect(() => {
    if (stage.kind !== 'choose') focusStep()
  }, [stage.kind, focusStep])

  const startPreview = async (draft: ImportDraft, info: ReadInfo) => {
    const print = await fingerprintOf(draft.entries)
    const now = readPendingImport(budgetId)
    const resumed = now !== null && now.fingerprint === print
    setStage({
      kind: 'preview',
      draft,
      info,
      // The batch id the preview names is the one the import uses (R-IMPORT-252); the same
      // statement after an interruption goes on under the interrupted batch.
      batchId: resumed ? now.batchId : crypto.randomUUID(),
      draftId: crypto.randomUUID(),
      fingerprint: print,
      resumed,
      recordedParts: resumed ? Math.min(now.confirmedParts, chunksOf(draft.entries).length) : 0,
    })
  }

  const readPdf = async (file: File) => {
    setStage({ kind: 'reading' })
    // pdf.js and the parsers load with the first statement opened (their own chunks).
    let reader: typeof import('@/features/import/statements')
    try {
      reader = await import('@/features/import/statements')
    } catch {
      setStage({ kind: 'refused', refusal: { reason: 'reader-unavailable' } })
      return
    }
    const read = await reader.readStatementFile(file)
    if (!read.ok) {
      setStage({ kind: 'refused', refusal: read.refusal })
      return
    }
    const batch = reader.toImportBatch(read.statement)
    await startPreview(
      {
        kind: 'pdf',
        source: batch.source,
        statementFrom: batch.statementFrom,
        statementTo: batch.statementTo,
        entries: batch.rows.map(({ n, row }) => ({ key: n, row })),
      },
      {
        kind: 'pdf',
        statement: {
          source: read.statement.source,
          identity: read.statement.identity,
          controls: read.statement.controls,
          entryCount: read.statement.entries.length,
        },
        notSent: batch.notSent,
        adjustments: batch.adjustments,
      },
    )
  }

  const readCsv = async (ready: CsvReady) => {
    const range = dateRange(ready.entries)
    await startPreview(
      {
        kind: 'csv',
        source: 'csv',
        statementFrom: range?.from ?? null,
        statementTo: range?.to ?? null,
        entries: ready.entries,
      },
      {
        kind: 'csv',
        rowCount: ready.entries.length,
        problems: ready.problems,
        adjustments: ready.adjustments,
      },
    )
  }

  const restart = () => {
    setStage({ kind: 'choose' })
    setPending(readPendingImport(budgetId))
    focusStep()
  }

  return (
    <div className="flex max-w-4xl min-w-0 flex-col gap-6">
      <PageHeader title={t('import.title')} description={t('import.description')} />
      <h2 ref={heading} className="sr-only">
        {t('import.title')}
      </h2>
      {pending && stage.kind === 'choose' && (
        <Alert data-testid="pending-import">
          <InfoIcon aria-hidden />
          <AlertTitle>{t('import.pending.title')}</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <p>
              {t('import.pending.body', {
                source: t(`import.sources.${(pending.source || 'other') as 'csv'}`),
                date: pending.startedAt ? formatTimestamp(pending.startedAt) : '—',
                confirmed: pending.confirmedParts,
                parts: pending.parts,
              })}
            </p>
            <div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  clearPendingImport(budgetId)
                  setPending(null)
                }}
              >
                {t('import.pending.forget')}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {stage.kind === 'choose' && (
        <>
          <SourceChooser
            onPdf={(file) => void readPdf(file)}
            onCsv={(text) => setStage({ kind: 'csv', text })}
          />
          <ImportHistory budgetId={budgetId} />
        </>
      )}
      {stage.kind === 'reading' && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center" role="status">
            <LoaderCircleIcon className="size-6 animate-spin text-muted-foreground" aria-hidden />
            <h2 data-step-heading className="font-medium">
              {t('import.reading.title')}
            </h2>
            <p className="text-sm text-muted-foreground">{t('import.reading.help')}</p>
          </CardContent>
        </Card>
      )}
      {stage.kind === 'refused' && <Refused refusal={stage.refusal} onAnother={restart} />}
      {stage.kind === 'csv' && (
        <Suspense fallback={<LoadingState rows={4} />}>
          <CsvMapper
            budgetId={budgetId}
            text={stage.text}
            onBack={restart}
            onReady={(ready) => void readCsv(ready)}
          />
        </Suspense>
      )}
      {stage.kind === 'preview' && (
        <ImportFlow key={stage.draftId} stage={stage} onRestart={restart} />
      )}
    </div>
  )
}

/** A refused statement: what it means, the line in question (on this device only), and another file. */
function Refused({ refusal, onAnother }: { refusal: StatementRefusal; onAnother: () => void }) {
  const { t } = useTranslation()
  // The refusal's line can hold names, numbers and references: shown here, never logged or sent.
  const line = refusal.reason === 'unreadable-layout' ? refusal.text : null
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 data-step-heading className="flex items-center gap-2">
            <TriangleAlertIcon className="size-5 text-destructive" aria-hidden />
            {t('import.refused.title')}
          </h2>
        </CardTitle>
        <CardDescription>{t('import.refused.nothingSent')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p data-testid="refusal-text">{refusalText(t, refusal)}</p>
        {line && (
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('import.refused.lineLabel')}</span>
            <code className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
              <ExternalText>{line}</ExternalText>
            </code>
          </div>
        )}
        <div>
          <Button type="button" onClick={onAnother}>
            <ArrowLeftIcon aria-hidden />
            {t('import.refused.another')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

const COUNTED: readonly RowAction[] = [
  'import',
  'skip_duplicate',
  'skip_flagged',
  'skip_matched',
  'confirm_match',
  'skip_chosen',
  'invalid',
]

/** How many rows of each action: counted from the database's answers, row by row. */
function countActions(
  results: readonly (ImportRowResult | undefined)[],
): Record<RowAction, number> {
  const counts = Object.fromEntries(COUNTED.map((action) => [action, 0])) as Record<
    RowAction,
    number
  >
  for (const result of results) if (result) counts[rowAction(result)] += 1
  return counts
}

function ImportFlow({
  stage,
  onRestart,
}: {
  stage: Extract<Stage, { kind: 'preview' }>
  onRestart: () => void
}) {
  const { t } = useTranslation()
  const { budgetId } = useCurrentBudget()
  const queryClient = useQueryClient()
  const errorMessage = useErrorMessage()
  const ended = useBudgetEnded(budgetId)
  const [choices, setChoices] = useState<Choices>({})
  const [leaving, setLeaving] = useState(false)
  const { draft, batchId, draftId } = stage
  const run = useImportRun(budgetId)
  // Each phase of the run (sending, stopped, done) puts the focus on its heading.
  const phase = run.state.phase
  useEffect(() => {
    if (phase === 'idle') return
    const frame = window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>('[data-step-heading]')
      target?.setAttribute('tabindex', '-1')
      target?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [phase])
  const sending = run.state.phase === 'sending' || run.state.phase === 'catching-up'
  const started = run.state.phase !== 'idle'
  const preview = useImportPreview(budgetId, batchId, draftId, draft, choices, started)
  // The rows of the parts the interrupted import recorded, by key, with their part.
  const locked = useMemo(() => {
    const out = new Map<number, number>()
    chunksOf(draft.entries)
      .slice(0, stage.recordedParts)
      .forEach((entries, index) => {
        for (const entry of entries) out.set(entry.key, index + 1)
      })
    return out
  }, [draft, stage.recordedParts])
  const importButton = useRef<HTMLButtonElement>(null)
  const importBar = useRef<HTMLDivElement>(null)
  const categories = useCategories(budgetId)
  const ids = useMemo(
    () =>
      preview.answers.flatMap((answer) =>
        [answer.result?.duplicate_of, answer.result?.match_of].filter(
          (id): id is string => typeof id === 'string',
        ),
      ),
    [preview.answers],
  )
  const existing = useExistingTransactions(budgetId, ids)
  const counts = countActions(preview.answers.map((answer) => answer.result))
  // The answers of the preview as they were when the import started, to compare afterwards.
  const [previewed, setPreviewed] = useState<EntryAnswer[] | null>(null)

  // Leaving or reloading while parts are being sent: the browser asks first.
  useEffect(() => {
    if (!sending) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [sending])

  const start = () => {
    // A row of a part already recorded is not compared: its part answers as the first time.
    setPreviewed(
      preview.answers.map((answer) =>
        locked.has(answer.entry.key) ? { ...answer, result: undefined } : answer,
      ),
    )
    void run.run({
      draft,
      parts: partsToSend(draft, lockedOut(choices, locked)),
      batchId,
      fingerprint: stage.fingerprint,
      toCategoriseName: t('import.preview.toCategoriseName'),
    })
  }
  const parts = chunksOf(draft.entries).length

  if (started) {
    return (
      <RunView
        state={run.state}
        draft={draft}
        budgetId={budgetId}
        batchId={batchId}
        previewed={previewed ?? []}
        onContinue={start}
        onAnother={() => {
          run.reset()
          void queryClient.invalidateQueries({ queryKey: budgetKeys.imports(budgetId) })
          onRestart()
        }}
      />
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 data-step-heading>
              {draft.kind === 'csv'
                ? t('import.recognised.titleCsv')
                : t('import.recognised.title')}
            </h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {stage.resumed && (
            <Alert data-testid="resumed">
              <InfoIcon aria-hidden />
              <AlertDescription className="flex flex-col gap-1">
                <p>{t('import.pending.resumed')}</p>
                {stage.recordedParts > 0 && (
                  <p data-testid="recorded-parts">
                    {t('import.preview.recorded', { count: stage.recordedParts })}
                  </p>
                )}
              </AlertDescription>
            </Alert>
          )}
          <ReadSummary info={stage.info} />
        </CardContent>
      </Card>
      {/* Not clipped: the bulk bar and the import bar stay in view while the rows scroll. */}
      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle>
            <h2>{t('import.preview.title')}</h2>
          </CardTitle>
          <CardDescription>{t('import.preview.help')}</CardDescription>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-4">
          {ended && (
            <Alert>
              <InfoIcon aria-hidden />
              <AlertDescription>{t('import.preview.ended')}</AlertDescription>
            </Alert>
          )}
          <div
            className="flex flex-col gap-1.5"
            data-testid="preview-counts"
            aria-live="polite"
            aria-busy={!preview.current}
          >
            {!preview.current && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircleIcon className="size-4 animate-spin" aria-hidden />
                {t('import.preview.checking')}
              </p>
            )}
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              {COUNTED.filter((action) => action === 'import' || counts[action] > 0).map(
                (action) => (
                  <li
                    key={action}
                    className={action === 'import' ? 'font-medium' : undefined}
                    data-testid={`count-${action}`}
                  >
                    {t(`import.preview.counts.${action}`, { count: counts[action] })}
                  </li>
                ),
              )}
            </ul>
          </div>
          {preview.error !== null && dbErrorIsShown(preview.error) && (
            <Alert variant="destructive">
              <TriangleAlertIcon aria-hidden />
              <AlertDescription className="flex flex-col gap-2">
                <p>
                  {isBusyError(preview.error)
                    ? t('import.preview.checkBusy')
                    : t('import.preview.checkFailed', { reason: errorMessage(preview.error) })}
                </p>
                <div>
                  <Button type="button" size="sm" variant="outline" onClick={preview.retry}>
                    <RotateCcwIcon aria-hidden />
                    {t('import.preview.retry')}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
          {parts > 1 && (
            <p className="text-sm text-muted-foreground">
              {t('import.preview.parts', { count: parts })} {t('import.preview.partsNote')}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="sr-only self-start focus-visible:not-sr-only"
            onClick={() => {
              // The bar when there is nothing to import yet: a disabled button takes no focus.
              const button = importButton.current
              if (button && !button.disabled) button.focus()
              else importBar.current?.focus()
            }}
          >
            {t('import.preview.skipToImport')}
          </Button>
          <PreviewRows
            budgetId={budgetId}
            locked={locked}
            draftKind={draft.kind}
            answers={preview.answers}
            choices={choices}
            onChoices={setChoices}
            existing={existing.data}
            categories={categories.data}
          />
          <div
            className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-2 rounded-b-xl border-t bg-card/95 px-4 py-3 backdrop-blur"
            data-testid="import-bar"
            ref={importBar}
            tabIndex={-1}
          >
            <Button type="button" variant="outline" onClick={() => setLeaving(true)}>
              {t('import.preview.cancel')}
            </Button>
            <ConfirmDialog
              open={leaving}
              onOpenChange={setLeaving}
              title={t('import.preview.cancel')}
              description={t('import.preview.cancelConfirm')}
              confirmLabel={t('import.preview.cancel')}
              onConfirm={onRestart}
            />
            <Button
              ref={importButton}
              type="button"
              disabled={!preview.current || counts.import + counts.confirm_match === 0}
              onClick={start}
              data-testid="import-button"
            >
              {!preview.current
                ? t('import.preview.importWait')
                : counts.import === 0 && counts.confirm_match === 0
                  ? t('import.preview.importNothing')
                  : t('import.preview.importButton', { count: counts.import })}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/** The choices without those for rows already recorded (their part is sent unchanged). */
// R-IMPORT-362: the parts an interrupted import recorded are locked and sent unchanged.
function lockedOut(choices: Choices, locked: ReadonlyMap<number, number>): Choices {
  if (locked.size === 0) return choices
  return Object.fromEntries(
    Object.entries(choices).filter(([key]) => !locked.has(Number(key))),
  )
}

/** A preview error is shown unless the shared catch-up handles it. */
function dbErrorIsShown(error: unknown): boolean {
  const message = (error as { message?: unknown } | null)?.message
  return message !== 'catching_up'
}

function RunView({
  state,
  draft,
  budgetId,
  batchId,
  previewed,
  onContinue,
  onAnother,
}: {
  state: RunState
  draft: ImportDraft
  budgetId: string
  batchId: string
  previewed: EntryAnswer[]
  onContinue: () => void
  onAnother: () => void
}) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const [showResult, setShowResult] = useState(false)
  const [undone, setUndone] = useState<{ answer: UndoAnswer | null } | null>(null)
  // R-IMPORT-363: rows imported anyway since are in the headline.
  const [anyway, setAnyway] = useState(0)
  const results = state.answers.flat()
  const counts = countActions(results)
  // Rows whose answer differs from the preview: matched meanwhile by an earlier part, another
  // import or a change in the budget. Only those not imported are in the list below.
  const differed = results.filter((result, index) => {
    const before = previewed[index]?.result
    return before !== undefined && rowAction(before) !== rowAction(result)
  })
  const differedSkipped = differed.filter((result) => rowAction(result) !== 'import').length
  const differedImported = differed.length - differedSkipped

  if (state.phase === 'sending' || state.phase === 'catching-up') {
    const percent = state.parts === 0 ? 0 : Math.round((state.done / state.parts) * 100)
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 data-step-heading>{t('import.run.title')}</h2>
          </CardTitle>
          <CardDescription>{t('import.run.keepOpen')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3" role="status">
          <Progress value={percent} aria-label={t('import.run.progressLabel')} />
          <p className="text-sm">
            {t('import.run.progress', { done: state.done, parts: state.parts })}
          </p>
          {state.phase === 'catching-up' && (
            <p className="text-sm text-muted-foreground">{t('import.run.catchingUp')}</p>
          )}
          {state.resent > 0 && (
            <p className="text-sm text-muted-foreground">
              {t('import.run.resent', { count: state.resent })}
            </p>
          )}
          {state.busy && (
            <p className="text-sm text-muted-foreground" data-testid="run-busy">
              {t('import.run.busy', { part: state.busy.part, count: state.busy.count })}
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  if (state.phase === 'stopped' && state.stop && !showResult) {
    const stop = state.stop
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 data-step-heading className="flex items-center gap-2">
              <TriangleAlertIcon className="size-5 text-destructive" aria-hidden />
              {t('import.run.stopped.title')}
            </h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p data-testid="run-stopped">
            {stop.kind === 'limit'
              ? stop.fits !== null
                ? t('import.run.stopped.limit', {
                    part: stop.part,
                    fits: stop.fits,
                    count: stop.fits,
                  })
                : t('import.run.stopped.limitUnknown', { part: stop.part })
              : stop.kind === 'network'
                ? t('import.run.stopped.network', { part: stop.part })
                : stop.kind === 'busy'
                  ? t('import.run.stopped.busy', { part: stop.part })
                  : t('import.run.stopped.other', {
                      part: stop.part,
                      reason: errorMessage(stop.error),
                    })}
          </p>
          {state.done > 0 && (
            <p className="text-sm">{t('import.run.stopped.before', { count: state.done })}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={onContinue}>
              {t('import.run.stopped.continue')}
            </Button>
            {state.done > 0 && (
              <Button type="button" variant="outline" onClick={() => setShowResult(true)}>
                {t('import.run.stopped.finish')}
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={onAnother}>
              {t('import.result.another')}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 data-step-heading>{t('import.result.title')}</h2>
        </CardTitle>
        <CardDescription>{t(`import.sources.${draft.source}`)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* The counts are announced when they appear and when they change afterwards. */}
        <div className="flex flex-col gap-1" data-testid="import-result" role="status">
          {undone ? (
            <>
              <p className="text-lg font-medium">{t('import.result.undoneTitle')}</p>
              <p className="text-sm text-muted-foreground">{t('import.result.undoneHelp')}</p>
            </>
          ) : (
            <>
              <p className="text-lg font-medium">
                {t('import.result.imported', { count: counts.import + anyway })}
              </p>
              {anyway > 0 && (
                <p className="text-sm">{t('import.result.anyway', { count: anyway })}</p>
              )}
              {counts.import + anyway > 0 && (
                <p className="text-sm text-muted-foreground">{t('import.result.importedHelp')}</p>
              )}
            </>
          )}
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {(['skip_duplicate', 'skip_flagged', 'skip_matched', 'skip_chosen', 'invalid'] as const)
              .filter((action) => counts[action] > 0)
              .map((action) => (
                <li key={action}>
                  {t(`import.result.skipped.${action}`, { count: counts[action] })}
                </li>
              ))}
            {counts.confirm_match > 0 && (
              <li>{t('import.result.charges', { count: counts.confirm_match })}</li>
            )}
          </ul>
          {differed.length > 0 && (
            <Alert className="mt-2" data-testid="differed">
              <InfoIcon aria-hidden />
              <AlertDescription className="flex flex-col gap-1">
                <p>{t('import.result.differed', { count: differed.length })}</p>
                <p>{t('import.result.differedWhy')}</p>
                {differedSkipped > 0 && (
                  <p>{t('import.result.differedSkipped', { count: differedSkipped })}</p>
                )}
                {differedImported > 0 && (
                  <p>{t('import.result.differedImported', { count: differedImported })}</p>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {counts.import + anyway > 0 && !undone && (
            <Button asChild>
              <Link to={transactionsOf({ review: true, batch: batchId })}>
                <ListChecksIcon aria-hidden />
                {t('import.result.review')}
              </Link>
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onAnother}>
            {t('import.result.another')}
          </Button>
        </div>
        <SkippedRows
          budgetId={budgetId}
          batchId={batchId}
          undone={undone !== null}
          onImported={(count) => setAnyway((now) => now + count)}
        />
        <div className="flex flex-col items-start gap-2 border-t pt-4">
          <UndoImport
            budgetId={budgetId}
            batchId={batchId}
            toReview={counts.import + anyway}
            onUndone={(answer) => setUndone({ answer })}
          />
        </div>
      </CardContent>
    </Card>
  )
}
