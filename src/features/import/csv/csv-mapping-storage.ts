import { CSV_SEPARATORS, type CsvSeparator } from './csv-parse'
import { DATE_FORMATS, type CsvMapping } from './csv-map'

/**
 * The column mapping last used in this budget for a file with this header, remembered on this
 * device only (a local preference, never sent), so the next export of the same bank opens
 * mapped. Only the mapping and the header's names are kept, never a row.
 */
export interface RememberedMapping {
  header: string[]
  separator: CsvSeparator
  mapping: CsvMapping
}

/** Version 2: the decimal mark is kept only when the member chose it or the file settled it. */
const VERSION = 2

const key = (budgetId: string) => `budget-tracker-csv-mapping:${budgetId}`

const column = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 1000 ? value : null

/** A stored mapping as a valid one, or null: a note changed by hand never breaks the page. */
function sanitize(value: unknown, version: unknown): CsvMapping | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const dateFormat = DATE_FORMATS.find((format) => format === raw.dateFormat) ?? null
  return {
    hasHeader: raw.hasHeader !== false,
    date: column(raw.date),
    dateFormat,
    amountMode: raw.amountMode === 'split' ? 'split' : 'signed',
    amount: column(raw.amount),
    negativeMeans: raw.negativeMeans === 'credit' ? 'credit' : 'debit',
    debit: column(raw.debit),
    credit: column(raw.credit),
    // Before version 2 a point was assumed when the file did not say: not a choice to keep.
    decimal:
      version === VERSION && (raw.decimal === '.' || raw.decimal === ',') ? raw.decimal : null,
    description: column(raw.description),
    merchant: column(raw.merchant),
    bankId: column(raw.bankId),
  }
}

export function readRememberedMapping(
  budgetId: string,
  header: readonly string[],
): RememberedMapping | null {
  try {
    const raw = localStorage.getItem(key(budgetId))
    if (!raw) return null
    const value = JSON.parse(raw) as Record<string, unknown> | null
    if (!value || !Array.isArray(value.header) || !value.header.every((x) => typeof x === 'string'))
      return null
    if (value.header.join('\u0000') !== header.join('\u0000')) return null
    const separator = CSV_SEPARATORS.find((one) => one === value.separator)
    const mapping = sanitize(value.mapping, value.version)
    if (!separator || !mapping) return null
    return { header: value.header, separator, mapping }
  } catch {
    return null
  }
}

export function rememberMapping(budgetId: string, value: RememberedMapping): void {
  try {
    localStorage.setItem(key(budgetId), JSON.stringify({ ...value, version: VERSION }))
  } catch {
    // Storage blocked: the mapping is asked again next time.
  }
}
