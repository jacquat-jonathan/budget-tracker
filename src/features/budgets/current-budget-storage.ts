import type { MyBudget } from '@/features/budgets/budget-queries'

export const CURRENT_BUDGET_KEY_PREFIX = 'budget-tracker-current-budget:'

function storageKey(userId: string): string {
  return `${CURRENT_BUDGET_KEY_PREFIX}${userId}`
}

/** The budget this user last chose in this browser, if any. */
export function readStoredBudget(userId: string): string | null {
  try {
    return localStorage.getItem(storageKey(userId))
  } catch {
    return null
  }
}

export function storeBudget(userId: string, budgetId: string): void {
  try {
    localStorage.setItem(storageKey(userId), budgetId)
  } catch {
    // Storage blocked: the choice lasts until the page is reloaded.
  }
}

/**
 * The remembered budget when it is still one of mine; otherwise the first by name. So a
 * budget that disappears (deleted, or I was removed or left) is replaced at once, and the
 * replacement is remembered only when I choose it.
 */
export function pickCurrentBudget(budgets: MyBudget[], wanted: string | null): MyBudget | null {
  return budgets.find((budget) => budget.id === wanted) ?? budgets[0] ?? null
}
