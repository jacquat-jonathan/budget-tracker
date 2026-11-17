/**
 * An import that was being sent when the page was left or reloaded. Only what is needed to
 * finish it is kept on this device: the batch id, the statement's fingerprint (never its
 * rows), how many parts there are and how many were confirmed. Opening the same statement
 * again sends it under the same batch id: the parts already recorded answer as before and are
 * not recorded twice (the import is idempotent by batch and part).
 */

export interface PendingImport {
  batchId: string
  fingerprint: string
  source: string
  parts: number
  confirmedParts: number
  startedAt: string
  /** Why it stopped, when the database said so: the import limit, or a part's answer gone. */
  stoppedBy?: 'storage' | 'expired'
}

const key = (budgetId: string) => `budget-tracker-import-pending:${budgetId}`

const SOURCES = ['migros_account', 'migros_card', 'yuh', 'csv']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A timestamp formatTimestamp accepts (with time and zone) that is a real moment. */
function isTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value.slice(0, 10)
  )
}

const count = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100

export function readPendingImport(budgetId: string): PendingImport | null {
  try {
    const raw = localStorage.getItem(key(budgetId))
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<Record<keyof PendingImport, unknown>> | null
    // A note changed by hand (or by an older version) is ignored, never shown half-read.
    if (
      !value ||
      typeof value.batchId !== 'string' ||
      !UUID.test(value.batchId) ||
      typeof value.fingerprint !== 'string' ||
      !count(value.parts) ||
      !count(value.confirmedParts) ||
      Number(value.confirmedParts) > Number(value.parts)
    ) {
      return null
    }
    return {
      batchId: value.batchId,
      fingerprint: value.fingerprint,
      source:
        typeof value.source === 'string' && SOURCES.includes(value.source) ? value.source : '',
      parts: Number(value.parts),
      confirmedParts: Number(value.confirmedParts),
      startedAt: isTimestamp(value.startedAt) ? value.startedAt : '',
      ...(value.stoppedBy === 'storage' || value.stoppedBy === 'expired'
        ? { stoppedBy: value.stoppedBy }
        : {}),
    }
  } catch {
    return null
  }
}

/** Whether this device holds a note of an interrupted import, for any budget. */
export function hasAnyPendingImport(): boolean {
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const name = localStorage.key(index)
      if (name?.startsWith(key('')) && readPendingImport(name.slice(key('').length))) return true
    }
    return false
  } catch {
    return false
  }
}

export function writePendingImport(budgetId: string, value: PendingImport): void {
  try {
    localStorage.setItem(key(budgetId), JSON.stringify(value))
  } catch {
    // Storage blocked: the import still runs; only resuming after a reload is lost.
  }
}

export function clearPendingImport(budgetId: string): void {
  try {
    localStorage.removeItem(key(budgetId))
  } catch {
    // Nothing to do.
  }
}
