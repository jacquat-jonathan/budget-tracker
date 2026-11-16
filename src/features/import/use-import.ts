import { keepPreviousData, useQueries, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useRef, useState } from 'react'

import { budgetKeys } from '@/features/budgets/budget-keys'
import { catchUpBudget, unwrap } from '@/features/budgets/budget-queries'
import {
  chunksOf,
  rowToSend,
  type Choices,
  type DraftEntry,
  type ImportDraft,
} from '@/features/import/import-model'
import type { ImportRowResult } from '@/features/import/import-queries'
import { clearPendingImport, writePendingImport } from '@/features/import/pending-import'
import { useDebounced } from '@/hooks/use-debounced'
import { dbErrorCode, dbErrorDetail, dbErrorKey, isBusyError } from '@/lib/db-errors'
import type { Json } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

export interface EntryAnswer {
  entry: DraftEntry
  /** The database's answer for the rows as now chosen; undefined until the first answer. */
  result: ImportRowResult | undefined
  /** The answer shown is for earlier choices (a new one is on its way). */
  stale: boolean
}

export interface PreviewState {
  answers: EntryAnswer[]
  /** Every part has a current answer for the choices made. */
  current: boolean
  /** A part is being asked (first time or after a change). */
  checking: boolean
  error: unknown
  retry: () => void
}

/** At most this many parts are previewed at once: the duplicate lookup is heavy on a big budget. */
export const PREVIEW_AT_ONCE = 2

/** A gate letting at most `size` calls run at once; a call whose query was dropped is skipped. */
function createGate(size: number) {
  let running = 0
  const waiting: (() => void)[] = []
  const release = () => {
    running -= 1
    waiting.shift()?.()
  }
  return async <T>(signal: AbortSignal, call: () => Promise<T>): Promise<T> => {
    if (running >= size) await new Promise<void>((resolve) => waiting.push(resolve))
    running += 1
    try {
      // Asked again meanwhile (a newer choice): this answer would not be read.
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      return await call()
    } finally {
      release()
    }
  }
}

/** A busy budget (statement timeout) is asked again, a little later each time. */
const BUSY_TRIES = 3
const busyDelay = (tries: number) => 1_000 * tries

/** The rows of each part as they are sent, from the draft and the choices. */
export function partsToSend(draft: ImportDraft, choices: Choices): Record<string, unknown>[][] {
  return chunksOf(draft.entries).map((entries) =>
    entries.map((entry) => rowToSend(entry, choices[entry.key])),
  )
}

/**
 * What the import would do with each row now (preview_import), part by part, under the batch
 * id the import will use: asked again, debounced, after every change of a choice. An answer
 * for earlier choices is kept on screen, marked as being checked, never shown as current.
 */
