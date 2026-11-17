import { Suspense } from 'react'
import { Outlet, useLocation, type RouteObject } from 'react-router'

import type { NavKey, PageHandle } from '@/app/navigation'
import { lazyPage } from '@/app/lazy-page'
import { debtRoute, paths } from '@/app/paths'
import { ProtectedRoute, PublicOnlyRoute } from '@/app/route-guards'
import { FullPageSpinner } from '@/components/full-page-spinner'
import { AppLayout } from '@/components/layout/app-layout'
import { OfflineNotice } from '@/components/offline-notice'
import { PageLoadBoundary } from '@/components/page-load-boundary'
import { RouteError } from '@/components/route-error'
import { BudgetsRoute, RequireBudget, RequireNoBudget } from '@/features/budgets/budget-routes'
import { loadStrings } from '@/locales/lazy-strings'

/**
 * A budget page with the string groups the app's pages use (import, compare, step 4): both
 * loaded before it renders, so a key never shows while its chunk loads.
 */
function withStrings<T>(page: Promise<T>): Promise<T> {
  return Promise.all([page, loadStrings()]).then(([module]) => module)
}

// Every page is its own chunk, loaded on first visit.
const SignInPage = lazyPage(() =>
  import('@/features/auth/pages/sign-in-page').then((m) => ({ default: m.SignInPage })),
)
const SignUpPage = lazyPage(() =>
  import('@/features/auth/pages/sign-up-page').then((m) => ({ default: m.SignUpPage })),
)
const ForgotPasswordPage = lazyPage(() =>
  import('@/features/auth/pages/forgot-password-page').then((m) => ({
    default: m.ForgotPasswordPage,
  })),
)
const ResendConfirmationPage = lazyPage(() =>
  import('@/features/auth/pages/resend-confirmation-page').then((m) => ({
    default: m.ResendConfirmationPage,
  })),
)
const ResetPasswordPage = lazyPage(() =>
  import('@/features/auth/pages/reset-password-page').then((m) => ({
    default: m.ResetPasswordPage,
  })),
)
const NotFoundPage = lazyPage(() =>
  import('@/features/not-found/not-found-page').then((m) => ({ default: m.NotFoundPage })),
)
const DashboardPage = lazyPage(() =>
  withStrings(import('@/features/dashboard/dashboard-page')).then((m) => ({
    default: m.DashboardPage,
  })),
)
const BudgetPage = lazyPage(() =>
  withStrings(import('@/features/budget/budget-page')).then((m) => ({ default: m.BudgetPage })),
)
const TransactionsPage = lazyPage(() =>
  withStrings(import('@/features/transactions/transactions-page')).then((m) => ({
    default: m.TransactionsPage,
  })),
)
const SubscriptionsPage = lazyPage(() =>
  withStrings(import('@/features/subscriptions/subscriptions-page')).then((m) => ({
    default: m.SubscriptionsPage,
  })),
)
const DebtsPage = lazyPage(() =>
  withStrings(import('@/features/debts/debts-page')).then((m) => ({ default: m.DebtsPage })),
)
// The chart library (Recharts) is only in this page's chunk: the first load does not carry it.
const DebtDetailPage = lazyPage(() =>
  withStrings(import('@/features/debts/debt-detail-page')).then((m) => ({
    default: m.DebtDetailPage,
  })),
)
// Recharts stays in the Compare page's chunk, out of the first load.
const ComparePage = lazyPage(() =>
  withStrings(import('@/features/compare/compare-page')).then((m) => ({ default: m.ComparePage })),
)
const PeriodsPage = lazyPage(() =>
  withStrings(import('@/features/periods/periods-page')).then((m) => ({ default: m.PeriodsPage })),
)
const MoneyFlowPage = lazyPage(() =>
  withStrings(import('@/features/money-flow/money-flow-page')).then((m) => ({
    default: m.MoneyFlowPage,
  })),
)
const AccountsPage = lazyPage(() =>
  withStrings(import('@/features/accounts/accounts-page')).then((m) => ({
    default: m.AccountsPage,
  })),
)
const TransfersPage = lazyPage(() =>
  withStrings(import('@/features/transfers/transfers-page')).then((m) => ({
    default: m.TransfersPage,
  })),
)
const IncomePage = lazyPage(() =>
  withStrings(import('@/features/income/income-page')).then((m) => ({ default: m.IncomePage })),
)
// The import page; pdf.js, the statement parsers and the CSV code load from it on demand.
const ImportPage = lazyPage(() =>
  withStrings(import('@/features/import/import-page')).then((m) => ({ default: m.ImportPage })),
)
const WelcomePage = lazyPage(() =>
  import('@/features/budgets/pages/welcome-page').then((m) => ({ default: m.WelcomePage })),
)
const NewBudgetPage = lazyPage(() =>
  import('@/features/budgets/pages/new-budget-page').then((m) => ({ default: m.NewBudgetPage })),
)
const SettingsPage = lazyPage(() =>
  withStrings(import('@/features/settings/settings-page')).then((m) => ({
    default: m.SettingsPage,
  })),
)

