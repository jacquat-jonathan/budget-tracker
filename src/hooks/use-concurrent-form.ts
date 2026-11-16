import { useEffect, useState } from 'react'
import type { FieldValues, Path, PathValue, UseFormReturn } from 'react-hook-form'

import { formFieldsOf, type EditBase, type FieldView } from '@/hooks/use-edit-base'

/**
 * The form side of concurrent edits (R-CONCURRENCY-091), the same for every edit form:
 *
 * - Nothing typed yet: the form simply takes the other version, and says what changed.
 * - Something typed: what was typed stays; the user loads their version (the form is
 *   refilled) or keeps theirs: then every field they edited keeps the value they typed and
 *   every other field takes the other member's, so saving sends only what they changed.
 *   A group of values that only mean something together (FieldView.fields) is one field:
 *   kept whole when any part of it was edited, taken whole otherwise (D-160).
 * - A save refused (record_changed) only because of a field this form does not show: the
 *   record is read again and becomes the base in silence; the error says to check and save
 *   again. Never resent automatically (docs/database.md, "Concurrent edits").
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
  // Their changes taken in silently, with the revision they were taken at: shown until the
  // user types or the record moves on (their own save, for a form that stays open).
  const [updated, setUpdated] = useState<{ changes: FieldView[]; revision: number } | null>(null)
  // Read during render: react-hook-form only tracks the form state a render has read.
  const { isDirty, dirtyFields } = form.formState
  const { changed, live } = edit
  useEffect(() => {
    if (changed && live && !isDirty) {
      // Synchronising the form (an external store) with a record read anew: an effect's job;
      // the note is set in the same pass as the reset it describes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUpdated({ changes: edit.theirs, revision: live.revision })
      form.reset(valuesOf(live))
      edit.adopt()
      onResolved?.()
    }
    // Only when the record or the typing state changes; the callbacks are recreated each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changed, live, isDirty])
  return {
    /** Their changes when they were taken in silently (nothing typed). */
    updated:
      updated && !isDirty && edit.base?.revision === updated.revision ? updated.changes : null,
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
      const mine = form.getValues()
      const dirty = dirtyFields as Record<string, unknown>
      const theirs = valuesOf(live)
      // Their version becomes the form's starting point; what is mine is set again on top,
      // as edits, so a later change by someone else still finds it edited.
      form.reset(theirs)
      for (const name of Object.keys(mine)) {
        const group = edit.theirs.find((view) => formFieldsOf(view).includes(name))
        const keep = group ? formFieldsOf(group).some((field) => Boolean(dirty[field])) : true
        const value = mine[name] as unknown
        if (keep && !Object.is(value, theirs[name])) {
          form.setValue(name as Path<TIn>, value as PathValue<TIn, Path<TIn>>, {
            shouldDirty: true,
          })
        }
      }
      edit.adopt()
      onResolved?.()
    },
  }
}
