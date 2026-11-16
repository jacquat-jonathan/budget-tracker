import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { useAuth } from '@/features/auth/auth-context'
import { budgetKeys } from '@/features/budgets/budget-keys'
import { useEnsurePeriods, type MyBudget } from '@/features/budgets/budget-queries'
import { BudgetsContext, type BudgetsContextValue } from '@/features/budgets/current-budget-context'
import {
  pickCurrentBudget,
  readStoredBudget,
  storeBudget,
} from '@/features/budgets/current-budget-storage'
import { isNotFoundError } from '@/lib/db-errors'

interface CurrentBudgetProviderProps {
  budgets: MyBudget[]
  children: ReactNode
}

/** Provides my budgets and "the budget I am working in", remembered per user. */
export function CurrentBudgetProvider({ budgets, children }: CurrentBudgetProviderProps) {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const queryClient = useQueryClient()
  // Keyed by user: another user signing in on this tab starts from their own choice.
  const [choice, setChoice] = useState(() => ({ userId, budgetId: readStoredBudget(userId) }))
  const wanted = choice.userId === userId ? choice.budgetId : readStoredBudget(userId)
  const current = pickCurrentBudget(budgets, wanted)

  const selectBudget = useCallback(
    (budgetId: string) => {
      storeBudget(userId, budgetId)
      setChoice({ userId, budgetId })
    },
    [userId],
  )

  // R-BUDGET-051: the budget shown is the one remembered, also when it was a fallback, so
  // a rename by someone else (which changes the order by name) never moves me elsewhere.
  const currentId = current?.id
  useEffect(() => {
    if (currentId && currentId !== wanted) selectBudget(currentId)
  }, [currentId, wanted, selectBudget])

  useEnsurePeriodsFor(current?.id)

  // A budget that was removed elsewhere makes every query about it fail with "not found".
  useEffect(() => {
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'error') return
      if (isNotFoundError(event.action.error)) {
        void queryClient.invalidateQueries({ queryKey: budgetKeys.list })
      }
    })
  }, [queryClient])

  const value = useMemo<BudgetsContextValue>(
    () => ({ budgets, current, selectBudget }),
    [budgets, current, selectBudget],
  )

  return <BudgetsContext.Provider value={value}>{children}</BudgetsContext.Provider>
}

/** R-PERIOD-050: make sure periods exist up to today when a budget is opened. */
function useEnsurePeriodsFor(budgetId: string | undefined) {
  // Period-dependent reads key themselves on this query's runs (usePeriodDependentQuery),
  // so they are read again whenever it has run.
  useEnsurePeriods(budgetId)
}
