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
}

const key = (budgetId: string) => `budget-tracker-import-pending:${budgetId}`

export function readPendingImport(budgetId: string): PendingImport | null {
  try {
    const raw = localStorage.getItem(key(budgetId))
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<PendingImport>
    if (
      typeof value.batchId !== 'string' ||
      typeof value.fingerprint !== 'string' ||
      typeof value.parts !== 'number' ||
      typeof value.confirmedParts !== 'number'
    ) {
      return null
    }
    return {
      batchId: value.batchId,
      fingerprint: value.fingerprint,
      source: typeof value.source === 'string' ? value.source : '',
      parts: value.parts,
      confirmedParts: value.confirmedParts,
      startedAt: typeof value.startedAt === 'string' ? value.startedAt : '',
    }
  } catch {
    return null
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
