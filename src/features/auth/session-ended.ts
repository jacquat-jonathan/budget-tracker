/**
 * Telling a session that ended by itself (expired, revoked, a stored session that no longer
 * works) from one the user ended: signing out in this browser, in any tab, is remembered for a
 * minute, and a session that disappears within that minute is not reported as ended.
 */
const SIGNED_OUT_KEY = 'budget-tracker-signed-out-at'
const WINDOW_MS = 60_000

/** The user asked to sign out (this tab); other tabs see it through storage. */
export function markSignOutRequested(): void {
  try {
    window.localStorage.setItem(SIGNED_OUT_KEY, String(Date.now()))
  } catch {
    // Storage blocked: an ended session is then also reported after a sign-out, harmlessly.
  }
}

export function wasSignOutRequested(): boolean {
  try {
    const at = Number(window.localStorage.getItem(SIGNED_OUT_KEY))
    return Number.isFinite(at) && at > 0 && Date.now() - at < WINDOW_MS
  } catch {
    return false
  }
}

/** Supabase's stored session (sb-<project>-auth-token) is in this browser's storage. */
export function hasStoredSession(): boolean {
  try {
    return Object.keys(window.localStorage).some((key) => /^sb-.+-auth-token$/.test(key))
  } catch {
    return false
  }
}
