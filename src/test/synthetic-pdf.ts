/**
 * A minimal PDF writer for tests: pages of positioned text in the standard Helvetica fonts
 * (WinAnsi encoding, every glyph 0.4 em wide so that item widths are predictable). Used to
 * prove the pdf.js loader on invented text; never for real statements.
 */

export interface SyntheticText {
  x: number
  y: number
  text: string
  size?: number
  bold?: boolean
  /** Stretch the text horizontally (Tz) so that it is exactly this wide. */
  width?: number
  /** Rotate the text a quarter turn (as on a margin). */
  rotated?: boolean
}

export interface SyntheticPage {
  width?: number
  height?: number
  texts: SyntheticText[]
}

export interface SyntheticPdfOptions {
  /**
   * Add a standard-security encryption dictionary whose user password is not empty, so that a
   * reader asks for a password (the content itself is not encrypted: it is never reached).
   */
  passwordProtected?: boolean
}

/** Every glyph is this many thousandths of an em wide. */
export const GLYPH_WIDTH = 400

// Unicode characters of WinAnsiEncoding outside Latin-1, and their codes.
const WIN_ANSI_EXTRA: Record<string, number> = {
  '€': 0x80,
  '‚': 0x82,
  '„': 0x84,
  '…': 0x85,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '–': 0x96,
  '—': 0x97,
}

function encodeText(text: string): string {
  let out = ''
  for (const character of text) {
    const code = WIN_ANSI_EXTRA[character] ?? character.charCodeAt(0)
    if (code > 0xff || (code < 0x20 && code !== 0x09)) throw new Error(`not WinAnsi: ${character}`)
    if (character === '(' || character === ')' || character === '\\') out += `\\${character}`
    else if (code < 0x80) out += character
    else out += `\\${code.toString(8).padStart(3, '0')}`
  }
  return out
}

function number(value: number): string {
  return String(Math.round(value * 1000) / 1000)
}

function hex(length: number, seed: number): string {
  let out = ''
  let state = seed
  for (let i = 0; i < length; i += 1) {
    state = (state * 1103515245 + 12345) % 2147483648
    out += (state % 256).toString(16).padStart(2, '0')
  }
  return out
}

/** Build the bytes of a PDF with the given pages. */
export function buildPdf(
  pages: SyntheticPage[],
  options: SyntheticPdfOptions = {},
): Uint8Array<ArrayBuffer> {
  const objects: string[] = []
  const add = (body: string): number => {
    objects.push(body)
    return objects.length
  }
  const widths = `[${Array.from({ length: 224 }, () => String(GLYPH_WIDTH)).join(' ')}]`
  const font = (name: string) =>
    `<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding /FirstChar 32 /LastChar 255 /Widths ${widths} >>`
  const catalog = add('')
  const pagesObject = add('')
  const regular = add(font('Helvetica'))
  const bold = add(font('Helvetica-Bold'))
  const kids: number[] = []
  for (const page of pages) {
    const content = page.texts
      .map((text) => {
        const size = text.size ?? 9
        const natural = (Array.from(text.text).length * GLYPH_WIDTH * size) / 1000
        const scale =
          text.width === undefined || natural === 0
            ? ''
            : `${number((100 * text.width) / natural)} Tz `
        return `BT /${text.bold ? 'F2' : 'F1'} ${number(size)} Tf ${scale}${text.rotated ? '0 1 -1 0' : '1 0 0 1'} ${number(text.x)} ${number(text.y)} Tm (${encodeText(text.text)}) Tj ET`
      })
      .join('\n')
    const stream = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
    kids.push(
      add(
        `<< /Type /Page /Parent ${pagesObject} 0 R /MediaBox [0 0 ${number(page.width ?? 595)} ${number(page.height ?? 842)}] ` +
          `/Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> >> /Contents ${stream} 0 R >>`,
      ),
    )
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObject} 0 R >>`
  objects[pagesObject - 1] =
    `<< /Type /Pages /Kids [${kids.map((kid) => `${kid} 0 R`).join(' ')}] /Count ${kids.length} >>`
  const encrypt = options.passwordProtected
    ? add(
        `<< /Filter /Standard /V 2 /R 3 /Length 128 /P -3904 /O <${hex(32, 7)}> /U <${hex(32, 11)}> >>`,
      )
    : null

  let out = '%PDF-1.4\n%âãÏÓ\n'
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(out.length)
    out += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`
  const id = hex(16, 3)
  out +=
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R` +
    (encrypt ? ` /Encrypt ${encrypt} 0 R` : '') +
    ` /ID [<${id}> <${id}>] >>\nstartxref\n${xref}\n%%EOF\n`
  // Every character above is one byte (Latin-1).
  return Uint8Array.from(out, (character) => character.charCodeAt(0))
}
