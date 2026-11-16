import type { FieldPath, FieldValues, UseFormReturn } from 'react-hook-form'

/**
 * Values that only mean something together (a subscription's price, cadence and next charge
 * date) are one field for concurrent edits: the form shows them as one line of "their
 * version", and "Keep mine" keeps the whole group as the form shows it when any part of it
 * was edited, or takes the other member's group whole when none was. The shared hook keeps
 * edited fields one by one, so this wraps its keepMine.
 *
 * TODO(merge): the shared hooks are gaining groups as a first-class notion; once they have
 * them, register the group there and drop this wrapper.
 */
// R-SUBSCRIPTION-122: the terms are one field when another member changed them.
export function keepMineAsGroup<TIn extends FieldValues, TOut extends FieldValues>(
  form: UseFormReturn<TIn, unknown, TOut>,
  group: readonly FieldPath<TIn>[],
  keepMine: () => void,
): () => void {
  return () => {
    const edited = group.some((name) => form.getFieldState(name).isDirty)
    const mine = group.map((name) => [name, form.getValues(name)] as const)
    keepMine()
    if (!edited) return
    for (const [name, value] of mine) {
      form.setValue(name, value, { shouldDirty: true })
    }
  }
}
