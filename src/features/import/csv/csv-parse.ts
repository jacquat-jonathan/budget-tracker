/**
 * A CSV reader for the generic import (R-IMPORT-082): RFC 4180 quoting (a quoted cell may hold
 * the separator, a doubled quote and line breaks), a byte-order mark, CRLF or LF line ends,
 * and a separator detected among comma, semicolon and tab (the user can change it). Pure: no
 * React, nothing leaves the device.
 */

export type CsvSeparator = ',' | ';' | '\t'

export const CSV_SEPARATORS: readonly CsvSeparator[] = [';', ',', '\t']

export interface CsvRecord {
  /** The file's line number where the record starts (from 1). */
  line: number
  cells: string[]
}

export interface CsvParse {
  records: CsvRecord[]
  /** The line where a quoted cell starts that is never closed: nothing after it is read. */
  unclosedQuoteAt: number | null
}

/** At most this many characters are read (about 2'000 kB of text). */
export const MAX_CSV_CHARACTERS = 2_000_000

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/** Split the text into records of cells, the separator given. */
export function parseCsv(input: string, separator: CsvSeparator): CsvParse {
  const text = stripBom(input)
  const records: CsvRecord[] = []
  let cells: string[] = []
  let cell = ''
  let quoted = false
  let line = 1
  let recordLine = 1
  let quoteLine = 0
  let index = 0
  const pushRecord = () => {
    cells.push(cell)
    // A line with nothing on it is not a record.
    if (!(cells.length === 1 && cells[0]?.trim() === '')) records.push({ line: recordLine, cells })
    cells = []
    cell = ''
  }
  while (index < text.length) {
    const character = text.charAt(index)
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"'
          index += 2
          continue
        }
        quoted = false
        index += 1
        continue
      }
      if (character === '\r' && text[index + 1] === '\n') {
        cell += '\n'
        line += 1
        index += 2
        continue
      }
      if (character === '\n' || character === '\r') line += 1
      cell += character === '\r' ? '\n' : character
      index += 1
      continue
    }
    if (character === '"' && cell.trim() === '') {
      // A quote opens a quoted cell only at its start (spaces before it are dropped).
      quoted = true
      quoteLine = line
      cell = ''
      index += 1
      continue
    }
    if (character === separator) {
      cells.push(cell)
      cell = ''
      index += 1
      continue
    }
    if (character === '\r' || character === '\n') {
      pushRecord()
      index += character === '\r' && text[index + 1] === '\n' ? 2 : 1
      line += 1
      recordLine = line
      continue
    }
    cell += character
    index += 1
  }
  if (quoted) return { records, unclosedQuoteAt: quoteLine }
  if (cell !== '' || cells.length > 0) pushRecord()
  return { records, unclosedQuoteAt: null }
}

/**
 * The separator that splits the first records into the same number of cells (more than one),
 * the most cells winning; semicolon first on a tie (Swiss exports use it with decimal commas).
 * Null when none does.
 */
export function detectSeparator(input: string): CsvSeparator | null {
  const sample = stripBom(input).slice(0, 20_000)
  let best: { separator: CsvSeparator; cells: number } | null = null
  for (const separator of CSV_SEPARATORS) {
    const { records } = parseCsv(sample, separator)
    const head = records.slice(0, 20)
    // The last record of a cut sample may be incomplete.
    const complete = head.length > 2 && records.length > head.length ? head : head.slice(0, -1)
    const lines = complete.length > 0 ? complete : head
    const counts = new Set(lines.map((record) => record.cells.length))
    const cells = lines[0]?.cells.length ?? 0
    if (counts.size !== 1 || cells < 2) continue
    if (!best || cells > best.cells) best = { separator, cells }
  }
  return best?.separator ?? null
}
