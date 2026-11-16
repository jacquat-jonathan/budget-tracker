/**
 * The anonymised statement fixtures (test-fixtures/statements) for the parser tests, and
 * helpers to derive variants from them: move, remove, add or rewrite lines.
 */
import { z } from 'zod'

import '@/lib/zod-config'
import type { StatementTextDocument, TextItemTuple } from '@/features/import/statements/types'

import migrosAccountExpected from '../../test-fixtures/statements/migros-bank-account/expected.json?raw'
import migrosAccountFixture from '../../test-fixtures/statements/migros-bank-account/fixture.json?raw'
import cardBillExpected from '../../test-fixtures/statements/migros-bank-credit-card/expected.json?raw'
import cardBillFixture from '../../test-fixtures/statements/migros-bank-credit-card/fixture.json?raw'
import yuhExpected from '../../test-fixtures/statements/yuh-account/expected.json?raw'
import yuhFixture from '../../test-fixtures/statements/yuh-account/fixture.json?raw'

import migrosAccountEntries from '../features/import/statements/expected-entries/migros-bank-account.json?raw'
import cardBillEntries from '../features/import/statements/expected-entries/migros-bank-credit-card.json?raw'
import yuhEntries from '../features/import/statements/expected-entries/yuh-account.json?raw'

const itemSchema = z.union([
  z.tuple([z.string(), z.number(), z.number(), z.number(), z.number(), z.string(), z.number()]),
  z.tuple([
    z.string(),
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.string(),
    z.number(),
    z.object({ transform: z.array(z.number()).optional(), dir: z.string().optional() }),
  ]),
])

const documentSchema = z.object({
  format: z.literal('pdfjs-text-items/1'),
  pdfjs: z.string(),
  source: z.string().optional(),
  item: z.array(z.string()),
  fonts: z.record(
    z.string(),
    z.object({ family: z.string(), ascent: z.number(), descent: z.number() }),
  ),
  pages: z.array(
    z.object({
      page: z.number(),
      width: z.number(),
      height: z.number(),
      items: z.array(itemSchema),
    }),
  ),
})

export type FixtureName = 'migros-bank-account' | 'migros-bank-credit-card' | 'yuh-account'

const raw: Record<FixtureName, { fixture: string; expected: string; entries: string }> = {
  'migros-bank-account': {
    fixture: migrosAccountFixture,
    expected: migrosAccountExpected,
    entries: migrosAccountEntries,
  },
  'migros-bank-credit-card': {
    fixture: cardBillFixture,
    expected: cardBillExpected,
    entries: cardBillEntries,
  },
  'yuh-account': { fixture: yuhFixture, expected: yuhExpected, entries: yuhEntries },
}

/**
 * The normalised entries the screens use, as committed in expected-entries/: derived from
 * expected.json field by field, not from the parser.
 */
export function loadExpectedEntries(name: FixtureName): unknown {
  return JSON.parse(raw[name].entries)
}

export const FIXTURE_NAMES: FixtureName[] = [
  'migros-bank-account',
  'migros-bank-credit-card',
  'yuh-account',
]

/** A fresh copy of a fixture's text items, safe to modify. */
export function loadFixture(name: FixtureName): StatementTextDocument {
  return documentSchema.parse(JSON.parse(raw[name].fixture))
}

/** The expected parse, without the file's comment and file name. */
export function loadExpected(name: FixtureName): Record<string, unknown> {
  const expected = z.record(z.string(), z.unknown()).parse(JSON.parse(raw[name].expected))
  delete expected.$comment
  delete expected.fixture
  return expected
}

// --- Variants ---------------------------------------------------------------------------------

function pageOf(document: StatementTextDocument, page: number) {
  const found = document.pages.find((candidate) => candidate.page === page)
  if (!found) throw new Error(`no page ${page}`)
  return found
}

/** Items of a page whose text matches, within 2 pt of `y` and `x` when given. */
function matching(items: TextItemTuple[], text: string | RegExp, y?: number, x?: number) {
  return items.filter(
    (item) =>
      (typeof text === 'string' ? item[0] === text : text.test(item[0])) &&
      (y === undefined || Math.abs(item[2] - y) <= 2) &&
      (x === undefined || Math.abs(item[1] - x) <= 2),
  )
}

/** Replace the text of exactly one item (an error if none or several match). */
export function replaceText(
  document: StatementTextDocument,
  page: number,
  from: string | RegExp,
  to: string,
  y?: number,
  x?: number,
): void {
  const items = matching(pageOf(document, page).items, from, y, x)
  if (items.length !== 1)
    throw new Error(`${items.length} items match ${String(from)} on page ${page}`)
  const [item] = items
  if (item) item[0] = to
}

/** Move exactly one item (by text and baseline) to a new x, keeping its width. */
export function setItemX(
  document: StatementTextDocument,
  page: number,
  text: string,
  y: number,
  x: number,
): void {
  const items = matching(pageOf(document, page).items, text, y)
  if (items.length !== 1) throw new Error(`${items.length} items match ${text} on page ${page}`)
  const [item] = items
  if (item) item[1] = x
}

/** Remove exactly one item (by text and baseline). */
export function removeItem(
  document: StatementTextDocument,
  page: number,
  text: string,
  y: number,
): void {
  const target = pageOf(document, page)
  const items = matching(target.items, text, y)
  if (items.length !== 1) throw new Error(`${items.length} items match ${text} on page ${page}`)
  target.items = target.items.filter((item) => !items.includes(item))
}

