import { createContext, useContext } from 'react'

import { useCurrentPeriod } from '@/features/budgets/budget-queries'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'

/** True while the budget is being caught up (CatchUp): its reads are on their way. */
export const CatchingUpContext = createContext(false)

export function useCatchingUp(): boolean {
  return useContext(CatchingUpContext)
}

/**
 * Whether the budget has ended, from the budget's own end only: it has an end date, it is
 * caught up, and the database then gives no current period. A missing current period alone
 * (a catch-up under way, a read in flight) never means "ended": until all three hold, a form
 * keeps its state and a page waits.
 */
// R-BUDGET-280: "ended" comes from the budget's end, never from a missing current period.
export function useBudgetEnded(budgetId: string): boolean {
  const { budget } = useCurrentBudget()
  const catching = useCatchingUp()
  const current = useCurrentPeriod(budgetId)
  return (
    budget.end_date !== null &&
    budget.caught_up !== false &&
    !catching &&
    current.isSuccess &&
    current.data === null
  )
}
