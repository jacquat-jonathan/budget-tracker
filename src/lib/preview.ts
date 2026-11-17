import { dbErrorCode } from '@/lib/db-errors'

/**
 * A preview is the database's answer for the save's own arguments. A refusal (a named code)
 * is that answer: it is shown at once, never retried. A preview that failed to load (the
 * network, a timeout) is retried once, and then offers to try again.
 */
export function previewRetry(failures: number, error: unknown): boolean {
  return failures < 1 && dbErrorCode(error) === null
}

/** Whether a preview failed to load, rather than answering with a refusal. */
export function previewLoadFailed(query: { isError: boolean; error: unknown }): boolean {
  return query.isError && dbErrorCode(query.error) === null
}

/**
 * Save waits for the preview of exactly the arguments it will send: it holds while that
 * preview is loading, being retried or read again, and when it failed or was refused. A
 * preview kept from an earlier answer never lets a save through after its read failed.
 */
// R-APP-440: no save before its own preview is shown.
export function previewHolds(query: {
  isSuccess: boolean
  isFetching: boolean
  isError: boolean
}): boolean {
  return !query.isSuccess || query.isFetching || query.isError
}
