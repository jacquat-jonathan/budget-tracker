import { useEffect, useState } from 'react'
import type { FieldValues, UseFormReturn } from 'react-hook-form'

import type { EditBase, FieldView } from '@/hooks/use-edit-base'

/**
 * The form side of concurrent edits (R-CONCURRENCY-091), the same for every edit form:
 *
 * - Nothing typed yet: the form simply takes the other version, and says what changed.
 * - Something typed: what was typed stays; the user loads their version (the form is
 *   refilled) or keeps theirs: then only the fields they edited keep their value, every
 *   other field takes the other member's, so saving sends only what they changed.
 */
export function useConcurrentForm<
  T extends { revision: number },
  TIn extends FieldValues,
  TOut extends FieldValues,
>(
  form: UseFormReturn<TIn, unknown, TOut>,
  edit: EditBase<T>,
  valuesOf: (record: T) => TIn,
  onResolved?: () => void,
) {
  const [updated, setUpdated] = useState<FieldView[] | null>(null)
  const { isDirty } = form.formState
  const { changed, live } = edit
  useEffect(() => {
    if (changed && live && !isDirty) {
      // Synchronising the form (an external store) with a record read anew: an effect's job;
      // the note is set in the same pass as the reset it describes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUpdated(edit.theirs)
      form.reset(valuesOf(live))
      edit.adopt()
      onResolved?.()
    }
    // Only when the record or the typing state changes; the callbacks are recreated each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changed, live, isDirty])
  return {
    /** Their changes when they were taken in silently (nothing typed). */
    updated,
    /** The other member's changes while something is typed: the user must choose. */
    pending: changed && isDirty ? edit.theirs : null,
    useTheirs: () => {
      if (!live) return
      form.reset(valuesOf(live))
      edit.adopt()
      onResolved?.()
    },
    keepMine: () => {
      if (!live) return
      form.reset(valuesOf(live), { keepDirtyValues: true })
      edit.adopt()
      onResolved?.()
    },
  }
}