// R-IMPORT-252: the preview names the batch the rows will be sent in, and the same rows.
export function useImportPreview(
  budgetId: string,
  batchId: string,
  draftId: string,
  draft: ImportDraft,
  choices: Choices,
  /** The import has started: nothing is previewed any more, now or after it. */
  paused = false,
): PreviewState {
  const settled = useDebounced(choices, 400)
  const parts = useMemo(() => chunksOf(draft.entries), [draft])
  const [gate] = useState(() => createGate(PREVIEW_AT_ONCE))
  const queries = useQueries({
    queries: parts.map((entries, index) => {
      // The choices of this part only: a change elsewhere does not ask this part again.
      const own = entries.flatMap((entry) => {
        const choice = settled.value[entry.key]
        return choice ? [[entry.key, choice] as const] : []
      })
      return {
        queryKey: [
          ...budgetKeys.imports(budgetId),
          'preview',
          batchId,
          draftId,
          index,
          own,
        ] as const,
        placeholderData: keepPreviousData,
        staleTime: Infinity,
        // R-IMPORT-321: once the import runs, its answers are the truth; no part is asked again.
        enabled: !paused,
        retry: (failures: number, error: unknown) => failures < BUSY_TRIES && isBusyError(error),
        retryDelay: busyDelay,
        queryFn: async ({ signal }: { signal: AbortSignal }): Promise<ImportRowResult[]> =>
          gate(signal, async () =>
            unwrap(
              await supabase.rpc('preview_import', {
                p_budget_id: budgetId,
                p_batch_id: batchId,
                p_rows: entries.map((entry) => rowToSend(entry, settled.value[entry.key])) as Json,
              }),
            ),
          ),
      }
    }),
  })
  // The last answer of each part, kept while a new one is asked: a row keeps its controls (and
  // the focus) through a change, marked as being checked.
  // (React's pattern for information from earlier renders: kept in state, updated while rendering.)
  const [kept, setKept] = useState<Readonly<Record<number, ImportRowResult[]>>>({})
  const fresh: Record<number, ImportRowResult[]> = {}
  queries.forEach((query, index) => {
    if (query.data && !query.isPlaceholderData && kept[index] !== query.data)
      fresh[index] = query.data
  })
  if (Object.keys(fresh).length > 0) setKept({ ...kept, ...fresh })
  const answers: EntryAnswer[] = []
  parts.forEach((entries, index) => {
    const query = queries[index]
    const data = query?.data ?? kept[index]
    const stale =
      settled.stale || query?.data === undefined || query.isPlaceholderData || query.isFetching
    entries.forEach((entry, at) => {
      answers.push({ entry, result: data?.[at], stale: stale && data !== undefined })
    })
  })
  const failed = queries.find((query) => query.isError)
  return {
    answers,
    current:
      !settled.stale &&
      queries.every((query) => query.isSuccess && !query.isPlaceholderData && !query.isFetching),
    checking: settled.stale || queries.some((query) => query.isFetching),
    error: failed?.error ?? null,
    retry: () => {
      for (const query of queries) if (query.isError) void query.refetch()
    },
  }
}

export type RunStop =
  | { kind: 'limit'; part: number; fits: number | null }
  | { kind: 'network'; part: number }
  | { kind: 'busy'; part: number }
  | { kind: 'refused'; part: number; error: unknown }

export interface RunState {
  phase: 'idle' | 'sending' | 'catching-up' | 'done' | 'stopped'
  /** Parts whose answer arrived. */
  done: number
  parts: number
  /** The answers, part by part (index 0 is part 1). */
  answers: ImportRowResult[][]
  /** How many times a part was sent again after a lost answer. */
  resent: number
  /** The part last sent again because the budget was busy, and how many times. */
  busy: { part: number; count: number } | null
  stop: RunStop | null
}

const IDLE: RunState = {
  phase: 'idle',
  done: 0,
  parts: 0,
  answers: [],
  resent: 0,
  busy: null,
  stop: null,
}

/** How often a part is sent again after a lost answer before the import stops and says so. */
const NETWORK_TRIES = 3

function isNetworkFailure(error: unknown): boolean {
  return dbErrorKey(error) === 'errors.network' || error instanceof TypeError
}

export interface RunInput {
  draft: ImportDraft
  parts: Record<string, unknown>[][]
  batchId: string
  fingerprint: string
  toCategoriseName: string
}

/**
 * Sends the parts in order under one batch id (import_transactions), exactly the rows the
 * preview was asked about. A part whose answer is lost is sent again (the database records a
 * part once and answers it as the first time); a budget that has to catch up first is caught
 * up, then the part is sent again; the transaction limit stops the import before anything of
 * that part is written. While it runs, the batch is noted on this device so that a reload can
 * finish it under the same id.
 */
