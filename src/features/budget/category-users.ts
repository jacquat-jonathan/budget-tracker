import { dbErrorCode } from '@/lib/db-errors'

/** A subscription or debt that keeps a category from ending, as the refusal names it. */
export interface CategoryUser {
  kind: 'subscription' | 'debt'
  id: string
  name: string
}

/**
 * The subscriptions and debts a category_in_use refusal names (its detail: JSON
 * `[{kind, id, name}]`); null for any other error, or a detail that does not read.
 */
// R-CATEGORY-150: a refused removal names what uses the category, from the refusal itself.
export function categoryUsers(error: unknown): CategoryUser[] | null {
  if (dbErrorCode(error) !== 'category_in_use') return null
  const details = (error as { details?: unknown }).details
  if (typeof details !== 'string') return null
  try {
    const parsed: unknown = JSON.parse(details)
    if (!Array.isArray(parsed)) return null
    const users = parsed.filter(
      (item): item is CategoryUser =>
        typeof item === 'object' &&
        item !== null &&
        ((item as CategoryUser).kind === 'subscription' ||
          (item as CategoryUser).kind === 'debt') &&
        typeof (item as CategoryUser).id === 'string' &&
        typeof (item as CategoryUser).name === 'string',
    )
    return users.length > 0 ? users : null
  } catch {
    return null
  }
}
