/**
 * Reads what Supabase Auth puts in the URL when an email link (sign-up confirmation,
 * password recovery, email change) sends the user back to the app, and removes it from the
 * address bar and from browser history.
 *
 * Implicit flow: a valid link lands with `#access_token=…&refresh_token=…&type=recovery`, a
 * dead one with `#error=access_denied&error_code=otp_expired&error_description=…` (errors can
 * also arrive in the query string). supabase-js could read the fragment itself, but it then
 * clears it with `location.hash = ''`, which pushes a new history entry and leaves the
 * token-bearing URL one step back. Here the current entry is *replaced* instead, before the
 * Supabase client is even created, and the auth bootstrap hands the tokens to supabase-js.
 *
 * `captureAuthRedirect()` runs once, synchronously, at start-up (see main.tsx).
 */

export interface AuthRedirectTokens {
  access_token: string
  refresh_token: string
}

export interface AuthLinkError {
  /** Supabase error code, e.g. "otp_expired"; "unspecified" when the URL gives none. */
  code: string
}

export interface AuthRedirect {
  /** Present when the link carried a session. */
  tokens?: AuthRedirectTokens
  /** Link type from Supabase: "signup", "recovery", "invite", "magiclink", "email_change". */
  type?: string
  /** Present when the link was rejected (expired, already used, invalid). */
  error?: AuthLinkError
}

const TOKEN_KEYS = [
  'access_token',
  'refresh_token',
  'expires_in',
  'expires_at',
  'token_type',
  'type',
  'provider_token',
  'provider_refresh_token',
]
const ERROR_KEYS = ['error', 'error_code', 'error_description']
const AUTH_KEYS = [...TOKEN_KEYS, ...ERROR_KEYS, 'sb']

let pending: AuthRedirect | null = null

/** Parse an auth redirect out of a URL. Returns null when the URL carries none. */
export function parseAuthRedirect(href: string): AuthRedirect | null {
  const url = new URL(href)
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const get = (key: string) => hash.get(key) ?? url.searchParams.get(key) ?? undefined

  const errorCode = get('error_code')
  if (
    errorCode !== undefined ||
    get('error') !== undefined ||
    get('error_description') !== undefined
  ) {
    return { error: { code: errorCode ?? 'unspecified' }, type: get('type') }
  }

  const accessToken = hash.get('access_token')
  const refreshToken = hash.get('refresh_token')
  if (accessToken && refreshToken) {
    return {
      tokens: { access_token: accessToken, refresh_token: refreshToken },
      type: hash.get('type') ?? undefined,
    }
  }
  return null
}

/** The same URL without any auth parameter in the fragment or the query string. */
export function stripAuthParams(href: string): string {
  const url = new URL(href)
  for (const key of AUTH_KEYS) url.searchParams.delete(key)
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const hashIsAuth = AUTH_KEYS.some((key) => hash.has(key))
  if (hashIsAuth) {
    for (const key of AUTH_KEYS) hash.delete(key)
    const rest = hash.toString()
    url.hash = rest ? `#${rest}` : ''
  }
  return url.toString()
}

/**
 * Take any auth redirect out of the current URL (replacing the history entry) and keep it
 * for the auth bootstrap. Call once, before the Supabase client is created.
 */
export function captureAuthRedirect(): void {
  const redirect = parseAuthRedirect(window.location.href)
  if (!redirect) return
  pending = redirect
  const cleaned = stripAuthParams(window.location.href)
  window.history.replaceState(window.history.state, '', cleaned)
}

/** Hand over the captured redirect, once. */
export function takeAuthRedirect(): AuthRedirect | null {
  const redirect = pending
  pending = null
  return redirect
}
