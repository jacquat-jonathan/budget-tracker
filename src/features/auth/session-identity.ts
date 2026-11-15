import type { Session } from '@supabase/supabase-js'

/**
 * Identity of one sign-in. Supabase access tokens carry a `session_id` claim that stays the
 * same across token refreshes and changes with every new sign-in (password, email link,
 * another user). When a token has no such claim, the user id stands in.
 *
 * The payload is decoded without verifying the signature: it is used only to tell sessions
 * apart in this browser, never to grant access (the server checks every request).
 */
export function sessionKey(session: Session | null | undefined): string | null {
  if (!session) return null
  const sessionId = readClaim(session.access_token, 'session_id')
  return sessionId ? `session:${sessionId}` : `user:${session.user.id}`
}

function readClaim(token: string, claim: string): string | null {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='))
    const value: unknown = (JSON.parse(json) as Record<string, unknown>)[claim]
    return typeof value === 'string' && value !== '' ? value : null
  } catch {
    return null
  }
}
