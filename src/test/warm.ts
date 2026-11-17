import { loadStrings } from '@/locales/lazy-strings'

/**
 * The pages are lazy chunks, transformed and loaded the first time a test opens them: under a
 * busy machine that alone took a file's first test from about 1 s to 4 or 5 s, against the 5 s
 * limit. A file calls this in its beforeAll (hook limit 10 s) so the cost is paid once, outside
 * any test's own time. It loads the page modules and their strings; it renders nothing.
 */
const PAGES = {
  dashboard: () => import('@/features/dashboard/dashboard-page'),
  budget: () => import('@/features/budget/budget-page'),
  transactions: () => import('@/features/transactions/transactions-page'),
  income: () => import('@/features/income/income-page'),
  accounts: () => import('@/features/accounts/accounts-page'),
  transfers: () => import('@/features/transfers/transfers-page'),
  moneyFlow: () => import('@/features/money-flow/money-flow-page'),
  subscriptions: () => import('@/features/subscriptions/subscriptions-page'),
  debts: () => import('@/features/debts/debts-page'),
  debtDetail: () => import('@/features/debts/debt-detail-page'),
  compare: () => import('@/features/compare/compare-page'),
  periods: () => import('@/features/periods/periods-page'),
  settings: () => import('@/features/settings/settings-page'),
  welcome: () => import('@/features/budgets/pages/welcome-page'),
  newBudget: () => import('@/features/budgets/pages/new-budget-page'),
} as const

export type WarmPage = keyof typeof PAGES

export async function warmPages(...pages: WarmPage[]): Promise<void> {
  await Promise.all([...pages.map((page) => PAGES[page]()), loadStrings()])
}
