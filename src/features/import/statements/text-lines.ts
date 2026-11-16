/**
 * Visual lines from pdf.js text items. pdf.js gives runs of text, not lines: items are grouped
 * by baseline within a tolerance (in one pass over the items sorted by baseline) and sorted by
 * x. Whitespace-only and empty items carry no geometry and are dropped. Rotated, skewed and
 * non-left-to-right items are kept, marked: a parser refuses one inside a transaction table.
 */
import { collapseSpaces } from './reading'
import type { StatementTextDocument, TextItemTuple } from './types'

export interface TextItem {
  str: string
  x: number
  y: number
  width: number
  height: number
  font: string
  /** Right edge: x + width (pdf.js width, never measured from the string). */
  right: number
  /** Rotated, skewed or not left to right: never part of a table. */
  oriented: boolean
}

export interface TextLine {
  page: number
  /** Baseline of the line's highest item (the others lie within LINE_TOLERANCE below it). */
  y: number
  /** Items sorted by x. */
  items: TextItem[]
  /** Items joined with single spaces, runs of spaces collapsed. */
  text: string
}

export interface PageLines {
  page: number
  lines: TextLine[]
}

/** Items of one visual line differ by up to 0.5 pt; lines are at least 8 pt apart. */
export const LINE_TOLERANCE = 2

function toItem(tuple: TextItemTuple): TextItem | null {
  const [str, x, y, width, height, font] = tuple
  if (str.trim() === '') return null
  const extra = tuple[7]
  const oriented =
    extra?.transform !== undefined || (extra?.dir !== undefined && extra.dir !== 'ltr')
  return { str, x, y, width, height, font, right: x + width, oriented }
}

export function joinItems(items: readonly TextItem[]): string {
  return collapseSpaces(items.map((item) => item.str).join(' '))
}

/** The lines of every page, top to bottom. */
export function pageLines(document: StatementTextDocument): PageLines[] {
  return document.pages.map((page) => {
    const items = page.items
      .map(toItem)
      .filter((item) => item !== null)
      .sort((a, b) => b.y - a.y)
    const lines: TextLine[] = []
    let group: TextItem[] = []
    const flush = () => {
      const [top] = group
      if (!top) return
      const sorted = group.sort((a, b) => a.x - b.x)
      lines.push({ page: page.page, y: top.y, items: sorted, text: joinItems(sorted) })
      group = []
    }
    for (const item of items) {
      const top = group[0]
      if (top && top.y - item.y > LINE_TOLERANCE) flush()
      group.push(item)
    }
    flush()
    return { page: page.page, lines }
  })
}

/** True when the document has no readable text at all. */
export function hasNoText(document: StatementTextDocument): boolean {
  return document.pages.every((page) => page.items.every((item) => item[0].trim() === ''))
}

/** A heading label: the item whose text is exactly `label`, on the line. */
export function findItem(line: TextLine, label: string): TextItem | undefined {
  return line.items.find((item) => collapseSpaces(item.str) === label)
}

/** True when the line has an item with exactly each of the labels. */
export function hasItems(line: TextLine, labels: readonly string[]): boolean {
  return labels.every((label) => findItem(line, label) !== undefined)
}
