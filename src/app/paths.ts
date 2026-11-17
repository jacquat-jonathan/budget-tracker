/** In-app paths, relative to the router basename (the build-time base path). */
export const paths = {
  dashboard: '/',
  budget: '/budget',
  transactions: '/transactions',
  subscriptions: '/subscriptions',
  debts: '/debts',
  periods: '/periods',
  compare: '/compare',
  moneyFlow: '/money-flow',
  accounts: '/accounts',
  transfers: '/transfers',
  income: '/income',
  import: '/import',
  settings: '/settings',
  newBudget: '/budgets/new',
  /** First-run setup for a signed-in user without a budget. */
  welcome: '/welcome',
  signIn: '/sign-in',
  signUp: '/sign-up',
  forgotPassword: '/forgot-password',
  resendConfirmation: '/resend-confirmation',
  resetPassword: '/reset-password',
} as const

/** One debt's page: its evolution, history and actions. */
export const debtRoute = `${paths.debts}/:debtId`
export function debtPath(debtId: string): string {
  return `${paths.debts}/${encodeURIComponent(debtId)}`
}

/**
 * The transactions of one subscription or debt, or the charges awaiting confirmation: a link
 * to the list with that filter in the address, over all periods unless one is given.
 */
export function transactionsOf(filter: {
  subscription?: string
  debt?: string
  awaiting?: boolean
  period?: string
  /** Only the imported transactions to review (step 6). */
  review?: boolean
  /** The transactions of one import batch. */
  batch?: string
  /** The transactions of one planned transfer (D-525). */
  transfer?: string
}): string {
  const params = new URLSearchParams({ period: filter.period ?? 'all' })
  if (filter.subscription) params.set('subscription', filter.subscription)
  if (filter.debt) params.set('debt', filter.debt)
  if (filter.awaiting) params.set('awaiting', '1')
  if (filter.review) params.set('review', '1')
  if (filter.batch) params.set('batch', filter.batch)
  if (filter.transfer) params.set('transfer', filter.transfer)
  return `${paths.transactions}?${params.toString()}`
}

/** The transfers page on one period's checklist (the current one when absent). */
export function transfersOf(periodId?: string | null): string {
  return periodId ? `${paths.transfers}?period=${encodeURIComponent(periodId)}` : paths.transfers
}

/** The money flow of one period (the current one when absent). */
export function moneyFlowOf(periodId?: string | null): string {
  return periodId ? `${paths.moneyFlow}?period=${encodeURIComponent(periodId)}` : paths.moneyFlow
}

/** Location state carried to the sign-in page so the user lands where they wanted to go. */
export interface RedirectState {
  from?: string
}

/** The path to return to after sign-in, read from location state; never an auth page. */
// R-AUTH-003: only an in-app path, never an auth page or another site.
export function redirectTarget(state: unknown): string {
  const from = (state as RedirectState | null)?.from
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) {
    return paths.dashboard
  }
  const authPaths: string[] = [
    paths.signIn,
    paths.signUp,
    paths.forgotPassword,
    paths.resendConfirmation,
    paths.resetPassword,
  ]
  const pathname = from.split(/[?#]/)[0] ?? ''
  return authPaths.includes(pathname) ? paths.dashboard : from
}