function SuspenseOutlet() {
  const { pathname } = useLocation()
  return (
    <>
      <PageLoadBoundary key={pathname}>
        <Suspense fallback={<FullPageSpinner />}>
          <Outlet />
        </Suspense>
      </PageLoadBoundary>
      <OfflineNotice />
    </>
  )
}

const page = (nav: NavKey): { handle: PageHandle } => ({ handle: { nav } })

export const routes: RouteObject[] = [
  {
    errorElement: <RouteError />,
    element: <SuspenseOutlet />,
    children: [
      {
        element: <PublicOnlyRoute />,
        children: [
          { path: paths.signIn, element: <SignInPage /> },
          { path: paths.signUp, element: <SignUpPage /> },
          { path: paths.forgotPassword, element: <ForgotPasswordPage /> },
          { path: paths.resendConfirmation, element: <ResendConfirmationPage /> },
        ],
      },
      // Reached from the reset email with a recovery session, so it sits outside both guards.
      { path: paths.resetPassword, element: <ResetPasswordPage /> },
      {
        // R-APP-001: the app shell, for signed-in users.
        element: <ProtectedRoute />,
        children: [
          {
            // My budgets and the current one, for every signed-in page.
            element: <BudgetsRoute />,
            children: [
              {
                element: <RequireNoBudget />,
                children: [{ path: paths.welcome, element: <WelcomePage /> }],
              },
              {
                element: <RequireBudget />,
                children: [
                  {
                    element: <AppLayout />,
                    children: [
                      { index: true, element: <DashboardPage />, ...page('dashboard') },
                      { path: paths.budget, element: <BudgetPage />, ...page('budget') },
                      {
                        path: paths.transactions,
                        element: <TransactionsPage />,
                        ...page('transactions'),
                      },
                      {
                        path: paths.subscriptions,
                        element: <SubscriptionsPage />,
                        ...page('subscriptions'),
                      },
                      { path: paths.debts, element: <DebtsPage />, ...page('debts') },
                      { path: debtRoute, element: <DebtDetailPage />, ...page('debts') },
                      { path: paths.periods, element: <PeriodsPage />, ...page('periods') },
                      { path: paths.compare, element: <ComparePage />, ...page('compare') },
                      {
                        path: paths.moneyFlow,
                        element: <MoneyFlowPage />,
                        ...page('moneyFlow'),
                      },
                      { path: paths.income, element: <IncomePage />, ...page('income') },
                      { path: paths.accounts, element: <AccountsPage />, ...page('accounts') },
                      {
                        path: paths.transfers,
                        element: <TransfersPage />,
                        ...page('transfers'),
                      },
                      { path: paths.import, element: <ImportPage />, ...page('import') },
                      { path: paths.settings, element: <SettingsPage />, ...page('settings') },
                      {
                        path: paths.newBudget,
                        element: <NewBudgetPage />,
                        ...page('newBudget'),
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      // R-APP-002: any unknown path.
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
