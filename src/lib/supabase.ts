import { createClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/database.types'
import { getSupabaseConfig } from '@/lib/env'

const { url, publishableKey } = getSupabaseConfig()

/** How long a call may go unanswered before it is given up as a lost connection. */
export const CALL_TIMEOUT_MS = 30_000

/**
 * fetch with a limit: a call that never answers fails after CALL_TIMEOUT_MS like a lost
 * connection (read: an error with a retry; write: "may have been saved"), never a skeleton
 * for ever.
 */
// R-APP-281: no read or write waits without end.
function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const outer = init?.signal
  if (outer?.aborted) controller.abort()
  else outer?.addEventListener('abort', () => controller.abort(), { once: true })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, CALL_TIMEOUT_MS)
  return fetch(input, { ...init, signal: controller.signal })
    .catch((error: unknown) => {
      if (timedOut)
        throw new TypeError(`NetworkError: no answer within ${CALL_TIMEOUT_MS / 1000} s`)
      throw error
    })
    .finally(() => clearTimeout(timer))
}

/** The single Supabase client of the app. Only the publishable key reaches the browser. */
export const supabase = createClient<Database>(url, publishableKey, {
  global: { fetch: fetchWithTimeout },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Email links are read by src/features/auth/auth-redirect.ts instead, which removes the
    // tokens from browser history; supabase-js would leave them one Back step away.
    detectSessionInUrl: false,
    // Implicit flow: confirmation and password-reset links carry the session in the URL
    // fragment, so they also work when opened in another browser or on another device
    // (PKCE would need the code verifier stored by the browser that requested the email).
    flowType: 'implicit',
  },
})
