import { buildPdf } from '@/test/synthetic-pdf'

import { readStatementFile } from '.'

// pdf.js cannot be loaded: the app is offline, or a new release replaced its chunk.
vi.mock('pdfjs-dist', () => {
  throw new Error('Failed to fetch dynamically imported module')
})

const pdf = buildPdf([{ texts: [{ x: 72, y: 700, text: 'Relevé' }] }])

describe('readStatementFile never throws [R-IMPORT-210]', () => {
  it('refuses with reader-unavailable when pdf.js cannot be loaded', async () => {
    expect(await readStatementFile(new Blob([pdf]))).toEqual({
      ok: false,
      refusal: { reason: 'reader-unavailable' },
    })
  })

  it('refuses a file it cannot read as a file, without loading pdf.js', async () => {
    expect(await readStatementFile(new TextEncoder().encode('hello').buffer)).toEqual({
      ok: false,
      refusal: { reason: 'not-a-pdf' },
    })
  })

  it('turns a failure while reading the file into a refusal', async () => {
    const broken = new Blob([pdf])
    vi.spyOn(broken, 'arrayBuffer').mockRejectedValue(new Error('NotReadableError'))
    expect(await readStatementFile(broken)).toEqual({
      ok: false,
      refusal: { reason: 'unexpected-error' },
    })
  })
})
