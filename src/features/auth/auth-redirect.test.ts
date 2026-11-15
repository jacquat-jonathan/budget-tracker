import {
  captureAuthRedirect,
  parseAuthRedirect,
  settleAuthRedirect,
  stripAuthParams,
  takeAuthRedirect,
} from '@/features/auth/auth-redirect'

const ORIGIN = 'https://example.ch'

describe('parseAuthRedirect', () => {
  it('reads the session and link type from the fragment', () => {
    expect(
      parseAuthRedirect(
        `${ORIGIN}/budget/#access_token=at&expires_in=3600&refresh_token=rt&token_type=bearer&type=recovery`,
      ),
    ).toEqual({ tokens: { access_token: 'at', refresh_token: 'rt' }, type: 'recovery' })
  })

  it('reads an error from the fragment or the query string', () => {
    expect(
      parseAuthRedirect(
        `${ORIGIN}/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`,
      ),
    ).toEqual({ error: { code: 'otp_expired' }, type: undefined })
    expect(parseAuthRedirect(`${ORIGIN}/sign-in?error=server_error`)).toEqual({
      error: { code: 'unspecified' },
      type: undefined,
    })
  })

  it('ignores ordinary URLs', () => {
    expect(parseAuthRedirect(`${ORIGIN}/transactions?period=2026-01#top`)).toBeNull()
    expect(parseAuthRedirect(`${ORIGIN}/#access_token=only-half`)).toBeNull()
  })
})

describe('stripAuthParams', () => {
  it('removes auth parameters and keeps the rest of the URL', () => {
    expect(
      stripAuthParams(`${ORIGIN}/budget/debts?x=1#access_token=a&refresh_token=b&type=signup`),
    ).toBe(`${ORIGIN}/budget/debts?x=1`)
    expect(stripAuthParams(`${ORIGIN}/sign-in?error=e&error_code=otp_expired&x=1`)).toBe(
      `${ORIGIN}/sign-in?x=1`,
    )
    expect(stripAuthParams(`${ORIGIN}/transactions#top`)).toBe(`${ORIGIN}/transactions#top`)
  })
})

describe('captureAuthRedirect', () => {
  it('replaces the token-bearing history entry instead of adding one', () => {
    window.history.replaceState(
      null,
      '',
      '/money-flow#access_token=a&refresh_token=b&type=recovery',
    )
    const entries = window.history.length

    captureAuthRedirect()

    expect(window.location.pathname).toBe('/money-flow')
    expect(window.location.hash).toBe('')
    expect(window.history.length).toBe(entries)
    expect(takeAuthRedirect()).toEqual({
      tokens: { access_token: 'a', refresh_token: 'b' },
      type: 'recovery',
    })
    // Kept for this tab (not in any URL) until the bootstrap settles it, so a reload after a
    // network failure can retry.
    expect(takeAuthRedirect()).toEqual({
      tokens: { access_token: 'a', refresh_token: 'b' },
      type: 'recovery',
    })
    settleAuthRedirect()
    expect(takeAuthRedirect()).toBeNull()
  })

  it('leaves ordinary URLs alone', () => {
    window.history.replaceState(null, '', '/periods#top')
    captureAuthRedirect()
    expect(window.location.hash).toBe('#top')
    expect(takeAuthRedirect()).toBeNull()
  })
})
