/**
 * Two names that read the same in a list: equal once trimmed, ignoring case and accents. The
 * database allows them (two budgets, two categories may share a name); the forms only warn.
 */
// R-APP-539: a name already used is warned about at the field, never refused.
export function isSameName(a: string, b: string): boolean {
  const tidy = (value: string) =>
    value.trim().normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()
  const left = tidy(a)
  return left !== '' && left === tidy(b)
}
