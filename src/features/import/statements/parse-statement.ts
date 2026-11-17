/**
 * Read a statement from its pdf.js text items: recognise it, parse it with the parser of its
 * source, check that it adds up. Pure: no React, no Supabase, no network.
 */
import { checkTextBounds } from './limits'
import { parseMigrosAccount } from './migros-bank-account'
import { parseCardBill } from './migros-bank-credit-card'
import { finishEntries, StatementRefusalError } from './parse-support'
import { recognise } from './recognise'
import { hasNoText, pageLines } from './text-lines'
import type {
  ParsedStatement,
  StatementParse,
  StatementParseResult,
  StatementReadResult,
  StatementTextDocument,
} from './types'
import { parseYuhAccount } from './yuh-account'

/**
 * The full parse, with the source-specific document in the fixtures' shape (holder, IBAN,
 * skipped lines, English notes). For tests and internal use: the screens use
 * `parseStatementText`, which leaves the document out.
 */
// R-IMPORT-084 R-IMPORT-085: the source comes from the content; anything else is refused.
export function parseStatementDocument(document: StatementTextDocument): StatementParseResult {
  const bounds = checkTextBounds(document)
  if (bounds) return { ok: false, refusal: bounds }
  if (hasNoText(document)) return { ok: false, refusal: { reason: 'no-text-layer' } }
  const pages = pageLines(document)
  const recognition = recognise(pages)
  if (recognition.kind === 'unrecognised') {
    return { ok: false, refusal: { reason: 'unrecognised-document' } }
  }
  if (recognition.kind === 'other-language') {
    return {
      ok: false,
      refusal: {
        reason: 'unsupported-language',
        language: recognition.language,
        supportedLanguages: ['fr'],
      },
    }
  }
  try {
    const { source } = recognition
    const parse =
      source === 'migros-bank-account'
        ? parseMigrosAccount(pages)
        : source === 'migros-bank-credit-card'
          ? parseCardBill(pages)
          : parseYuhAccount(pages)
    finishEntries(source, parse.entries)
    const statement: StatementParse = { source, ...parse }
    return { ok: true, statement }
  } catch (error) {
    if (error instanceof StatementRefusalError) return { ok: false, refusal: error.refusal }
    throw error
  }
}

/** Read a statement from its text items: the result the screens use. */
export function parseStatementText(document: StatementTextDocument): StatementReadResult {
  const result = parseStatementDocument(document)
  if (!result.ok) return result
  const { source, identity, period, entries, controls }: ParsedStatement = result.statement
  return { ok: true, statement: { source, identity, period, entries, controls } }
}
