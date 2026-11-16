/** In-app paths, relative to the router basename (the build-time base path). */
export const paths = {
  dashboard: '/',
  budget: '/budget',
  transactions: '/transactions',
  subscriptions: '/subscriptions',
  debts: '/debts',
  periods: '/periods',
  moneyFlow: '/money-flow',
  income: '/income',
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
}): string {
  const params = new URLSearchParams({ period: filter.period ?? 'all' })
  if (filter.subscription) params.set('subscription', filter.subscription)
  if (filter.debt) params.set('debt', filter.debt)
  if (filter.awaiting) params.set('awaiting', '1')
  return `${paths.transactions}?${params.toString()}`
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
