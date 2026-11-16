import { useQueryClient } from '@tanstack/react-query'
import { HourglassIcon } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Outlet } from 'react-router'

import { paths } from '@/app/paths'
import { FullPageSpinner } from '@/components/full-page-spinner'
import { ErrorState } from '@/components/states'
import { budgetKeys } from '@/features/budgets/budget-keys'
import { useEnsurePeriods, useMyBudgets } from '@/features/budgets/budget-queries'
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
    <CurrentBudgetProvider budgets={budgets.data} listUpdatedAt={budgets.dataUpdatedAt}>
      <Outlet />
    </CurrentBudgetProvider>
  )
}

/** Pages about a budget: without one, the user is sent to the first-run setup. */
// R-BUDGET-050: no budget, first-run setup.
export function RequireBudget() {
  const { current } = useBudgets()
  if (!current) return <Navigate to={paths.welcome} replace />
  return (
    <CatchUp budgetId={current.id} caughtUp={current.caught_up !== false}>
      <Outlet />
    </CatchUp>
  )
}

/**
 * After a very long absence (my_budgets.caught_up false) the budget is caught up before any
 * page shows: "Catching up on the time since your last visit…", no figure, until
 * ensure_periods answers 0; then the pages load. A failure says so, with a retry. No progress
 * bar: the database does not say how far it has to go (D-230).
 */
// R-PERIOD-150: a long absence is caught up first, in words, with no figure shown meanwhile.
function CatchUp({
  budgetId,
  caughtUp,
  children,
}: {
  budgetId: string
  caughtUp: boolean
  children: ReactNode
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const ensured = useEnsurePeriods(budgetId)
  const done = ensured.isSuccess && !ensured.isFetching
  // Once caught up, the list is read again: caught_up becomes true.
  useEffect(() => {
    if (!caughtUp && done) void queryClient.invalidateQueries({ queryKey: budgetKeys.list })
  }, [caughtUp, done, queryClient])
  if (caughtUp || done) return children
  if (ensured.isError) {
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <ErrorState error={ensured.error} onRetry={() => void ensured.refetch()} />
      </main>
    )
  }
  return (
    <main
      className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center"
      data-testid="catching-up"
    >
      <HourglassIcon className="size-8 animate-pulse text-muted-foreground" aria-hidden />
      <h1 className="text-lg font-medium" role="status">
        {t('catchUp.title')}
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">{t('catchUp.help')}</p>
    </main>
  )
}

/** The first-run setup is only for users without a budget. */
export function RequireNoBudget() {
  const { current } = useBudgets()
  if (current) return <Navigate to={paths.dashboard} replace />
  return <Outlet />
}
