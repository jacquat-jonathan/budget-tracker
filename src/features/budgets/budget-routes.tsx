import { Navigate, Outlet } from 'react-router'

import { paths } from '@/app/paths'
import { FullPageSpinner } from '@/components/full-page-spinner'
import { ErrorState } from '@/components/states'
import { useMyBudgets } from '@/features/budgets/budget-queries'
import { useBudgets } from '@/features/budgets/current-budget-context'
import { CurrentBudgetProvider } from '@/features/budgets/current-budget-provider'

/** Loads my budgets once for every signed-in page and provides the current budget. */
export function BudgetsRoute() {
  const budgets = useMyBudgets()

  if (budgets.isPending) return <FullPageSpinner />
  if (budgets.isError) {
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <ErrorState error={budgets.error} onRetry={() => void budgets.refetch()} />
      </main>
    )
  }
  return (
    <CurrentBudgetProvider budgets={budgets.data}>
      <Outlet />
    </CurrentBudgetProvider>
  )
}

/** Pages about a budget: without one, the user is sent to the first-run setup. */
export function RequireBudget() {
  const { current } = useBudgets()
  if (!current) return <Navigate to={paths.welcome} replace />
  return <Outlet />
}

/** The first-run setup is only for users without a budget. */
export function RequireNoBudget() {
  const { current } = useBudgets()
  if (current) return <Navigate to={paths.dashboard} replace />
  return <Outlet />
}
