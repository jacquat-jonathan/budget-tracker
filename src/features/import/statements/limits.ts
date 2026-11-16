/**
 * Bounds on what the statement reader accepts: a monthly statement is a few A4 pages of a few
 * hundred text items (at most 219 per page in the samples) and reads in well under a second.
 * Anything far beyond is refused before it can stall the page.
 */
import type { StatementRefusal, StatementTextDocument } from './types'

/** Files above this size are refused before pdf.js sees them. */
export const MAX_STATEMENT_BYTES = 10 * 1024 * 1024
export const MAX_STATEMENT_PAGES = 50
/** Text items (whitespace and empty items included), per page and per document. */
export const MAX_ITEMS_PER_PAGE = 5_000
export const MAX_ITEMS_PER_DOCUMENT = 20_000
/** Reading a file (pdf.js and the text items) is abandoned after this long. */
export const READ_TIME_LIMIT_MS = 20_000

/** A4 is 595 × 842 pt; Letter 612 × 792. Pages outside these bounds are refused. */
export const PAGE_WIDTH_RANGE = [500, 700] as const
export const PAGE_HEIGHT_RANGE = [700, 1000] as const

export function isStatementPageSize(width: number, height: number): boolean {
  return (
    width >= PAGE_WIDTH_RANGE[0] &&
    width <= PAGE_WIDTH_RANGE[1] &&
    height >= PAGE_HEIGHT_RANGE[0] &&
    height <= PAGE_HEIGHT_RANGE[1]
  )
}

export function tooManyItems(
  page: number | null,
): Extract<StatementRefusal, { reason: 'too-many-text-items' }> {
  return {
    reason: 'too-many-text-items',
    maxPerPage: MAX_ITEMS_PER_PAGE,
    maxPerDocument: MAX_ITEMS_PER_DOCUMENT,
    page,
  }
}

// R-IMPORT-216: the bounds apply to any text layer, read from a file or given as is.
/** The first bound the document breaks, or null. Cheap: no line grouping. */
export function checkTextBounds(document: StatementTextDocument): StatementRefusal | null {
  if (document.pages.length > MAX_STATEMENT_PAGES) {
    return { reason: 'too-many-pages', maxPages: MAX_STATEMENT_PAGES, pages: document.pages.length }
  }
  let total = 0
  for (const page of document.pages) {
    if (!isStatementPageSize(page.width, page.height)) {
      return {
        reason: 'unexpected-page-size',
        page: page.page,
        width: page.width,
        height: page.height,
      }
    }
    if (page.items.length > MAX_ITEMS_PER_PAGE) return tooManyItems(page.page)
    total += page.items.length
    if (total > MAX_ITEMS_PER_DOCUMENT) return tooManyItems(null)
  }
  return null
}
