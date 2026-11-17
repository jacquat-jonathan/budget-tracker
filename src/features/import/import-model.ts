/**
 * The statement or file being imported, as the import page holds it: the rows exactly as they
 * will be sent (in statement order), the member's choices per row, and how they combine into
 * what each call carries. Pure: no React, no network.
 */
import type { ImportRow } from '@/features/import/statements/import-rows'

export type DraftSource = 'migros_account' | 'migros_card' | 'yuh' | 'csv'

export interface DraftEntry {
  /** The entry's number in the statement, or the file's line for a CSV. */
  key: number
  row: ImportRow
}

/** What was read and is about to be previewed; never the file itself. */
export interface ImportDraft {
  kind: 'pdf' | 'csv'
  source: DraftSource
  statementFrom: string | null
  statementTo: string | null
  entries: DraftEntry[]
}

/** The member's choice for a row, only where it differs from what the database proposes. */
export interface RowChoice {
  action?: 'import' | 'skip'
  /** A credit only: refund (the default) or extra income. */
  kind?: 'refund' | 'extra_income'
  /** An expense or refund only: a leaf in force on the row's date. */
  categoryId?: string
}

export type Choices = Readonly<Record<number, RowChoice>>

/** At most this many rows a call (the import function's bound). */
export const CHUNK_SIZE = 500
/** The most parts a batch takes (R-IMPORT-208), so the most rows one import can send. */
export const MAX_CHUNKS = 100
export const MAX_BATCH_ROWS = CHUNK_SIZE * MAX_CHUNKS

/** The row as sent: the statement's row and the member's choice, nothing else. */
export function rowToSend(
  entry: DraftEntry,
  choice: RowChoice | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...entry.row }
  if (!choice) return out
  if (choice.action) out.action = choice.action
  if (entry.row.direction === 'credit' && choice.kind) out.kind = choice.kind
  if (choice.categoryId && choice.kind !== 'extra_income') out.category_id = choice.categoryId
  return out
}

/** The entries in chunks of at most CHUNK_SIZE, in order. */
export function chunksOf<T>(items: readonly T[], size = CHUNK_SIZE): T[][] {
  const out: T[][] = []
  for (let start = 0; start < items.length; start += size)
    out.push(items.slice(start, start + size))
  return out
}

/** Set or clear part of a row's choice; an empty choice is removed. */
export function withChoice(choices: Choices, key: number, change: Partial<RowChoice>): Choices {
  const merged: RowChoice = { ...choices[key], ...change }
  const next = Object.fromEntries(
    Object.entries(merged).filter(([, value]) => value !== undefined),
  ) as RowChoice
  const others = Object.entries(choices).filter(([at]) => Number(at) !== key)
  return Object.fromEntries(Object.keys(next).length === 0 ? others : [...others, [key, next]])
}

/** The earliest and latest date of the rows (calendar strings compare as dates). */
export function dateRange(entries: readonly DraftEntry[]): { from: string; to: string } | null {
  let from: string | null = null
  let to: string | null = null
  for (const { row } of entries) {
    if (from === null || row.date < from) from = row.date
    if (to === null || row.date > to) to = row.date
  }
  return from !== null && to !== null ? { from, to } : null
}

/**
 * A fingerprint of the rows (SHA-256 of their JSON), to recognise the same statement when an
 * interrupted import is resumed: kept on the device instead of the rows themselves.
 */
export async function fingerprint(entries: readonly DraftEntry[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(entries.map((entry) => entry.row)))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
