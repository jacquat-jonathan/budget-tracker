import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js'

import {
  settleAuthRedirect,
  takeAuthRedirect,
  type AuthLinkError,
} from '@/features/auth/auth-redirect'
import { supabase } from '@/lib/supabase'

/**
 * Password recovery in progress: set when a recovery link signs the user in, cleared once a
 * new password is saved or the user signs out. Stored in localStorage, like the Supabase
 * session itself, so every tab of the browser sharing that session is held on the
 * new-password form (other tabs learn of changes through the `storage` event), and tied to
 * the user id so it never applies to another account.
 */
export const RECOVERY_KEY = 'budget-tracker-password-recovery'

export function markRecovery(userId: string): void {
  try {
    localStorage.setItem(RECOVERY_KEY, userId)
  } catch {
    // Without storage the flag lives in this tab's React state only.
  }
}

export function clearRecovery(): void {
  try {
    localStorage.removeItem(RECOVERY_KEY)
  } catch {
    // Nothing stored.
  }
}

export function isRecoveryFor(userId: string | undefined): boolean {
  if (!userId) return false
  try {
    return localStorage.getItem(RECOVERY_KEY) === userId
  } catch {
    return false
  }
}

/** Link error codes produced here, besides Supabase's own (e.g. "otp_expired"). */
export const LINK_INVALID = 'invalid_link'
export const LINK_NETWORK = 'network'

export interface AuthBootstrap {
  session: Session | null
  /** The user arrived through a password-recovery link and must choose a new password. */
  recovery: boolean
  /**
   * The email link the user arrived through was expired, already used or invalid, or could
   * not be checked because the server was unreachable (code "network"; reloading retries).
   */
  linkError: AuthLinkError | null
}

function isTransient(error: unknown): boolean {
  return isAuthRetryableFetchError(error) || error instanceof TypeError
}

async function currentSession(): Promise<Session | null> {
  try {
    const { data } = await supabase.auth.getSession()
    return data.session
  } catch {
    return null
  }
}

async function run(): Promise<AuthBootstrap> {
  const redirect = takeAuthRedirect()

  if (redirect?.tokens) {
    let failure: unknown
    try {
      const { data, error } = await supabase.auth.setSession(redirect.tokens)
      if (!error && data.session) {
        settleAuthRedirect()
        const recovery = redirect.type === 'recovery'
        if (recovery) markRecovery(data.session.user.id)
        return { session: data.session, recovery, linkError: null }
      }
      failure = error
    } catch (error) {
      failure = error
    }

    // A network failure says nothing about the link: keep its tokens so a reload retries.
    // Anything else (rejected or malformed token) is a dead link.
    const transient = isTransient(failure)
    if (!transient) settleAuthRedirect()
    const session = await currentSession()
    return {
      session,
      recovery: isRecoveryFor(session?.user.id),
      linkError: { code: transient ? LINK_NETWORK : LINK_INVALID },
    }
  }

  const session = await currentSession()
  return {
    session,
    recovery: isRecoveryFor(session?.user.id),
    linkError: redirect?.error ?? null,
  }
}

let bootstrap: Promise<AuthBootstrap> | null = null

/**
 * Restore the session at start-up, from a captured email link or from storage. Runs once
 * per page load (also under StrictMode's double effects).
 */
export function bootstrapAuth(): Promise<AuthBootstrap> {
  bootstrap ??= run()
  return bootstrap
}

/** Tests only: forget the previous bootstrap. */
export function resetAuthBootstrap(): void {
  bootstrap = null
}
