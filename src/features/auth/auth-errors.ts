import { isAuthError } from '@supabase/supabase-js'

import { isOffline, OfflineError } from '@/lib/online'

export type AuthErrorKey =
  | 'auth.errors.invalidCredentials'
  | 'auth.errors.emailNotConfirmed'
  | 'auth.errors.userAlreadyExists'
  | 'auth.errors.weakPassword'
  | 'auth.errors.samePassword'
  | 'auth.errors.rateLimited'
  | 'auth.errors.network'
  | 'auth.errors.offline'
  | 'auth.errors.generic'

const BY_CODE: Record<string, AuthErrorKey> = {
  invalid_credentials: 'auth.errors.invalidCredentials',
  email_not_confirmed: 'auth.errors.emailNotConfirmed',
  user_already_exists: 'auth.errors.userAlreadyExists',
  email_exists: 'auth.errors.userAlreadyExists',
  weak_password: 'auth.errors.weakPassword',
  same_password: 'auth.errors.samePassword',
  over_request_rate_limit: 'auth.errors.rateLimited',
  over_email_send_rate_limit: 'auth.errors.rateLimited',
}

/** Map an error returned by Supabase Auth to a translation key. */
// R-AUTH-011: never the raw error.
export function authErrorKey(error: unknown): AuthErrorKey {
  // Offline, said as such: nothing was sent.
  if (error instanceof OfflineError) return 'auth.errors.offline'
  if (isAuthError(error)) {
    if (error.code && error.code in BY_CODE) return BY_CODE[error.code] ?? 'auth.errors.generic'
    if (error.status === 429) return 'auth.errors.rateLimited'
    if (error.name === 'AuthRetryableFetchError')
      return isOffline() ? 'auth.errors.offline' : 'auth.errors.network'
  }
  if (error instanceof TypeError) return isOffline() ? 'auth.errors.offline' : 'auth.errors.network'
  return 'auth.errors.generic'
}
