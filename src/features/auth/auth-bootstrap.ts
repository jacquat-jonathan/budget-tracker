import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js'

import {
  dropParkedLink,
  parkLink,
  takeAuthRedirect,
  type AuthLinkError,
} from '@/features/auth/auth-redirect'
import { pruneRecovery, startRecovery } from '@/features/auth/recovery'
import { sessionKey } from '@/features/auth/session-identity'
import { supabase } from '@/lib/supabase'

/** Link error codes produced here, besides Supabase's own (e.g. "otp_expired"). */
export const LINK_INVALID = 'invalid_link'
export const LINK_NETWORK = 'network'

export interface AuthBootstrap {
  session: Session | null
  /**
   * Outcome of the email link this page load landed with, when it did not sign anyone in:
   * dead (expired, used, invalid) or undecided (code "network"; reloading retries). Kept
   * whether or not another session exists (invariant B).
   */
  linkError: AuthLinkError | null
  /**
   * A valid email link signed in a different user than the one who was signed in: the
   * browser now belongs to the link's account, and the user must be told (R-AUTH-026).
   */
  accountSwitch: AccountSwitch | null
}

export interface AccountSwitch {
  /** Email of the account that was signed in before the link, when known. */
  from: string | null
  /** Email of the account the link signed in. */
  to: string | null
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
  const before = await currentSession()
  const beforeKey = sessionKey(before)

  if (redirect?.tokens) {
    // Parked tokens from an earlier load are retried only if nobody signed in or out since
    // they were parked (C). Otherwise they are dropped without a word: the attempt is over.
    if (
      redirect.fromParking &&
      redirect.sessionKeyAtPark !== undefined &&
      redirect.sessionKeyAtPark !== beforeKey
    ) {
      dropParkedLink()
      return { session: before, linkError: null, accountSwitch: null }
    }

    let failure: unknown
    try {
      const { data, error } = await supabase.auth.setSession(redirect.tokens)
      if (!error && data.session) {
        dropParkedLink()
        // This tab established the session: the recovery flag now belongs to it or to nobody.
        if (redirect.type === 'recovery') startRecovery(data.session)
        else pruneRecovery(data.session)
        const switched = before !== null && before.user.id !== data.session.user.id
        const accountSwitch = switched
          ? { from: before.user.email ?? null, to: data.session.user.email ?? null }
          : null
        return { session: data.session, linkError: null, accountSwitch }
      }
      failure = error
    } catch (error) {
      failure = error
    }

    // The link did not sign anyone in. Whatever session exists is untouched and is *not*
    // in recovery because of this link; the outcome is reported regardless (B).
    const transient = isTransient(failure)
    const session = await currentSession()
    if (transient) parkLink(redirect, sessionKey(session))
    else dropParkedLink()
    return {
      session,
      linkError: { code: transient ? LINK_NETWORK : LINK_INVALID },
      accountSwitch: null,
    }
  }

  // A leftover recovery flag needs no clean-up here: it is inert unless it names the
  // current session (see recovery.ts). Pruning it from a tab that is merely starting could
  // race with another tab that is entering recovery right now.
  return { session: before, linkError: redirect?.error ?? null, accountSwitch: null }
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
