/**
 * The text layer of a PDF statement, read in the browser with pdf.js (the file is never
 * uploaded). pdf.js is loaded on demand, so it never weighs on the main bundle; its worker is
 * a same-origin file emitted by the build (production CSP: `script-src 'self'`,
 * `worker-src 'self' blob:`).
 *
 * No network request while reading: no CMaps, standard fonts, ICC profiles or wasm decoders are
 * fetched (their URLs are left unset and fetching in the worker is off), fonts are not loaded
 * into the page, and the data is passed in memory.
 *
 * Bounded: each read has its own worker, which is terminated when the read ends, when a page
 * is not statement-sized, when the text items exceed their bound, or when the time limit runs
 * out; the text is streamed so that a page of millions of items is cut off early.
 */
import {
  isStatementPageSize,
  MAX_ITEMS_PER_DOCUMENT,
  MAX_ITEMS_PER_PAGE,
  MAX_STATEMENT_BYTES,
  MAX_STATEMENT_PAGES,
  READ_TIME_LIMIT_MS,
  tooManyItems,
} from './limits'
import type { StatementRefusal, StatementTextDocument, TextFontStyle, TextItemTuple } from './types'

export type FileRefusal = Extract<
  StatementRefusal,
  {
    reason:
      | 'not-a-pdf'
      | 'password-protected'
      | 'corrupt-file'
      | 'file-too-large'
      | 'too-many-pages'
      | 'too-many-text-items'
      | 'unexpected-page-size'
      | 'timed-out'
      | 'reader-unavailable'
  }
>

export type TextLoadResult =
  { ok: true; document: StatementTextDocument } | { ok: false; refusal: FileRefusal }

// The parts of the pdf.js API this module uses; the real module satisfies them.
interface PdfTextItem {
  str: string
  dir: string
  transform: number[]
  width: number
  height: number
  fontName: string
  hasEOL: boolean
}

interface PdfTextChunk {
  items: (PdfTextItem | { type: string })[]
  styles: Record<string, { fontFamily: string; ascent: number; descent: number }>
}

interface PdfPage {
  view: number[]
  streamTextContent(): ReadableStream<PdfTextChunk>
}

interface PdfDocument {
  numPages: number
  getPage(pageNumber: number): Promise<PdfPage>
}

interface PdfWorkerHandle {
  destroy(): void
}

export interface PdfLoadOptions<W extends PdfWorkerHandle> {
  data: Uint8Array
  worker: W
  isOffscreenCanvasSupported: boolean
  isImageDecoderSupported: boolean
  disableFontFace: boolean
  useSystemFonts: boolean
  useWorkerFetch: boolean
  useWasm: boolean
  enableXfa: boolean
  disableRange: boolean
  disableStream: boolean
  disableAutoFetch: boolean
  verbosity: number
}

export interface PdfjsApi<W extends PdfWorkerHandle> {
  version: string
  PDFWorker: new () => W
  getDocument(options: PdfLoadOptions<W>): {
    promise: Promise<PdfDocument>
    destroy(): Promise<void>
  }
}

/** The pdf.js version the fixtures were captured with; the loader must report the same. */
export const PDFJS_VERSION = '6.4.299'

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function isTextItem(item: PdfTextItem | { type: string }): item is PdfTextItem {
  return 'str' in item
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : ''
}

function refuse(refusal: FileRefusal): TextLoadResult {
  return { ok: false, refusal }
}

/** "%PDF-" in the first kilobyte, as readers require. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  const head = String.fromCharCode(...bytes.subarray(0, 1024))
  return head.includes('%PDF-')
}

/** Converts pdf.js items to the fixture format, numbering fonts in order of appearance. */
class ItemWriter {
  readonly fonts: Record<string, TextFontStyle> = {}
  private readonly fontIds = new Map<string, string>()

  write(item: PdfTextItem, styles: PdfTextChunk['styles']): TextItemTuple {
    let font = this.fontIds.get(item.fontName)
    if (font === undefined) {
      font = `f${String(this.fontIds.size + 1)}`
      this.fontIds.set(item.fontName, font)
      const style = styles[item.fontName]
      this.fonts[font] = {
        family: style?.fontFamily ?? '',
        ascent: round(style?.ascent ?? 0),
        descent: round(style?.descent ?? 0),
      }
    }
    const [a = 1, b = 0, c = 0, d = 1, x = 0, y = 0] = item.transform
    const tuple: TextItemTuple = [
      item.str,
      round(x),
      round(y),
      round(item.width),
      round(item.height),
      font,
      item.hasEOL ? 1 : 0,
    ]
    const rotated = b !== 0 || c !== 0 || a < 0 || d < 0
    if (!rotated && item.dir === 'ltr') return tuple
    // The eighth element only when needed: rotated or skewed text, or not left to right.
    return [
      ...tuple,
      {
        ...(rotated ? { transform: item.transform } : {}),
        ...(item.dir !== 'ltr' ? { dir: item.dir } : {}),
      },
    ]
  }
}

