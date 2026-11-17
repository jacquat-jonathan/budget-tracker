import { useEffect, useState } from 'react'
import type { FieldValues, Path, PathValue, UseFormReturn } from 'react-hook-form'

import { formFieldsOf, type EditBase, type FieldView } from '@/hooks/use-edit-base'
import { dbErrorKey } from '@/lib/db-errors'

export interface ConcurrentFormOptions<TIn extends FieldValues> {
  /**
   * Form fields that are not fields of the record (the correction switch, its period, a new
   * next charge date): always the user's own choice.
   */
  controls?: readonly (keyof TIn & string)[]
  /**
   * For a correction: the chosen period's terms as the database gives them now, which replace
   * the record's current terms as "now" (Keep mine, Load their version).
   */
  current?: () => Partial<TIn> | null
  /**
   * The save's error. Only a save whose answer was lost on the way (a network failure) can
   * turn out to have been recorded; a refusal the database returned never was.
   */
  error?: unknown
}

/** The same value, also when typed differently (a money string against its stored form). */
function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  const number = (value: unknown) =>
    typeof value === 'string' && /^-?[\d'’ .,]+$/.test(value.trim())
      ? Number(value.replace(/['’ ,]/g, ''))
      : typeof value === 'number'
        ? value
        : NaN
  const x = number(a)
  const y = number(b)
  return !Number.isNaN(x) && !Number.isNaN(y) && x === y
}

/**
 * The view (or D-160 group) a form field belongs to; 'control' for a declared control; null
 * for a field in no view: a mistake of the form (assertFieldsCovered fails on it in tests).
 */
export function fieldGroup(
  name: string,
  views: readonly FieldView[],
  controls: readonly string[],
): FieldView | 'control' | null {
  if (controls.includes(name)) return 'control'
  return views.find((view) => formFieldsOf(view).includes(name)) ?? null
}

/** Every field of a form belongs to a view or is a declared control. */
export function assertFieldsCovered(
  names: readonly string[],
  views: readonly FieldView[],
  controls: readonly string[],
) {
  for (const name of names) {
    if (fieldGroup(name, views, controls) === null) {
      throw new Error(`Form field "${name}" belongs to no view and is not a declared control.`)
    }
  }
}

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
// R-CONCURRENCY-190: "Keep mine" keeps exactly what was typed; the rest is what is true now.
// R-CONCURRENCY-280: "saved" only after a lost answer, when the record holds all that was sent.
export function useConcurrentForm<
  T extends { revision: number },
  TIn extends FieldValues,
  TOut extends FieldValues,
>(
  form: UseFormReturn<TIn, unknown, TOut>,
  edit: EditBase<T>,
  valuesOf: (record: T) => TIn,
  onResolved?: () => void,
  options: ConcurrentFormOptions<TIn> = {},
) {
  const { controls = [], current, error } = options
  // What the database says now for what this form edits: the record's values, and for a
  // correction the chosen period's terms read again (never today's terms).
  const now = (record: T): TIn => ({ ...valuesOf(record), ...(current?.() ?? {}) })
  // Their changes taken in silently, with the revision they were taken at: shown until the
  // user types or the record moves on (their own save, for a form that stays open).
  const [updated, setUpdated] = useState<{ changes: FieldView[]; revision: number } | null>(null)
  // The record now holds exactly what this form sent, at this revision: the user's own save
  // whose answer was lost on the way (network), not someone else's change (R-CONCURRENCY-191).
  const [recovered, setRecovered] = useState<number | null>(null)
  // What the last save sent: every field of the form when it was submitted.
  const { submitCount } = form.formState
  const [sent, setSent] = useState<{ count: number; values: Record<string, unknown> } | null>(null)
  if (submitCount > 0 && sent?.count !== submitCount) {
    // Taken while rendering the submit (the fields cannot change while a save is under way).
    setSent({ count: submitCount, values: form.getValues() })
  }
  const lost = dbErrorKey(error) === 'errors.network'
  // Read during render: react-hook-form only tracks the form state a render has read.
  const { isDirty, dirtyFields } = form.formState
  const { changed, live } = edit
  const base = edit.base
  useEffect(() => {
    // A gap fails every test of the form; in production it is only logged.
    if (!base) return
    try {
      assertFieldsCovered(Object.keys(form.getValues()), edit.describe(base), controls)
    } catch (error) {
      if (import.meta.env.PROD) console.error(error)
      else throw error
    }
    // Once per record opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base?.revision])
  useEffect(() => {
    if (changed && live && isDirty && lost && sent) {
      // "Saved" only when the record now holds every value this form sent, after a save
      // whose answer was lost: a refusal, or a record that matches only some of the
      // fields (another member typed the same value), is never taken for the user's save.
      const stored = valuesOf(live) as Record<string, unknown>
      const mine = Object.keys(stored).every(
        (field) => controls.includes(field) || same(stored[field], sent.values[field]),
      )
      if (mine) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRecovered(live.revision)
        form.reset(now(live))
        edit.adopt()
        onResolved?.()
        return
      }
    }
    if (changed && live && !isDirty) {
      // Synchronising the form (an external store) with a record read anew: an effect's job;
      // the note is set in the same pass as the reset it describes.
      setUpdated({ changes: edit.theirs, revision: live.revision })
      form.reset(now(live))
      edit.adopt()
      onResolved?.()
    }
    // Only when the record or the typing state changes; the callbacks are recreated each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changed, live, isDirty, lost])
  return {
    /** Their changes when they were taken in silently (nothing typed). */
    updated:
      updated && !isDirty && edit.base?.revision === updated.revision ? updated.changes : null,
    /** The user's own save, found in the record after its answer was lost. */
    recovered: recovered !== null && edit.base?.revision === recovered && !isDirty,
    /** The other member's changes while something is typed: the user must choose. */
    pending: changed && isDirty ? edit.theirs : null,
    useTheirs: () => {
      if (!live) return
      form.reset(now(live))
      edit.adopt()
      onResolved?.()
    },
    keepMine: () => {
      if (!live) return
      const mine = form.getValues()
      const dirty = dirtyFields as Record<string, unknown>
      const theirs = now(live)
      const views = edit.describe(live)
      // Now becomes the form's starting point; what is mine (the fields, or D-160 groups, the
      // user changed in this form) is set again on top, as edits, so a later change by someone
      // else still finds it edited. Every other field is what is true now.
      form.reset(theirs)
      for (const name of Object.keys(mine)) {
        const group = fieldGroup(name, views, controls)
        const keep =
          group === 'control'
            ? true
            : group === null
              ? Boolean(dirty[name])
              : formFieldsOf(group).some((field) => Boolean(dirty[field]))
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
