import type { CsvSeparator } from './csv-parse'
import type { CsvMapping } from './csv-map'

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

const key = (budgetId: string) => `budget-tracker-csv-mapping:${budgetId}`

export function readRememberedMapping(
  budgetId: string,
  header: readonly string[],
): RememberedMapping | null {
  try {
    const raw = localStorage.getItem(key(budgetId))
    if (!raw) return null
    const value = JSON.parse(raw) as RememberedMapping
    if (!Array.isArray(value.header) || value.header.join('\u0000') !== header.join('\u0000'))
      return null
    if (typeof value.mapping !== 'object') return null
    return value
  } catch {
    return null
  }
}

export function rememberMapping(budgetId: string, value: RememberedMapping): void {
  try {
    localStorage.setItem(key(budgetId), JSON.stringify(value))
  } catch {
    // Storage blocked: the mapping is asked again next time.
  }
}
