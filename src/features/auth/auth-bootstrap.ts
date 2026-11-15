import type { Session } from '@supabase/supabase-js'

import { takeAuthRedirect, type AuthLinkError } from '@/features/auth/auth-redirect'
import { supabase } from '@/lib/supabase'

/**
 * Password recovery in progress: set when a recovery link signs the user in, cleared once a
 * new password is saved or the user signs out. Kept per tab (sessionStorage) and tied to the
 * user id, so a reload does not skip the new-password form.
 */
const RECOVERY_KEY = 'budget-tracker-password-recovery'

export function markRecovery(userId: string): void {
  try {
    sessionStorage.setItem(RECOVERY_KEY, userId)
  } catch {
    // Without storage the flag lives in React state only.
  }
}

export function clearRecovery(): void {
  try {
    sessionStorage.removeItem(RECOVERY_KEY)
  } catch {
    // Nothing stored.
  }
}

export function isRecoveryFor(userId: string | undefined): boolean {
  if (!userId) return false
  try {
    return sessionStorage.getItem(RECOVERY_KEY) === userId
  } catch {
    return false
  }
}

export interface AuthBootstrap {
  session: Session | null
  /** The user arrived through a password-recovery link and must choose a new password. */
  recovery: boolean
  /** The email link the user arrived through was expired, already used or invalid. */
  linkError: AuthLinkError | null
}

async function run(): Promise<AuthBootstrap> {
  const redirect = takeAuthRedirect()

  if (redirect?.tokens) {
    const { data, error } = await supabase.auth.setSession(redirect.tokens)
    if (!error && data.session) {
      const recovery = redirect.type === 'recovery'
      if (recovery) markRecovery(data.session.user.id)
      return { session: data.session, recovery, linkError: null }
    }
    // Tokens rejected: keep whatever session the tab already had and report a dead link.
    const { data: current } = await supabase.auth.getSession()
    return {
      session: current.session,
      recovery: isRecoveryFor(current.session?.user.id),
      linkError: { code: 'invalid_link' },
    }
  }

  const { data } = await supabase.auth.getSession()
  return {
    session: data.session,
    recovery: isRecoveryFor(data.session?.user.id),
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
