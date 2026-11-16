/**
 * A CSV file's bytes as text, on the device (R-IMPORT-324). Small and apart from the parser so
 * the start screen can read a file without loading the mapping step.
 */
/** Control characters other than tab and line ends (C0, DEL, C1): never part of bank text. */
export const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g

export type CsvDecoded =
  | { ok: true; text: string; encoding: 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252' }
  | { ok: false; reason: 'binary' | 'undecodable' }

/** Whether the bytes look like UTF-16 without a byte-order mark: a NUL in every other byte. */
function utf16Without(bytes: Uint8Array): 'utf-16le' | 'utf-16be' | null {
  const sample = Math.min(bytes.length - (bytes.length % 2), 4096)
  if (sample < 4) return null
  let evenNul = 0
  let oddNul = 0
  for (let index = 0; index < sample; index += 2) {
    if (bytes[index] === 0) evenNul += 1
    if (bytes[index + 1] === 0) oddNul += 1
  }
  const pairs = sample / 2
  if (oddNul > pairs * 0.4 && evenNul < pairs * 0.05) return 'utf-16le'
  if (evenNul > pairs * 0.4 && oddNul < pairs * 0.05) return 'utf-16be'
  return null
}

/**
 * A CSV file's bytes as text: UTF-16 by its byte-order mark or its pattern of NULs (Excel's
 * "Unicode text"), else UTF-8, else Windows-1252 (older bank exports). A file that is not text
 * (many control characters) or whose UTF-16 is broken is refused with the reason.
 */
export function decodeCsvBytes(bytes: Uint8Array): CsvDecoded {
  let encoding: 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252' | null = null
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le'
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be'
  else encoding = utf16Without(bytes)
  let text: string
  if (encoding !== null) {
    try {
      text = new TextDecoder(encoding, { fatal: true }).decode(bytes)
    } catch {
      return { ok: false, reason: 'undecodable' }
    }
  } else {
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      encoding = 'utf-8'
    } catch {
      text = new TextDecoder('windows-1252').decode(bytes)
      encoding = 'windows-1252'
    }
  }
  // A few stray control characters are removed cell by cell; a file full of them is not text.
  const sample = text.slice(0, 20_000)
  const controls = sample.match(CONTROL)?.length ?? 0
  if (sample.length > 0 && controls > Math.max(8, sample.length * 0.02)) {
    return { ok: false, reason: 'binary' }
  }
  return { ok: true, text, encoding }
}
