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
 * Until the bootstrap has a definite answer for the tokens, they are kept in sessionStorage
 * (this tab only, never in a URL or history entry), so a network failure while validating
 * them does not burn the link: reloading the page retries.
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

const PENDING_LINK_KEY = 'budget-tracker-pending-link'
const PENDING_LINK_MAX_AGE_MS = 24 * 60 * 60 * 1000

/**
 * Link tokens waiting for a definite answer, kept for this tab only (sessionStorage), never
 * in a URL. They belong to one attempt made while one particular session (or none) was
 * current: `sessionKeyAtPark` records it once the first attempt fails for a transient
 * reason (undefined while the first attempt is still running). If the current session is
 * different later, someone signed in or out in between and the tokens are dropped
 * (invariant C).
 */
interface ParkedLink {
  tokens: AuthRedirectTokens
  type?: string
  capturedAt: number
  sessionKeyAtPark?: string | null
}

export interface TakenRedirect extends AuthRedirect {
  /** Present for tokens parked by an earlier page load (see ParkedLink). */
  sessionKeyAtPark?: string | null
  /** True when the tokens come from an earlier page load rather than this URL. */
  fromParking: boolean
}

function writeParked(link: ParkedLink): void {
  try {
    sessionStorage.setItem(PENDING_LINK_KEY, JSON.stringify(link))
  } catch {
    // Without storage a failed attempt cannot be retried by reloading.
  }
}

function readParked(): ParkedLink | null {
  try {
    const raw = sessionStorage.getItem(PENDING_LINK_KEY)
    if (!raw) return null
    const link = JSON.parse(raw) as Partial<ParkedLink>
    const tokens = link.tokens
    if (
      typeof tokens?.access_token !== 'string' ||
      typeof tokens.refresh_token !== 'string' ||
      typeof link.capturedAt !== 'number' ||
      Date.now() - link.capturedAt > PENDING_LINK_MAX_AGE_MS
    ) {
      sessionStorage.removeItem(PENDING_LINK_KEY)
      return null
    }
    return {
      tokens,
      type: typeof link.type === 'string' ? link.type : undefined,
      capturedAt: link.capturedAt,
      sessionKeyAtPark:
        typeof link.sessionKeyAtPark === 'string' || link.sessionKeyAtPark === null
          ? link.sessionKeyAtPark
          : undefined,
    }
  } catch {
    return null
  }
}

/**
 * Take any auth redirect out of the current URL (replacing the history entry) and keep it
 * for the auth bootstrap. Call once, before the Supabase client is created.
 */
export function captureAuthRedirect(): void {
  const redirect = parseAuthRedirect(window.location.href)
  if (!redirect) return
  pending = redirect
  // A newly landed link replaces anything parked earlier in this tab.
  dropParkedLink()
  // Kept from the start, so a reload while the first check is running does not lose it.
  if (redirect.tokens) {
    writeParked({ tokens: redirect.tokens, type: redirect.type, capturedAt: Date.now() })
  }
  const cleaned = stripAuthParams(window.location.href)
  // R-AUTH-013: the token-bearing entry is replaced, not followed by a new one.
  window.history.replaceState(window.history.state, '', cleaned)
}

/**
 * The redirect to process at start-up: the one captured from this page's URL, or else link
 * tokens parked by an earlier load whose check failed for a transient reason.
 */
export function takeAuthRedirect(): TakenRedirect | null {
  const fresh = pending
  pending = null
  if (fresh) return { ...fresh, fromParking: false }
  const parked = readParked()
  if (!parked) return null
  return {
    tokens: parked.tokens,
    type: parked.type,
    sessionKeyAtPark: parked.sessionKeyAtPark,
    fromParking: true,
  }
}

/** The check failed for a transient reason while `currentKey` was the current session. */
// R-AUTH-022: kept for this tab only, never in a URL; a reload retries.
export function parkLink(redirect: AuthRedirect, currentKey: string | null): void {
  if (!redirect.tokens) return
  writeParked({
    tokens: redirect.tokens,
    type: redirect.type,
    capturedAt: Date.now(),
    sessionKeyAtPark: currentKey,
  })
}

/** Forget parked link tokens: definite answer, sign-out, or another sign-in. */
// R-AUTH-021: one user, one attempt.
export function dropParkedLink(): void {
  try {
    sessionStorage.removeItem(PENDING_LINK_KEY)
  } catch {
    // Nothing stored.
  }
}

/** True while link tokens are parked in this tab. */
export function hasParkedLink(): boolean {
  return readParked() !== null
}
