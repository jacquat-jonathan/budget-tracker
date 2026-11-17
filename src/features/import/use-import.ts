import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { budgetKeys } from '@/features/budgets/budget-keys'
import { catchUpBudget } from '@/features/budgets/budget-queries'
import {
  chunksOf,
  rowToSend,
  type Choices,
  type DraftEntry,
  type ImportDraft,
} from '@/features/import/import-model'
import type { ImportRowResult } from '@/features/import/import-queries'
import {
  clearPendingImport,
  writePendingImport,
  type PendingImport,
} from '@/features/import/pending-import'
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

/** preview_import_part's totals of some rows (D-455): one count per action, and by kind. */
export interface PreviewTotals {
  rows: number
  import: number
  skip_duplicate: number
  skip_flagged: number
  skip_matched: number
  confirm_match: number
  skip_chosen: number
  invalid: number
  expense_count: number
  expense_amount: number
  refund_count: number
  refund_amount: number
  extra_income_count: number
  extra_income_amount: number
}

/** One answer of preview_import_part. */
export interface PartAnswer {
  rows: ImportRowResult[]
  part: PreviewTotals
  /** The totals of the staged parts the answer covers (`parts`). */
  statement: PreviewTotals
  parts: number[]
  /** How many transactions the budget can still take. */
  room: number
  /** Whether the rows to import of the parts covered fit. */
  fits: boolean
  /**
   * The part was already written (D-522): its rows are what its chunk recorded, and it is no
   * longer staged, so `statement` and `parts` do not cover it.
   */
  written: boolean
  /** A written part whose answer is no longer kept (chunk_expired): no rows to show. */
  expired?: boolean
}

const TOTAL_KEYS: readonly (keyof PreviewTotals)[] = [
  'rows',
  'import',
  'skip_duplicate',
  'skip_flagged',
  'skip_matched',
  'confirm_match',
  'skip_chosen',
  'invalid',
  'expense_count',
  'expense_amount',
  'refund_count',
  'refund_amount',
  'extra_income_count',
  'extra_income_amount',
]

function totalsOf(value: unknown): PreviewTotals {
  const source = (value ?? {}) as Record<string, unknown>
  const out = {} as PreviewTotals
  for (const key of TOTAL_KEYS) {
    const raw = source[key]
    // Sums are bigint in the database: a JSON number here, integer rappen.
    out[key] = typeof raw === 'number' ? raw : Number(raw ?? 0) || 0
  }
  return out
}

/** The answer as the call gives it (one JSON object), read defensively. */
export function readPartAnswer(value: Json): PartAnswer {
  const source = (value ?? {}) as Record<string, unknown>
  if (!Array.isArray(source.rows)) throw new Error('preview_import_part answered no rows')
  return {
    rows: source.rows as ImportRowResult[],
    part: totalsOf(source.part),
    statement: totalsOf(source.statement),
    parts: Array.isArray(source.parts) ? source.parts.map(Number) : [],
    room: typeof source.room === 'number' ? source.room : 0,
    fits: source.fits === true,
    written: source.written === true,
  }
}

/** A written part whose answer the database no longer keeps: nothing to show, nothing staged. */
function expiredAnswer(): PartAnswer {
  return {
    rows: [],
    part: totalsOf(null),
    statement: totalsOf(null),
    parts: [],
    room: 0,
    fits: true,
    written: true,
    expired: true,
  }
}

export interface PreviewState {
  answers: EntryAnswer[]
  /** Every part to preview has a current answer for the choices made. */
  current: boolean
  /** A part is being asked (first time or after a change). */
  checking: boolean
  /** The totals of every part previewed, from the last part's answer; null before it. */
  totals: { statement: PreviewTotals; parts: number[]; room: number; fits: boolean } | null
  /** Parts with a current answer, of the parts to preview. */
  progress: { done: number; of: number }
  /**
   * Parts found already written while previewing (another device carried on the import): their
   * rows show what they recorded, the totals do not count them. `expired`: of those, the ones
   * whose answer is no longer kept (no rows to show).
   */
  written: number[]
  expired: number[]
  error: unknown
  retry: () => void
}

