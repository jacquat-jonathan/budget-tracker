import { paths, redirectTarget } from '@/app/paths'

describe('redirectTarget [R-AUTH-003]', () => {
  it('returns the in-app path the visitor asked for, with its query and hash', () => {
    expect(redirectTarget({ from: '/transactions?period=2026-01#top' })).toBe(
      '/transactions?period=2026-01#top',
    )
  })

  it.each([
    paths.signIn,
    paths.signUp,
    `${paths.forgotPassword}?x=1`,
    paths.resendConfirmation,
    `${paths.resetPassword}#top`,
  ])('never returns to the auth page %s', (from) => {
    expect(redirectTarget({ from })).toBe(paths.dashboard)
  })

  it.each(['//evil.example', 'https://evil.example/', 'javascript:alert(1)', 'debts', ''])(
    'never leaves the app for %j',
    (from) => {
      expect(redirectTarget({ from })).toBe(paths.dashboard)
    },
  )

  it.each([null, undefined, {}, { from: 42 }, 'nope'])(
    'falls back to the dashboard for %j',
    (state) => {
      expect(redirectTarget(state)).toBe(paths.dashboard)
    },
  )
})
