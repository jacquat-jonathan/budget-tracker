/**
 * Statement import (step 6): the entry point the screens call. Given a PDF file, returns the
 * parsed statement (source, period or bill date, entries, controls) or a typed refusal, and
 * turns a parsed statement into the import function's rows. No React, no Supabase; the file
 * never leaves the browser.
 */
import { parseStatementText } from './parse-statement'
import { loadStatementPdf } from './pdf-text'
import type { StatementReadResult } from './types'

export { parseStatementText } from './parse-statement'
export {
  MAX_ITEMS_PER_DOCUMENT,
  MAX_ITEMS_PER_PAGE,
  MAX_STATEMENT_BYTES,
  MAX_STATEMENT_PAGES,
  READ_TIME_LIMIT_MS,
} from './limits'
export { chunkRows, IMPORT_CHUNK_SIZE, toImportBatch } from './import-rows'
export type * from './import-rows'
export type {
  CalendarDate,
  ControlId,
  Counterparty,
  Direction,
  EntryDetails,
  EntryFee,
  EntryHint,
  HandlingAction,
  LayoutProblem,
  OriginalAmount,
  ParsedStatement,
  Rappen,
  SecurityDetails,
  StatementControl,
  StatementEntry,
  StatementIdentity,
  StatementReadResult,
  StatementRefusal,
  StatementRefusalReason,
  StatementSource,
  UnsupportedLanguage,
} from './types'

/**
 * Read a statement PDF chosen by the user. pdf.js and its worker are loaded on the first call,
 * in chunks of their own. Never throws: every failure is a typed refusal.
 */
export async function readStatementFile(file: Blob | ArrayBuffer): Promise<StatementReadResult> {
  try {
    const loaded = await loadStatementPdf(file)
    if (!loaded.ok) return { ok: false, refusal: loaded.refusal }
    return parseStatementText(loaded.document)
  } catch {
    return { ok: false, refusal: { reason: 'unexpected-error' } }
  }
}