/** A busy budget (statement timeout) or a lost answer is asked again, a little later each time. */
const BUSY_TRIES = 3
const busyDelay = (tries: number) => 1_000 * tries

/**
 * How often the parts are staged again from the first one the database no longer holds (kept
 * a day, at most 100 a budget: another statement previewed meanwhile can push them out) before
 * the preview says it could not keep them.
 */
const RESTAGE_TRIES = 3

/** The rows of each part as they are sent, from the draft and the choices. */
export function partsToSend(draft: ImportDraft, choices: Choices): Record<string, unknown>[][] {
  return chunksOf(draft.entries).map((entries) =>
    entries.map((entry) => rowToSend(entry, choices[entry.key])),
  )
}

interface Asked {
  /** The rows sent, as JSON: the answer is current while the part's rows are the same. */
  sig: string
  /** The answer number of the part before when this part was asked (0 for the first part). */
  after: number
  /** This answer's number: a later part asked after it carries it. */
  seq: number
  answer: PartAnswer
}

/** The database no longer held the staged parts, again and again. */
export class PreviewLostError extends Error {
  constructor() {
    super('preview_parts_lost')
  }
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

/**
 * The first part of first..part that the answer does not cover, or null. A written part is no
 * longer staged (D-522): it is never expected among the parts covered.
 */
function firstMissing(
  answer: PartAnswer,
  first: number,
  part: number,
  written: ReadonlySet<number>,
): number | null {
  const covered = new Set(answer.parts)
  for (let earlier = first; earlier <= part; earlier += 1) {
    if (!covered.has(earlier) && !written.has(earlier)) return earlier
  }
  return null
}

/**
 * What the import will do with each row (preview_import_part, D-455), part after part under the
 * batch id the import will use: part n is asked once part n - 1 has answered, so it takes into
 * account what the parts before it absorb and the choices they send, and the totals the last
 * part brings are the whole statement's. A choice changed in part k asks parts k to the last
 * again (debounced); an answer for earlier choices stays on screen, marked as being checked,
 * never shown as current. Parts before `firstPart` (recorded by an interrupted import) are not
 * previewed: they are sent again unchanged, and answer what they recorded. A part found written
 * meanwhile answers what its chunk recorded (D-522) and is no longer staged; one whose answer is
 * gone (chunk_expired) has no rows to show. Once the import starts nothing is asked any more.
 */
// R-IMPORT-361: one part at a time, in order, never once the import has started.
export function useImportPreview(
  budgetId: string,
  batchId: string,
  draft: ImportDraft,
  choices: Choices,
  /** The import has started: nothing is previewed any more, now or after it. */
  paused = false,
  /** The first part to preview: 1, or the part after those an interrupted import recorded. */
  firstPart = 1,
): PreviewState {
  const queryClient = useQueryClient()
  const settled = useDebounced(choices, 400)
  const parts = useMemo(() => chunksOf(draft.entries), [draft])
  const sent = useMemo(
    () =>
      parts.map((entries) => entries.map((entry) => rowToSend(entry, settled.value[entry.key]))),
    [parts, settled.value],
  )
  const sigs = useMemo(() => sent.map((rows) => JSON.stringify(rows)), [sent])
  // The answers and the part being asked change together: a render never sees an answer
  // without the part it ends, nor the other way round.
  const [asking, setAsking] = useState<{
    asked: Readonly<Record<number, Asked>>
    inFlight: number | null
  }>({ asked: {}, inFlight: null })
  const { asked, inFlight } = asking
  // Set at once when a part is asked: the effect may run again before the state says so.
  const flying = useRef(false)
  const [error, setError] = useState<unknown>(null)
  const restaged = useRef(0)
  const seq = useRef(0)
  // Parts that answered as written: no longer staged, never expected among the parts covered.
  const written = useRef(new Set<number>())
  const first = Math.max(1, firstPart)
  const last = parts.length

  // Part p's answer is current when its rows are the ones now chosen and it was asked after
  // the current answer of the part before it.
  let validUpTo = first - 1
  let previous = 0
  for (let part = first; part <= last; part += 1) {
    const answer = asked[part]
    if (!answer || answer.sig !== sigs[part - 1] || answer.after !== previous) break
    previous = answer.seq
    validUpTo = part
  }
  const next = validUpTo < last ? validUpTo + 1 : null
  const after = next === null || next === first ? 0 : (asked[next - 1]?.seq ?? 0)

  useEffect(() => {
    if (paused || settled.stale || error !== null || next === null) return
    if (flying.current || inFlight !== null) return
    const part = next
    const rows = sent[part - 1] ?? []
    const sig = sigs[part - 1] ?? ''
    flying.current = true
    void (async () => {
      setAsking((now) => ({ ...now, inFlight: part }))
      let failure: unknown = null
      let answer: PartAnswer | null = null
      let catchUps = 0
      let tries = 0
      for (;;) {
        try {
          // R-IMPORT-441: a written part's answer is what it recorded, an expired one has none.
          const result = await supabase.rpc('preview_import_part', {
            p_budget_id: budgetId,
            p_batch_id: batchId,
            p_part: part,
            p_rows: rows as Json,
          })
          if (result.error) throw result.error
          answer = readPartAnswer(result.data)
          break
        } catch (thrown) {
          if (dbErrorCode(thrown) === 'chunk_expired') {
            answer = expiredAnswer()
            break
          }
          if (dbErrorCode(thrown) === 'catching_up' && catchUps < 3) {
            catchUps += 1
            try {
              await catchUpBudget(budgetId)
            } catch (caught) {
              failure = caught
              break
            }
            void queryClient.invalidateQueries({ queryKey: budgetKeys.ensurePeriods(budgetId) })
            continue
          }
          // A statement timeout or a lost answer: the same part and rows, a little later.
          if ((isBusyError(thrown) || isNetworkFailure(thrown)) && tries < BUSY_TRIES) {
            tries += 1
            await sleep(busyDelay(tries))
            continue
          }
          failure = thrown
          break
        }
      }
      if (answer) {
        seq.current += 1
        const done: Asked = { sig, after, seq: seq.current, answer }
        // The answer covers the staged parts first..part; one the database no longer holds is
        // staged again from there (its answer no longer counts as current).
        if (answer.written) written.current.add(part)
        else written.current.delete(part)
        // A written part's answer says nothing of the staged parts (its `parts` is null).
        const missing = answer.written ? null : firstMissing(answer, first, part, written.current)
        flying.current = false
        setAsking((now) => {
          const out: Record<number, Asked> = { ...now.asked, [part]: done }
          const lost = missing === null ? undefined : out[missing]
          if (missing !== null && lost) out[missing] = { ...lost, after: -1 }
          return { asked: out, inFlight: null }
        })
        if (missing !== null) {
          restaged.current += 1
          if (restaged.current > RESTAGE_TRIES) setError(new PreviewLostError())
        }
      } else {
        flying.current = false
        setAsking((now) => ({ ...now, inFlight: null }))
        setError(failure)
      }
    })()
  }, [
    paused,
    settled.stale,
    inFlight,
    error,
    next,
    after,
    sent,
    sigs,
    first,
    budgetId,
    batchId,
    queryClient,
  ])

  const answers: EntryAnswer[] = []
  parts.forEach((entries, index) => {
    const part = index + 1
    const data = part >= first ? asked[part]?.answer.rows : undefined
    const stale = settled.stale || part > validUpTo
    entries.forEach((entry, at) => {
      answers.push({ entry, result: data?.[at], stale: stale && data !== undefined })
    })
  })
  // The totals come from the last part answered that is still staged: a written part's answer
  // covers only what it recorded.
  const answered = Array.from({ length: last - first + 1 }, (_, index) => first + index)
    .map((part) => ({ part, answer: asked[part]?.answer }))
    .filter((item) => item.answer !== undefined)
  const lastAnswer =
    asked[last]?.answer === undefined
      ? undefined
      : [...answered].reverse().find((item) => item.answer?.written !== true)?.answer
  const current = !settled.stale && next === null && inFlight === null
  return {
    answers,
    current,
    checking: !current && error === null,
    totals:
      last >= first && lastAnswer
        ? {
            statement: lastAnswer.statement,
            parts: lastAnswer.parts,
            room: lastAnswer.room,
            fits: lastAnswer.fits,
          }
        : null,
    progress: { done: Math.max(0, validUpTo - first + 1), of: Math.max(0, last - first + 1) },
    written: answered.filter((item) => item.answer?.written === true).map((item) => item.part),
    expired: answered.filter((item) => item.answer?.expired === true).map((item) => item.part),
    error,
    retry: () => {
      restaged.current = 0
      setError(null)
    },
  }
}

export const STORAGE_LIMITS = ['imports_per_day', 'rows_per_day', 'imports_kept'] as const
export type StorageLimit = (typeof STORAGE_LIMITS)[number]

/** The limit an import_limit_reached refusal names (its detail `{"limit": ...}`), if known. */
// R-IMPORT-442: each limit is said by its name; an unknown one by a general message.
export function storageLimit(error: unknown): StorageLimit | null {
  const detail = dbErrorDetail(error) as { limit?: unknown } | null
  const limit = detail?.limit
  return (STORAGE_LIMITS as readonly unknown[]).includes(limit) ? (limit as StorageLimit) : null
}

export type RunStop =
  | { kind: 'limit'; part: number; fits: number | null }
  | { kind: 'network'; part: number }
  | { kind: 'busy'; part: number }
  | { kind: 'refused'; part: number; error: unknown }
  /**
   * An import limit of the budget (import_limit_reached): `limit` is the detail's name of it
   * (imports_per_day, rows_per_day, imports_kept), null when the refusal names none.
   */
  | { kind: 'storage'; part: number; limit: StorageLimit | null }
  /** A recorded part whose answer is no longer kept (chunk_expired): not imported again. */
  | { kind: 'expired'; part: number }

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
  /** Recorded parts whose answer was no longer kept (chunk_expired), sent past on request. */
  expired: number[]
}

