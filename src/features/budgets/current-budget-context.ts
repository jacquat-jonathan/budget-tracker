import { createContext, useContext } from 'react'

import type { MyBudget } from '@/features/budgets/budget-queries'

/** The budget I was working in when it stopped being mine (R-BUDGET-055). */
export interface LostBudget {
  id: string
  name: string
  /** The budget shown instead; null when none is left. */
  nowIn: string | null
}

export interface BudgetsContextValue {
  /** My budgets; empty when I have none. */
  budgets: MyBudget[]
  /** The budget I am working in, or null when I have none. */
  current: MyBudget | null
  /** Switch to another of my budgets; remembered for this user across reloads. */
  selectBudget: (budgetId: string) => void
  /** The budget I lost access to while working in it, until dismissed. */
  lostBudget: LostBudget | null
  dismissLostBudget: () => void
  /** I am deleting or leaving this budget myself: its disappearance needs no notice. */
  expectBudgetGone: (budgetId: string) => void
}

export const BudgetsContext = createContext<BudgetsContextValue | null>(null)

/** My budgets and the current one; works whether or not I have a budget. */
export function useBudgets(): BudgetsContextValue {
  const context = useContext(BudgetsContext)
  if (!context) throw new Error('useBudgets must be used within a CurrentBudgetProvider.')
  return context
}

export interface CurrentBudget {
  budget: MyBudget
  budgetId: string
  isOwner: boolean
}

/** The budget I am working in. Only for pages behind RequireBudget. */
export function useCurrentBudget(): CurrentBudget {
  const { current } = useBudgets()
  if (!current) throw new Error('useCurrentBudget needs a current budget (RequireBudget).')
  return { budget: current, budgetId: current.id, isOwner: current.is_owner === true }
}
