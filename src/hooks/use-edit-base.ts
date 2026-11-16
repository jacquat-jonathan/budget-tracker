import { useState } from 'react'

import { dbErrorCode } from '@/lib/db-errors'

/** One field of a record as the user sees it, to compare two versions and to show theirs. */
export interface FieldView {
  key: string
  label: string
  value: string
}

/**
 * Concurrent edits (D-124, D-136, D-150). A form or confirmation saves over the version the
 * user opened (`base`), never one read later behind their back. `live` is the same record
 * read by id, independently of any list, filter or page (undefined while unknown, null once
 * it is gone).
 *
 * The record's revision is the only revision source, but only the fields this form shows
 * matter to it (`describe`): a newer revision that leaves them as they were (the user's own
 * save in another form, another member changing a field this form does not show) silently
 * becomes the base. When a shown field differs, `theirs` lists those fields with the other
 * member's values, and the form asks the user to load their version or keep theirs
 * (useConcurrentForm, ChangedElsewhere).
 */
// R-CONCURRENCY-091: what was opened is what is sent; a change meanwhile is shown, not lost.
export function useEditBase<T extends { revision: number }>(
  /** The record as the user opened it; undefined for a form that creates one. */
  opened: T | undefined,
  live: T | null | undefined,
  describe: (record: T) => FieldView[],
) {
  const [base, setBase] = useState<T | undefined>(opened)
  // A revision this form saved itself: not someone else's change once it is read back.
  const [own, setOwn] = useState<number | null>(null)
  const theirs =
    base && live && live.revision !== base.revision
      ? describe(live).filter((field) => {
          const before = describe(base).find((item) => item.key === field.key)
          return before?.value !== field.value
        })
      : []
  if (
    base &&
    live &&
    live.revision !== base.revision &&
    (theirs.length === 0 || live.revision === own)
  ) {
    setBase(live)
    if (live.revision === own) setOwn(null)
  }
  const changed = live !== undefined && live !== null && theirs.length > 0 && live.revision !== own
  return {
    base,
    live,
    /** Fields the other member changed, with their values. */
    theirs: changed ? theirs : [],
    changed,
    /** Removed by someone else meanwhile. */
    gone: base !== undefined && live === null,
    /** Take the latest version as the base (after the user chose). */
    adopt: () => {
      if (live) setBase(live)
    },
    /** This form saved the record, which now has `revision`. */
    savedAs: (revision: number) => setOwn(revision),
  }
}

export type EditBase<T extends { revision: number }> = ReturnType<typeof useEditBase<T>>

/** The database refused a write because the record changed since it was read. */
export function isRecordChanged(error: unknown): boolean {
  return dbErrorCode(error) === 'record_changed'
}
