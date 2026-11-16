import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

import { buildPdf, type SyntheticPage } from '@/test/synthetic-pdf'

import { MAX_ITEMS_PER_DOCUMENT, MAX_ITEMS_PER_PAGE } from './limits'
import { extractTextItems, type PdfjsApi, type PdfLoadOptions } from './pdf-text'

// In Node, pdf.js runs its worker code in the same thread when the module is preloaded.
beforeAll(async () => {
  const worker: unknown = await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
  Object.assign(globalThis, { pdfjsWorker: worker })
})

const api: PdfjsApi<pdfjs.PDFWorker> = pdfjs
const A4 = { width: 595, height: 842 }

function page(texts: SyntheticPage['texts'], size = A4): SyntheticPage {
  return { ...size, texts }
}

/** A stand-in for pdf.js that records how it is called and never opens anything. */
function fakePdfjs(promise: Promise<never>) {
  const calls: PdfLoadOptions<{ destroy(): void }>[] = []
  const destroyed: string[] = []
  const fake: PdfjsApi<{ destroy(): void }> = {
    version: 'fake',
    PDFWorker: class {
      destroy() {
        destroyed.push('worker')
      }
    },
    getDocument(options) {
      calls.push(options)
      return {
        promise,
        destroy: () => {
          destroyed.push('task')
          return Promise.resolve()
        },
      }
    },
  }
  return { fake, calls, destroyed }
}

const pdfBytes = buildPdf([page([{ x: 72, y: 700, text: 'x' }])])

describe('pdf.js runs fetching nothing and installing nothing [R-IMPORT-210]', () => {
  it('passes exactly these options', async () => {
    const { fake, calls } = fakePdfjs(Promise.reject(new Error('stop')))
    await extractTextItems(fake, pdfBytes)
    expect(calls).toHaveLength(1)
    const [options] = calls
    expect({ ...options, data: undefined, worker: undefined }).toEqual({
      data: undefined,
      worker: undefined,
      isOffscreenCanvasSupported: false,
      isImageDecoderSupported: false,
      disableFontFace: true,
      useSystemFonts: false,
      useWorkerFetch: false,
      useWasm: false,
      enableXfa: false,
      disableRange: true,
      disableStream: true,
      disableAutoFetch: true,
      verbosity: 0,
    })
    // A copy of the bytes: pdf.js may transfer (detach) its buffer.
    expect(options?.data).toEqual(pdfBytes)
    expect(options?.data).not.toBe(pdfBytes)
  })

  it('records rotated text as such', async () => {
    const pdf = buildPdf([page([{ x: 30, y: 400, text: 'Marge', rotated: true }])])
    const result = await extractTextItems(api, pdf)
    if (!result.ok) throw new Error(result.refusal.reason)
    const item = result.document.pages[0]?.items.find((candidate) => candidate[0] === 'Marge')
    expect(item?.[7]?.transform?.slice(0, 4)).toEqual([0, 9, -9, 0])
  })
})

describe('bounds on the file being read [R-IMPORT-216]', () => {
  it('refuses a page far from A4 before reading its text', async () => {
    const pdf = buildPdf([page([{ x: 72, y: 700, text: 'x' }], { width: 595, height: 360_000 })])
    expect(await extractTextItems(api, pdf)).toEqual({
      ok: false,
      refusal: { reason: 'unexpected-page-size', page: 1, width: 595, height: 360_000 },
    })
  })

  it(`refuses a page of more than ${MAX_ITEMS_PER_PAGE} text items`, async () => {
    const texts = Array.from({ length: MAX_ITEMS_PER_PAGE + 1 }, (_, i) => ({
      x: 10 + (i % 50) * 11,
      y: 20 + (i % 800),
      text: 'a',
      size: 1,
    }))
    expect(await extractTextItems(api, buildPdf([page(texts)]))).toEqual({
      ok: false,
      refusal: {
        reason: 'too-many-text-items',
        maxPerPage: MAX_ITEMS_PER_PAGE,
        maxPerDocument: MAX_ITEMS_PER_DOCUMENT,
        page: 1,
      },
    })
  })

  it('gives up after the time limit and stops the worker', async () => {
    const { fake, destroyed } = fakePdfjs(new Promise<never>(() => undefined))
    expect(await extractTextItems(fake, pdfBytes, 20)).toEqual({
      ok: false,
      refusal: { reason: 'timed-out', limitMs: 20 },
    })
    expect(destroyed[0]).toBe('worker')
  })

  it('stops the worker after a normal read too', async () => {
    const { fake, destroyed } = fakePdfjs(
      Promise.reject(Object.assign(new Error('pw'), { name: 'PasswordException' })),
    )
    expect(await extractTextItems(fake, pdfBytes)).toEqual({
      ok: false,
      refusal: { reason: 'password-protected' },
    })
    expect(destroyed).toEqual(['task', 'worker'])
  })
})