async function readPages(version: string, pdf: PdfDocument): Promise<TextLoadResult> {
  if (pdf.numPages > MAX_STATEMENT_PAGES) {
    return refuse({ reason: 'too-many-pages', maxPages: MAX_STATEMENT_PAGES, pages: pdf.numPages })
  }
  const writer = new ItemWriter()
  const pages: StatementTextDocument['pages'] = []
  let total = 0
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const [left = 0, bottom = 0, right = 0, top = 0] = page.view
    const width = round(right - left)
    const height = round(top - bottom)
    if (!isStatementPageSize(width, height)) {
      return refuse({ reason: 'unexpected-page-size', page: pageNumber, width, height })
    }
    const items: TextItemTuple[] = []
    const reader = page.streamTextContent().getReader()
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      for (const item of chunk.value.items) {
        if (!isTextItem(item)) continue
        items.push(writer.write(item, chunk.value.styles))
        total += 1
      }
      if (items.length > MAX_ITEMS_PER_PAGE || total > MAX_ITEMS_PER_DOCUMENT) {
        void reader.cancel().catch(() => undefined)
        return refuse(tooManyItems(items.length > MAX_ITEMS_PER_PAGE ? pageNumber : null))
      }
    }
    pages.push({ page: pageNumber, width, height, items })
  }
  return {
    ok: true,
    document: {
      format: 'pdfjs-text-items/1',
      pdfjs: version,
      item: ['str', 'x', 'y', 'width', 'height', 'font', 'eol'],
      fonts: writer.fonts,
      pages,
    },
  }
}

/**
 * Read every page's text items with the given pdf.js module, in the fixture format
 * ("pdfjs-text-items/1"). Exported for tests, which pass the Node build of pdf.js.
 */
// R-IMPORT-210 R-IMPORT-216: bad, oversized, odd-sized, item-flooded and slow files are refused.
export async function extractTextItems<W extends PdfWorkerHandle>(
  pdfjs: PdfjsApi<W>,
  bytes: Uint8Array,
  timeLimitMs = READ_TIME_LIMIT_MS,
): Promise<TextLoadResult> {
  if (bytes.byteLength > MAX_STATEMENT_BYTES) {
    return refuse({
      reason: 'file-too-large',
      maxBytes: MAX_STATEMENT_BYTES,
      bytes: bytes.byteLength,
    })
  }
  if (!looksLikePdf(bytes)) return refuse({ reason: 'not-a-pdf' })

  const worker = new pdfjs.PDFWorker()
  const task = pdfjs.getDocument({
    // pdf.js transfers the buffer to its worker: give it a copy, never the caller's.
    data: bytes.slice(),
    worker,
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
  const read = (async (): Promise<TextLoadResult> => {
    let pdf: PdfDocument
    try {
      pdf = await task.promise
    } catch (error) {
      // No onPassword callback: an encrypted file that needs a password rejects at once.
      return refuse({
        reason: errorName(error) === 'PasswordException' ? 'password-protected' : 'corrupt-file',
      })
    }
    try {
      return await readPages(pdfjs.version, pdf)
    } catch {
      return refuse({ reason: 'corrupt-file' })
    }
  })()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<TextLoadResult>((resolve) => {
    timer = setTimeout(() => {
      resolve(refuse({ reason: 'timed-out', limitMs: timeLimitMs }))
    }, timeLimitMs)
  })
  const result = await Promise.race([read, timeout])
  clearTimeout(timer)
  if (result.ok || result.refusal.reason === 'password-protected') {
    // A normal end: let pdf.js close the document, then stop the worker.
    await task.destroy().catch(() => undefined)
    worker.destroy()
  } else {
    // The worker may be busy for a long time: terminate it at once.
    worker.destroy()
    void task.destroy().catch(() => undefined)
  }
  return result
}

async function loadPdfjs(): Promise<PdfjsApi<import('pdfjs-dist').PDFWorker> | null> {
  try {
    const [pdfjs, worker] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ])
    // Same-origin worker file, emitted by the build under assets/.
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    return pdfjs
  } catch {
    return null
  }
}

/** Read the text items of a PDF file in the browser. Never throws for a bad file: refuses it. */
export async function loadStatementPdf(input: Blob | ArrayBuffer): Promise<TextLoadResult> {
  const size = input instanceof Blob ? input.size : input.byteLength
  if (size > MAX_STATEMENT_BYTES) {
    return refuse({ reason: 'file-too-large', maxBytes: MAX_STATEMENT_BYTES, bytes: size })
  }
  const bytes = new Uint8Array(input instanceof Blob ? await input.arrayBuffer() : input)
  if (!looksLikePdf(bytes)) return refuse({ reason: 'not-a-pdf' })
  const pdfjs = await loadPdfjs()
  if (!pdfjs) return refuse({ reason: 'reader-unavailable' })
  return extractTextItems(pdfjs, bytes)
}
