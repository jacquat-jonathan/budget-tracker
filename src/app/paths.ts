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
  signIn: '/sign-in',
  signUp: '/sign-up',
  forgotPassword: '/forgot-password',
  resendConfirmation: '/resend-confirmation',
  resetPassword: '/reset-password',
} as const

/** Location state carried to the sign-in page so the user lands where they wanted to go. */
export interface RedirectState {
  from?: string
}

/** The path to return to after sign-in, read from location state; never an auth page. */
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