// R-IMPORT-208: parts of at most 500 rows, sent again after a lost answer, recorded once.
export function useImportRun(budgetId: string) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<RunState>(IDLE)
  const running = useRef(false)

  const run = useCallback(
    async ({ draft, parts, batchId, fingerprint, toCategoriseName }: RunInput) => {
      if (running.current) return
      running.current = true
      const answers: ImportRowResult[][] = []
      let resent = 0
      let busy: RunState['busy'] = null
      const startedAt = new Date().toISOString()
      setState({
        phase: 'sending',
        done: 0,
        parts: parts.length,
        answers: [],
        resent: 0,
        busy: null,
        stop: null,
      })
      const note = (confirmedParts: number) =>
        writePendingImport(budgetId, {
          batchId,
          fingerprint,
          source: draft.source,
          parts: parts.length,
          confirmedParts,
          startedAt,
        })
      note(0)
      const stop = (value: RunStop) => {
        setState({
          phase: 'stopped',
          done: answers.length,
          parts: parts.length,
          answers: [...answers],
          resent,
          busy,
          stop: value,
        })
      }
      try {
        for (let index = 0; index < parts.length; index += 1) {
          const part = index + 1
          let networkFailures = 0
          let busyTries = 0
          let catchUps = 0
          for (;;) {
            let error: unknown = null
            let data: ImportRowResult[] | null = null
            try {
              const result = await supabase.rpc('import_transactions', {
                p_budget_id: budgetId,
                p_batch_id: batchId,
                p_chunk: part,
                p_rows: (parts[index] ?? []) as Json,
                p_source: draft.source,
                ...(draft.statementFrom ? { p_statement_from: draft.statementFrom } : {}),
                ...(draft.statementTo ? { p_statement_to: draft.statementTo } : {}),
                p_to_categorise_name: toCategoriseName,
              })
              if (result.error) error = result.error
              else data = result.data
            } catch (thrown) {
              error = thrown
            }
            if (data) {
              answers.push(data)
              note(part)
              setState({
                phase: 'sending',
                done: part,
                parts: parts.length,
                answers: [...answers],
                resent,
                busy,
                stop: null,
              })
              break
            }
            if (isNetworkFailure(error)) {
              networkFailures += 1
              if (networkFailures > NETWORK_TRIES) {
                stop({ kind: 'network', part })
                return
              }
              resent += 1
              await new Promise((resolve) => window.setTimeout(resolve, 500 * networkFailures))
              continue
            }
            // A statement timeout wrote nothing: the same part is sent again, said as "busy",
            // never as a refusal.
            if (isBusyError(error)) {
              busyTries += 1
              if (busyTries > BUSY_TRIES) {
                stop({ kind: 'busy', part })
                return
              }
              busy = { part, count: busyTries }
              const now = busy
              setState((state) => ({ ...state, busy: now }))
              await new Promise((resolve) => window.setTimeout(resolve, busyDelay(busyTries)))
              continue
            }
            const code = dbErrorCode(error)
            if (code === 'catching_up' && catchUps < 3) {
              catchUps += 1
              setState((now) => ({ ...now, phase: 'catching-up' }))
              await catchUpBudget(budgetId)
              void queryClient.invalidateQueries({ queryKey: budgetKeys.ensurePeriods(budgetId) })
              setState((now) => ({ ...now, phase: 'sending' }))
              continue
            }
            if (code === 'transaction_limit_reached') {
              const detail = dbErrorDetail(error) as { fits?: unknown } | null
              stop({
                kind: 'limit',
                part,
                fits: typeof detail?.fits === 'number' ? detail.fits : null,
              })
              return
            }
            stop({ kind: 'refused', part, error })
            return
          }
        }
        clearPendingImport(budgetId)
        setState({
          phase: 'done',
          done: parts.length,
          parts: parts.length,
          answers,
          resent,
          busy,
          stop: null,
        })
      } catch (thrown) {
        stop({ kind: 'refused', part: answers.length + 1, error: thrown })
      } finally {
        running.current = false
        // Everything of the budget may have changed: totals, periods, the review count.
        void queryClient.invalidateQueries({ queryKey: budgetKeys.budget(budgetId) })
      }
    },
    [budgetId, queryClient],
  )
  const reset = useCallback(() => setState(IDLE), [])
  return { state, run, reset }
}
