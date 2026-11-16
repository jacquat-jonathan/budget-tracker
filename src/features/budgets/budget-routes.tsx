import { useQueryClient } from '@tanstack/react-query'
import { HourglassIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Outlet } from 'react-router'

import { paths } from '@/app/paths'
import { FullPageSpinner } from '@/components/full-page-spinner'
import { ErrorState } from '@/components/states'
import { CatchingUpContext } from '@/features/budgets/budget-ended'
import { budgetKeys } from '@/features/budgets/budget-keys'
import { useEnsurePeriods, useMyBudgets } from '@/features/budgets/budget-queries'
import { useBudgets } from '@/features/budgets/current-budget-context'
import { CurrentBudgetProvider } from '@/features/budgets/current-budget-provider'
import { dbErrorCode } from '@/lib/db-errors'

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
 * After a very long absence (my_budgets.caught_up false), or whenever a read or a write
 * answers catching_up (the budget is more than one step behind: a tab left open across a long
 * absence), the budget is caught up: "Catching up on the time since your last visit…" covers
 * the page, with no figure, while ensure_periods is called until it answers 0; then every
 * read of the budget is fetched again. The page stays mounted underneath, so a form whose
 * save was refused keeps what was typed and says the save can be repeated. A failure says
 * so, with a retry. No progress bar: the database does not say how far it has to go (D-231).
 */
// R-PERIOD-150 R-PERIOD-190: caught up first, in words; refused calls read or sent again after.
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
  // Set when a call answered catching_up: the ensure_periods run that must follow it.
  const [behindSince, setBehindSince] = useState<number | null>(null)
  useEffect(() => {
    const seen = (error: unknown) => {
      if (dbErrorCode(error) === 'catching_up') setBehindSince(Date.now())
    }
    const queries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') seen(event.action.error)
    })
    const mutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') seen(event.action.error)
    })
    return () => {
      queries()
      mutations()
    }
  }, [queryClient])
  const { refetch } = ensured
  useEffect(() => {
    if (behindSince !== null) void refetch()
  }, [behindSince, refetch])
  const settled = ensured.isSuccess && !ensured.isFetching
  // The first catch-up is done once ensure_periods has answered; a refused call's, once it has
  // answered again after the refusal.
  const initialDone = caughtUp || ensured.isSuccess
  const behindDone = behindSince === null || (settled && ensured.dataUpdatedAt >= behindSince)
  useEffect(() => {
    if (!caughtUp && settled) void queryClient.invalidateQueries({ queryKey: budgetKeys.list })
  }, [caughtUp, settled, queryClient])
  useEffect(() => {
    if (behindSince === null || !behindDone) return
    // Everything of the budget is read again, its catch-up excepted (it just ran).
    void queryClient.invalidateQueries({ queryKey: budgetKeys.list })
    void queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'budget' &&
        query.queryKey[1] === budgetId &&
        query.queryKey[2] !== 'ensure-periods',
    })
  }, [behindSince, behindDone, budgetId, queryClient])
  const catching = !initialDone || !behindDone
  // A short catch-up (the first visit after a pay day) shows nothing different: the screen
  // appears only once it has lasted a moment.
  const shown = useLasted(catching || ensured.isError, CATCH_UP_SHOWN_AFTER_MS)
  return (
    <>
      <div className="contents" inert={catching || undefined} aria-hidden={catching || undefined}>
        <CatchingUpContext value={catching}>{children}</CatchingUpContext>
      </div>
      {shown && (
        <main
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background p-6 text-center"
          data-testid="catching-up"
        >
          {ensured.isError ? (
            <ErrorState error={ensured.error} onRetry={() => void ensured.refetch()} />
          ) : (
            <>
              <HourglassIcon className="size-8 animate-pulse text-muted-foreground" aria-hidden />
              <h1 className="text-lg font-medium" role="status">
                {t('catchUp.title')}
              </h1>
              <p className="max-w-sm text-sm text-muted-foreground">{t('catchUp.help')}</p>
            </>
          )}
        </main>
      )}
    </>
  )
}

/** How long a catch-up runs before its screen replaces the page. */
const CATCH_UP_SHOWN_AFTER_MS = 700

/** True once `on` has stayed true for `ms`; false again as soon as it is false. */
function useLasted(on: boolean, ms: number) {
  const [lasted, setLasted] = useState(false)
  useEffect(() => {
    if (!on) return
    const timer = window.setTimeout(() => setLasted(true), ms)
    return () => {
      window.clearTimeout(timer)
      setLasted(false)
    }
  }, [on, ms])
  return on && lasted
}

/** The first-run setup is only for users without a budget. */
export function RequireNoBudget() {
  const { current } = useBudgets()
  if (current) return <Navigate to={paths.dashboard} replace />
  return <Outlet />
}
