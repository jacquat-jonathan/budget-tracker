import { useState } from 'react'

import { dbErrorCode } from '@/lib/db-errors'

/**
 * Concurrent edits (D-124, D-142): the revision a form or a confirmation sends is the one
 * the user saw when they opened it (`base`), never one read later behind their back. When
 * the record changes meanwhile (another member saved; the database refused our save with
 * record_changed and the record was read again), `changed` is true: the form keeps what was
 * typed and asks the user to take the other version or keep theirs (ChangedElsewhere);
 * `adopt` makes the latest version the new base, so the next save knowingly replaces it.
 *
 * `live` is the record as read now: undefined while unknown, null once it is gone.
 */
// R-CONCURRENCY-091: what was opened is what is sent; a change meanwhile is shown, not lost.
export function useEditBase<T extends { revision: number }>(live: T | null | undefined) {
  const [base, setBase] = useState<T | null>(live ?? null)
  // A revision this form saved itself: not someone else's change once it is read back.
  const [own, setOwn] = useState<number | null>(null)
  if (base === null && live) setBase(live)
  if (own !== null && live && live.revision === own) {
    setBase(live)
    setOwn(null)
  }
  const changed =
    live !== undefined &&
    live !== null &&
    base !== null &&
    live.revision !== base.revision &&
    live.revision !== own
  return {
    base,
    live,
    changed,
    gone: live === null && base !== null,
    /** Take the latest version as the base (after the user chose). */
    adopt: () => {
      if (live) setBase(live)
    },
    /** This form saved the record, which now has `revision`. */
    savedAs: (revision: number) => setOwn(revision),
  }
}

/** The database refused a write because the record changed since it was read. */
export function isRecordChanged(error: unknown): boolean {
  return dbErrorCode(error) === 'record_changed'
}
