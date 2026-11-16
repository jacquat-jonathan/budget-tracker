import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

import { FIXTURE_NAMES, loadExpected, loadFixture } from '@/test/statement-fixtures'
import { buildPdf, GLYPH_WIDTH, type SyntheticPage } from '@/test/synthetic-pdf'

import { parseStatementDocument as parseStatementText } from './parse-statement'
import { MAX_STATEMENT_BYTES, MAX_STATEMENT_PAGES } from './limits'
import { extractTextItems, PDFJS_VERSION, type PdfjsApi } from './pdf-text'
import type { StatementTextDocument } from './types'

// In Node, pdf.js runs its worker code in the same thread when the module is preloaded.
beforeAll(async () => {
  const worker: unknown = await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
  Object.assign(globalThis, { pdfjsWorker: worker })
})

const api: PdfjsApi<pdfjs.PDFWorker> = pdfjs

function page(texts: SyntheticPage['texts']): SyntheticPage {
  return { width: 595.2, height: 841.8, texts }
}

/** Re-create a fixture as a PDF: same strings, positions and widths (stretched with Tz). */
function fixtureAsPdf(document: StatementTextDocument): Uint8Array {
  return buildPdf(
    document.pages.map((fixturePage) => ({
      width: fixturePage.width,
      height: fixturePage.height,
      texts: fixturePage.items
        .filter((item) => item[0].trim() !== '')
        .map(([str, x, y, width, height]) => ({ x, y, size: height, width, text: str })),
    })),
  )
}

describe('pdf.js text loader [R-IMPORT-210]', () => {
  it('uses the pdf.js version the fixtures were captured with', () => {
    expect(pdfjs.version).toBe(PDFJS_VERSION)
  })

  it('returns the text items in the fixture format', async () => {
    const pdf = buildPdf([
      page([
        { x: 72, y: 700, text: 'Relevé synthétique 1’234.50 ¿' },
        { x: 300, y: 700, text: 'Montant', bold: true },
      ]),
      page([{ x: 72, y: 500, text: 'Page deux', size: 12 }]),
    ])
    const result = await extractTextItems(api, pdf)
    if (!result.ok) throw new Error(result.refusal.reason)
    const { document } = result
    expect(document.format).toBe('pdfjs-text-items/1')
    expect(document.pdfjs).toBe(PDFJS_VERSION)
    expect(document.item).toEqual(['str', 'x', 'y', 'width', 'height', 'font', 'eol'])
    expect(document.pages.map((p) => [p.page, p.width, p.height])).toEqual([
      [1, 595.2, 841.8],
      [2, 595.2, 841.8],
    ])
    const texts = document.pages[0]?.items.filter((item) => item[0].trim() !== '') ?? []
    expect(texts.map((item) => item.slice(0, 5))).toEqual([
      ['Relevé synthétique 1’234.50 ¿', 72, 700, (29 * GLYPH_WIDTH * 9) / 1000, 9],
      ['Montant', 300, 700, (7 * GLYPH_WIDTH * 9) / 1000, 9],
    ])
    // Two fonts, short ids, styles kept.
    expect(new Set(texts.map((item) => item[5]))).toEqual(new Set(['f1', 'f2']))
    expect(Object.keys(document.fonts).sort()).toEqual(['f1', 'f2'])
    for (const item of document.pages.flatMap((p) => p.items)) {
      expect(item).toHaveLength(7)
      expect([0, 1]).toContain(item[6])
    }
  })

  it('fetches nothing while reading a PDF', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    try {
      const result = await extractTextItems(api, fixtureAsPdf(loadFixture('yuh-account')))
      expect(result.ok).toBe(true)
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('refuses a password-protected file', async () => {
    const pdf = buildPdf([page([{ x: 72, y: 700, text: 'Secret' }])], { passwordProtected: true })
    expect(await extractTextItems(api, pdf)).toEqual({
      ok: false,
      refusal: { reason: 'password-protected' },
    })
  })

  it('refuses a corrupt file', async () => {
    const bytes = Uint8Array.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> garbage', (c) =>
      c.charCodeAt(0),
    )
    expect(await extractTextItems(api, bytes)).toEqual({
      ok: false,
      refusal: { reason: 'corrupt-file' },
    })
  })

  it('refuses a file that is not a PDF', async () => {
    const bytes = Uint8Array.from('Date;Montant\n01.01.2025;12.00\n', (c) => c.charCodeAt(0))
    expect(await extractTextItems(api, bytes)).toEqual({
      ok: false,
      refusal: { reason: 'not-a-pdf' },
    })
  })

  it(`refuses a file over ${MAX_STATEMENT_BYTES} bytes before reading it`, async () => {
    const bytes = new Uint8Array(MAX_STATEMENT_BYTES + 1)
    bytes.set(Uint8Array.from('%PDF-1.4', (c) => c.charCodeAt(0)))
    expect(await extractTextItems(api, bytes)).toEqual({
      ok: false,
      refusal: {
        reason: 'file-too-large',
        maxBytes: MAX_STATEMENT_BYTES,
        bytes: MAX_STATEMENT_BYTES + 1,
      },
    })
  })

  it(`refuses a document of more than ${MAX_STATEMENT_PAGES} pages`, async () => {
    const pages = Array.from({ length: MAX_STATEMENT_PAGES + 1 }, () =>
      page([{ x: 72, y: 700, text: 'x' }]),
    )
    expect(await extractTextItems(api, buildPdf(pages))).toEqual({
      ok: false,
      refusal: {
        reason: 'too-many-pages',
        maxPages: MAX_STATEMENT_PAGES,
        pages: MAX_STATEMENT_PAGES + 1,
      },
    })
  })

  it('refuses a PDF without a text layer [R-IMPORT-085]', async () => {
    const result = await extractTextItems(api, buildPdf([page([])]))
    if (!result.ok) throw new Error(result.refusal.reason)
    expect(parseStatementText(result.document)).toEqual({
      ok: false,
      refusal: { reason: 'no-text-layer' },
    })
  })

  // End to end: each fixture written as a synthetic PDF (same invented strings, same baselines,
  // right edges of amounts kept), read back by pdf.js, parses to the expected result.
  it.each(FIXTURE_NAMES)(
    'reads %s rebuilt as a PDF to the expected parse [R-IMPORT-100]',
    async (name) => {
      const result = await extractTextItems(api, fixtureAsPdf(loadFixture(name)))
      if (!result.ok) throw new Error(result.refusal.reason)
      const parsed = parseStatementText(result.document)
      if (!parsed.ok) throw new Error(JSON.stringify(parsed.refusal))
      expect(parsed.statement.document).toStrictEqual(loadExpected(name))
    },
  )
})
