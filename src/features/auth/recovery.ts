import type { Session } from '@supabase/supabase-js'

import { sessionKey } from '@/features/auth/session-identity'

/**
 * Recovery mode: a password-recovery link signed a user in, and they must choose a new
 * password before using the app.
 *
 * The flag names the user and the exact sign-in (session key) that the recovery link
 * created, and recovery mode is active only while *that* session is the current one
 * (invariant A). So it never applies to another user, nor to the same user after a fresh
 * sign-in with their password (invariant D), and a leftover flag is inert even before it is
 * cleaned up (invariant C). It is kept in localStorage, like the Supabase session, so every
 * tab sharing the session sees it; tabs learn of changes through the `storage` event.
 */
export const RECOVERY_KEY = 'budget-tracker-password-recovery'

interface RecoveryFlag {
  userId: string
  sessionKey: string
}

function readFlag(): RecoveryFlag | null {
  try {
    const raw = localStorage.getItem(RECOVERY_KEY)
    if (!raw) return null
    const flag = JSON.parse(raw) as Partial<RecoveryFlag>
    return typeof flag.userId === 'string' && typeof flag.sessionKey === 'string'
      ? { userId: flag.userId, sessionKey: flag.sessionKey }
      : null
  } catch {
    return null
  }
}

/** Enter recovery mode for this session (the one a recovery link just established). */
export function startRecovery(session: Session): void {
  const key = sessionKey(session)
  if (!key) return
  try {
    const flag: RecoveryFlag = { userId: session.user.id, sessionKey: key }
    localStorage.setItem(RECOVERY_KEY, JSON.stringify(flag))
  } catch {
    // Storage blocked: recovery cannot be tracked, and the form is not forced.
  }
}

/** Leave recovery mode: password saved, signed out, or a password sign-in. */
export function endRecovery(): void {
  try {
    localStorage.removeItem(RECOVERY_KEY)
  } catch {
    // Nothing stored.
  }
}

/** Recovery mode is active for exactly this session. */
// R-AUTH-016 R-AUTH-023: only for the exact sign-in the recovery link created.
export function isRecoveryFor(session: Session | null | undefined): boolean {
  const flag = readFlag()
  return (
    flag !== null &&
    session != null &&
    flag.userId === session.user.id &&
    flag.sessionKey === sessionKey(session)
  )
}

/** Drop a flag that does not belong to the current session (C: one user, one attempt). */
export function pruneRecovery(session: Session | null | undefined): void {
  if (readFlag() !== null && !isRecoveryFor(session)) endRecovery()
}