/** Remove every item of the lines at the given baselines. */
export function removeLines(document: StatementTextDocument, page: number, ys: number[]): void {
  const target = pageOf(document, page)
  target.items = target.items.filter(
    (item) => item[0] === '' || !ys.some((y) => Math.abs(item[2] - y) <= 2),
  )
}

/** Remove every item whose baseline lies between `top` and `bottom` (inclusive). */
export function removeLinesBetween(
  document: StatementTextDocument,
  page: number,
  top: number,
  bottom: number,
): void {
  const target = pageOf(document, page)
  target.items = target.items.filter((item) => item[0] === '' || item[2] > top || item[2] < bottom)
}

/** Move the lines at the given baselines to another page, at new baselines. */
export function moveLines(
  document: StatementTextDocument,
  fromPage: number,
  moves: { from: number; to: number }[],
  toPage: number,
): void {
  const source = pageOf(document, fromPage)
  const target = pageOf(document, toPage)
  for (const move of moves) {
    const items = source.items.filter(
      (item) => item[0].trim() !== '' && Math.abs(item[2] - move.from) <= 2,
    )
    if (items.length === 0) throw new Error(`no line at ${move.from} on page ${fromPage}`)
    source.items = source.items.filter((item) => !items.includes(item))
    for (const item of items) item[2] = move.to + (item[2] - move.from)
    target.items.push(...items)
  }
}

/** Copy the lines at the given baselines to another page, at new baselines. */
export function copyLines(
  document: StatementTextDocument,
  fromPage: number,
  copies: { from: number; to: number }[],
  toPage: number,
): void {
  const source = pageOf(document, fromPage)
  const target = pageOf(document, toPage)
  for (const copy of copies) {
    const items = source.items.filter(
      (item) => item[0].trim() !== '' && Math.abs(item[2] - copy.from) <= 2,
    )
    if (items.length === 0) throw new Error(`no line at ${copy.from} on page ${fromPage}`)
    for (const item of items) {
      const clone = structuredClone(item)
      clone[2] = copy.to + (item[2] - copy.from)
      target.items.push(clone)
    }
  }
}

/** A document of plain lines (one item each, x 70, 12 pt apart), for recognition tests. */
export function documentFromLines(pages: string[][]): StatementTextDocument {
  return {
    format: 'pdfjs-text-items/1',
    pdfjs: '6.4.299',
    item: ['str', 'x', 'y', 'width', 'height', 'font', 'eol'],
    fonts: { f1: { family: 'sans-serif', ascent: 0.9, descent: -0.2 } },
    pages: pages.map((lines, index) => ({
      page: index + 1,
      width: 595,
      height: 842,
      items: lines.map((line, i): TextItemTuple => [
        line,
        70,
        800 - i * 12,
        line.length * 4,
        9,
        'f1',
        1,
      ]),
    })),
  }
}

/** Shift every item of a page whose y is at or below `below` by `dy` (negative: down). */
export function shiftLines(
  document: StatementTextDocument,
  page: number,
  below: number,
  dy: number,
): void {
  for (const item of pageOf(document, page).items) {
    if (item[2] <= below) item[2] = Math.round((item[2] + dy) * 100) / 100
  }
}

/** Add an item (width as given: the parsers never measure strings). */
export function addItem(
  document: StatementTextDocument,
  page: number,
  str: string,
  x: number,
  y: number,
  width: number,
  font = 'f2',
): void {
  pageOf(document, page).items.push([str, x, y, width, 9, font, 0])
}

/** Every non-empty item of a page at a baseline. */
export function lineItems(
  document: StatementTextDocument,
  page: number,
  y: number,
): TextItemTuple[] {
  return pageOf(document, page).items.filter(
    (item) => item[0].trim() !== '' && Math.abs(item[2] - y) <= 2,
  )
}

/** Copy a page (deep) and insert it after `after`, renumbering the following pages. */
export function duplicatePage(document: StatementTextDocument, after: number): number {
  const source = pageOf(document, after)
  const copy = structuredClone(source)
  const index = document.pages.indexOf(source)
  document.pages.splice(index + 1, 0, copy)
  document.pages.forEach((page, i) => {
    page.page = i + 1
  })
  return copy.page
}

/** Format integer rappen the way the statements print amounts ("1'234.50"). */
export function printed(rappen: number): string {
  const francs = Math.trunc(rappen / 100)
  const cents = String(rappen % 100).padStart(2, '0')
  return `${String(francs).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}.${cents}`
}

/** Read a printed amount back ("1'234.50" -> 123450), for test arithmetic. */
export function rappen(text: string): number {
  const match = /^([\d']+)\.(\d{2})$/.exec(text)
  if (!match) throw new Error(`not an amount: ${text}`)
  return Number((match[1] ?? '').replace(/'/g, '')) * 100 + Number(match[2])
}

/** Add `delta` rappen to every amount item in a column (by right edge) at or below a baseline. */
export function adjustColumn(
  document: StatementTextDocument,
  pages: { page: number; below: number }[],
  right: number,
  delta: number,
): number {
  let count = 0
  for (const { page, below } of pages) {
    for (const item of pageOf(document, page).items) {
      if (
        item[2] <= below &&
        Math.abs(item[1] + item[3] - right) <= 4 &&
        /^[\d']+\.\d{2}$/.test(item[0])
      ) {
        item[0] = printed(rappen(item[0]) + delta)
        count += 1
      }
    }
  }
  return count
}
