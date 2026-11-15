import { lazy, Suspense } from 'react'
import { Outlet, type RouteObject } from 'react-router'

import type { NavKey, PageHandle } from '@/app/navigation'
import { paths } from '@/app/paths'
import { ProtectedRoute, PublicOnlyRoute } from '@/app/route-guards'
import { FullPageSpinner } from '@/components/full-page-spinner'
import { AppLayout } from '@/components/layout/app-layout'
import { RouteError } from '@/components/route-error'
import { BudgetsRoute, RequireBudget, RequireNoBudget } from '@/features/budgets/budget-routes'

// Every page is its own chunk, loaded on first visit.
const SignInPage = lazy(() =>
  import('@/features/auth/pages/sign-in-page').then((m) => ({ default: m.SignInPage })),
)
const SignUpPage = lazy(() =>
  import('@/features/auth/pages/sign-up-page').then((m) => ({ default: m.SignUpPage })),
)
const ForgotPasswordPage = lazy(() =>
  import('@/features/auth/pages/forgot-password-page').then((m) => ({
    default: m.ForgotPasswordPage,
  })),
)
const ResendConfirmationPage = lazy(() =>
  import('@/features/auth/pages/resend-confirmation-page').then((m) => ({
    default: m.ResendConfirmationPage,
  })),
)
const ResetPasswordPage = lazy(() =>
  import('@/features/auth/pages/reset-password-page').then((m) => ({
    default: m.ResetPasswordPage,
  })),
)
const NotFoundPage = lazy(() =>
  import('@/features/not-found/not-found-page').then((m) => ({ default: m.NotFoundPage })),
)
const DashboardPage = lazy(() =>
  import('@/features/dashboard/dashboard-page').then((m) => ({ default: m.DashboardPage })),
)
const BudgetPage = lazy(() =>
  import('@/features/budget/budget-page').then((m) => ({ default: m.BudgetPage })),
)
const TransactionsPage = lazy(() =>
  import('@/features/transactions/transactions-page').then((m) => ({
    default: m.TransactionsPage,
  })),
)
const SubscriptionsPage = lazy(() =>
  import('@/features/subscriptions/subscriptions-page').then((m) => ({
    default: m.SubscriptionsPage,
  })),
)
const DebtsPage = lazy(() =>
  import('@/features/debts/debts-page').then((m) => ({ default: m.DebtsPage })),
)
const PeriodsPage = lazy(() =>
  import('@/features/periods/periods-page').then((m) => ({ default: m.PeriodsPage })),
)
const MoneyFlowPage = lazy(() =>
  import('@/features/money-flow/money-flow-page').then((m) => ({ default: m.MoneyFlowPage })),
)
const IncomePage = lazy(() =>
  import('@/features/income/income-page').then((m) => ({ default: m.IncomePage })),
)
const WelcomePage = lazy(() =>
  import('@/features/budgets/pages/welcome-page').then((m) => ({ default: m.WelcomePage })),
)
const NewBudgetPage = lazy(() =>
  import('@/features/budgets/pages/new-budget-page').then((m) => ({ default: m.NewBudgetPage })),
)
const SettingsPage = lazy(() =>
  import('@/features/settings/settings-page').then((m) => ({ default: m.SettingsPage })),
)

function SuspenseOutlet() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Outlet />
    </Suspense>
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
                      { path: paths.periods, element: <PeriodsPage />, ...page('periods') },
                      {
                        path: paths.moneyFlow,
                        element: <MoneyFlowPage />,
                        ...page('moneyFlow'),
                      },
                      { path: paths.income, element: <IncomePage />, ...page('income') },
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
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