const IDLE: RunState = {
  phase: 'idle',
  done: 0,
  parts: 0,
  answers: [],
  resent: 0,
  busy: null,
  stop: null,
  expired: [],
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
  /** The member was told a recorded part's answer is gone: send the parts after it. */
  skipExpired?: boolean
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
    async ({
      draft,
      parts,
      batchId,
      fingerprint,
      toCategoriseName,
      skipExpired = false,
    }: RunInput) => {
      if (running.current) return
      running.current = true
      const answers: ImportRowResult[][] = []
      const expired: number[] = []
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
        expired: [],
      })
      const note = (confirmedParts: number, stoppedBy?: PendingImport['stoppedBy']) =>
        writePendingImport(budgetId, {
          batchId,
          fingerprint,
          source: draft.source,
          parts: parts.length,
          confirmedParts,
          startedAt,
          ...(stoppedBy ? { stoppedBy } : {}),
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
          expired: [...expired],
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
                expired: [...expired],
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
            // R-IMPORT-366: the import limit and a forgotten answer stop the run in their own words.
            if (code === 'import_limit_reached') {
              note(answers.length, 'storage')
              stop({ kind: 'storage', part, limit: storageLimit(error) })
              return
            }
            if (code === 'chunk_expired') {
              // Recorded long ago, its answer no longer kept: never imported twice. Once the
              // member has read why, the parts after it are sent; it counts nothing here.
              if (skipExpired) {
                expired.push(part)
                answers.push([])
                note(part)
                setState((now) => ({
                  ...now,
                  done: part,
                  answers: [...answers],
                  expired: [...expired],
                }))
                break
              }
              note(answers.length, 'expired')
              stop({ kind: 'expired', part })
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
          expired,
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
