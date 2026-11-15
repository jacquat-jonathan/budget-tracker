/**
 * Scenario tests for the email-link and password-recovery invariants. Two people, X and Y,
 * share one browser (a household computer). In these tests the mock's session plays the
 * part of the session that supabase-js keeps in localStorage. Unmounting and rendering
 * again plays a page reload of the same tab. Writing to localStorage and dispatching a
 * `storage` event plays another tab of the same browser.
 *
 * A. The new-password form shows only while recovery mode is active for the signed-in
 *    session, and it names the account.
 * B. The outcome of a link that just landed is never discarded because another session
 *    exists, and it never falls through to a form for a different account.
 * C. Parked link tokens and the recovery flag belong to one user and one attempt.
 * D. Signing in with a password ends recovery mode.
 * E. Every state of /reset-password has one consistent message and one way on.
 */
import { AuthApiError, AuthRetryableFetchError, type Session } from '@supabase/supabase-js'
import { act, cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { captureAuthRedirect, hasParkedLink } from '@/features/auth/auth-redirect'
import { isRecoveryFor, RECOVERY_KEY, startRecovery } from '@/features/auth/recovery'
import i18n from '@/lib/i18n'
import { renderRoutes } from '@/test/render'
import {
  createSupabaseMock,
  fakeSession,
  fakeToken,
  sessionFor,
  userX,
  userY,
  type TestUser,
} from '@/test/supabase-mock'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

function browserWith(session: Session | null) {
  mock.current = createSupabaseMock(session)
  return mock.current
}

/** The browser follows an email link to `url`; main.tsx captures it before rendering. */
function landOn(url: string): string {
  window.history.replaceState(null, '', url)
  captureAuthRedirect()
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function recoveryLink(user: TestUser, sessionId: string, path = '/reset-password'): string {
  return `${path}#access_token=${fakeToken(user, sessionId)}&refresh_token=rt-${sessionId}&expires_in=3600&token_type=bearer&type=recovery`
}

/** Reload this tab: unmount, then start the app again on `path`. */
function reload(path: string) {
  cleanup()
  return renderRoutes(routes, path)
}

/** Another tab of this browser writes (or removes) the recovery flag. */
function otherTabWritesFlag(value: string | null) {
  act(() => {
    if (value === null) localStorage.removeItem(RECOVERY_KEY)
    else localStorage.setItem(RECOVERY_KEY, value)
    window.dispatchEvent(new StorageEvent('storage', { key: RECOVERY_KEY, newValue: value }))
  })
}

const networkError = () => new AuthRetryableFetchError('Failed to fetch', 0)
const rejected = () => new AuthApiError('Token has expired or is invalid', 403, 'bad_jwt')

const form = () => screen.queryByRole('heading', { name: 'Choose a new password' })
const passwordField = () => screen.queryByLabelText('New password')

afterEach(async () => {
  window.history.replaceState(null, '', '/')
  await i18n.changeLanguage('en')
})

describe('A. the new-password form needs recovery mode for the current session', () => {
  it('names the account and locks the app until the password is saved', async () => {
    const browser = browserWith(null)
    const { router } = renderRoutes(routes, landOn(recoveryLink(userX, 'x-rec', '/budget')))

    expect(
      await screen.findByRole('heading', { name: 'Choose a new password' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(`Enter a new password for the account ${userX.email}.`),
    ).toBeInTheDocument()
    await act(() => router.navigate('/settings'))
    expect(router.state.location.pathname).toBe('/reset-password')

    await userEvent.type(screen.getByLabelText('New password'), 'brand-new-password')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'brand-new-password')
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }))

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
    expect(browser.client.auth.updateUser).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(RECOVERY_KEY)).toBeNull()
  })

  it('a signed-in user who is not in recovery is sent from /reset-password into the app', async () => {
    browserWith(sessionFor(userY, 'y-1'))
    const { router } = renderRoutes(routes, '/reset-password')

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(passwordField()).not.toBeInTheDocument()
  })

  it('the PASSWORD_RECOVERY event enters recovery mode for that session', async () => {
    const browser = browserWith(sessionFor(userX, 'x-1'))
    renderRoutes(routes, '/debts')
    expect(await screen.findByRole('heading', { name: 'Debts', level: 1 })).toBeInTheDocument()

    act(() => browser.emit('PASSWORD_RECOVERY', sessionFor(userX, 'x-rec')))
    expect(
      await screen.findByRole('heading', { name: 'Choose a new password' }),
    ).toBeInTheDocument()
  })
})

describe('B. a link outcome is never discarded because another session exists', () => {
  it('[reported] a used reset link opened while Y is signed in never offers to change Y’s password', async () => {
    const browser = browserWith(sessionFor(userY, 'y-1'))
    browser.client.auth.setSession.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: rejected(),
    })
    renderRoutes(routes, landOn(recoveryLink(userX, 'x-old')))

    expect(
      await screen.findByRole('heading', { name: 'This link no longer works' }),
    ).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`still signed in as ${userY.email}`))).toBeInTheDocument()
    expect(passwordField()).not.toBeInTheDocument()
    expect(form()).not.toBeInTheDocument()
    expect(browser.client.auth.updateUser).not.toHaveBeenCalled()
  })

  it('[reported] a valid link that hits a network failure while Y is signed in shows no form either', async () => {
    const browser = browserWith(sessionFor(userY, 'y-1'))
    browser.client.auth.setSession.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: networkError(),
    })
    renderRoutes(routes, landOn(recoveryLink(userX, 'x-rec')))

    expect(
      await screen.findByRole('heading', { name: 'We could not check this link' }),
    ).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`still signed in as ${userY.email}`))).toBeInTheDocument()
    expect(passwordField()).not.toBeInTheDocument()
  })

  it('a dead link landing in the app while signed in is reported there', async () => {
    browserWith(sessionFor(userY, 'y-1'))
    renderRoutes(routes, landOn('/#error=access_denied&error_code=otp_expired'))

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
    expect(screen.getByTestId('link-notice')).toHaveTextContent('This link no longer works')
    await userEvent.click(screen.getByRole('button', { name: 'Continue to the app' }))
    expect(screen.queryByTestId('link-notice')).not.toBeInTheDocument()
  })

  it('a dead link landing while signed out is reported on sign-in, in the user’s language', async () => {
    await i18n.changeLanguage('fr')
    browserWith(null)
    renderRoutes(routes, landOn('/#error=access_denied&error_code=otp_expired'))

    expect(await screen.findByText('Ce lien ne fonctionne plus')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Renvoyer l’e-mail de confirmation' }),
    ).toBeInTheDocument()
  })

  it('the notice goes once someone signs in or out afterwards, and does not come back', async () => {
    const browser = browserWith(null)
    renderRoutes(routes, landOn('/#error=access_denied&error_code=otp_expired'))
    expect(await screen.findByText('This link no longer works')).toBeInTheDocument()

    act(() => browser.emit('SIGNED_IN', sessionFor(userY, 'y-1')))
    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
    expect(screen.queryByTestId('link-notice')).not.toBeInTheDocument()
    act(() => browser.emit('SIGNED_OUT', null))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByText('This link no longer works')).not.toBeInTheDocument()
  })
})

describe('C. parked tokens and the recovery flag belong to one user and one attempt', () => {
  it('a network failure parks the link; a reload of the same tab retries it', async () => {
    const browser = browserWith(null)
    browser.client.auth.setSession.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: networkError(),
    })
    renderRoutes(routes, landOn(recoveryLink(userX, 'x-rec')))
    expect(
      await screen.findByRole('heading', { name: 'We could not check this link' }),
    ).toBeInTheDocument()
    expect(window.location.href).not.toContain('access_token')

    reload('/reset-password')
    expect(
      await screen.findByText(`Enter a new password for the account ${userX.email}.`),
    ).toBeInTheDocument()
    expect(browser.client.auth.setSession).toHaveBeenCalledTimes(2)
  })

  it('a network failure while Y is signed in is retried after a reload if Y is still the one signed in', async () => {
    const browser = browserWith(sessionFor(userY, 'y-1'))
    browser.client.auth.setSession.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: networkError(),
    })
    renderRoutes(routes, landOn(recoveryLink(userX, 'x-rec')))
    expect(
      await screen.findByRole('heading', { name: 'We could not check this link' }),
    ).toBeInTheDocument()

    reload('/reset-password')
    // X's own link, X's account, named on the form.
    expect(
      await screen.findByText(`Enter a new password for the account ${userX.email}.`),
    ).toBeInTheDocument()
  })

  it('[reported] Y signing in on the tab where X’s link is parked ends X’s attempt', async () => {
    const browser = browserWith(null)
    browser.client.auth.setSession.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: networkError(),
    })
    renderRoutes(routes, landOn(recoveryLink(userX, 'x-rec')))
    expect(
      await screen.findByRole('heading', { name: 'We could not check this link' }),
    ).toBeInTheDocument()

    // X walks away; Y signs in with a password in this tab.
    act(() => browser.emit('SIGNED_IN', sessionFor(userY, 'y-1')))
    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
    expect(hasParkedLink()).toBe(false)

    reload('/')
    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
    expect(browser.client.auth.setSession).toHaveBeenCalledTimes(1)
    expect(passwordField()).not.toBeInTheDocument()
  })

  it('a parked link is dropped at reload if someone signed in elsewhere meanwhile', async () => {
    const browser = browserWith(null)
    browser.client.auth.setSession.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: networkError(),
    })
    renderRoutes(routes, landOn(recoveryLink(userX, 'x-rec')))
    expect(
      await screen.findByRole('heading', { name: 'We could not check this link' }),
    ).toBeInTheDocument()
    cleanup()

    // Y signs in from another tab while this one is closed or asleep.
    browser.emit('SIGNED_IN', sessionFor(userY, 'y-1'))
    renderRoutes(routes, '/')

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
    expect(browser.client.auth.setSession).toHaveBeenCalledTimes(1)
    expect(hasParkedLink()).toBe(false)
  })

  it('a rejected link is dropped at once and never retried', async () => {
    const browser = browserWith(null)
    browser.client.auth.setSession.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: rejected(),
    })
    renderRoutes(routes, landOn(recoveryLink(userX, 'x-old')))
    expect(await screen.findByText('This link no longer works')).toBeInTheDocument()
    expect(hasParkedLink()).toBe(false)

    reload('/')
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(browser.client.auth.setSession).toHaveBeenCalledTimes(1)
  })

  it('choosing to continue past an undecided link ends that attempt', async () => {
    const browser = browserWith(sessionFor(userY, 'y-1'))
    browser.client.auth.setSession.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: networkError(),
    })
    renderRoutes(routes, landOn(recoveryLink(userX, 'x-rec')))
    await userEvent.click(await screen.findByRole('button', { name: 'Continue to the app' }))

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
    expect(hasParkedLink()).toBe(false)
  })

  it('a recovery flag from another sign-in of the same user is inert', async () => {
    startRecovery(sessionFor(userX, 'x-rec'))
    browserWith(sessionFor(userX, 'x-2'))
    renderRoutes(routes, '/')

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
  })

  it('signing out ends recovery mode and any parked attempt', async () => {
    browserWith(null)
    renderRoutes(routes, landOn(recoveryLink(userX, 'x-rec')))
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel and sign out' }))

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(localStorage.getItem(RECOVERY_KEY)).toBeNull()
    expect(hasParkedLink()).toBe(false)
  })
})

describe('D. signing in with a password ends recovery mode', () => {
  it('[reported] a stale recovery flag does not hold a later password sign-in on the form', async () => {
    // Recovery starts for X, then the session disappears without the app signing out.
    const browser = browserWith(null)
    renderRoutes(routes, landOn(recoveryLink(userX, 'x-rec')))
    expect(
      await screen.findByRole('heading', { name: 'Choose a new password' }),
    ).toBeInTheDocument()
    cleanup()
    browser.emit('TOKEN_REFRESHED', null) // gone, with no SIGNED_OUT seen by the app
    renderRoutes(routes, '/sign-in')
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()

    browser.client.auth.signInWithPassword.mockImplementationOnce(() => {
      const next = sessionFor(userX, 'x-password')
      browser.emit('SIGNED_IN', next)
      return Promise.resolve({ data: { session: next, user: next.user }, error: null })
    })
    await userEvent.type(screen.getByLabelText('Email'), userX.email)
    await userEvent.type(screen.getByLabelText('Password'), 'old-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
    expect(form()).not.toBeInTheDocument()
  })

  it('also when tokens carry no session id (the same session key before and after)', async () => {
    const legacy = fakeSession()
    startRecovery(legacy)
    const browser = browserWith(null)
    renderRoutes(routes, '/sign-in')
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()

    browser.client.auth.signInWithPassword.mockImplementationOnce(() => {
      browser.emit('SIGNED_IN', legacy)
      return Promise.resolve({ data: { session: legacy, user: legacy.user }, error: null })
    })
    await userEvent.type(screen.getByLabelText('Email'), 'alex@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
    expect(isRecoveryFor(legacy)).toBe(false)
  })
})

describe('E. every state of /reset-password has one message and one way on', () => {
  it('[reported] an undecided link shows only the network message and "Try again"', async () => {
    const browser = browserWith(null)
    browser.client.auth.setSession.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: networkError(),
    })
    renderRoutes(routes, landOn(recoveryLink(userX, 'x-rec')))

    expect(
      await screen.findByRole('heading', { name: 'We could not check this link' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByText(/no longer/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Request a new/ })).not.toBeInTheDocument()
  })

  it('[reported] after another tab saves the password, this tab moves on into the app', async () => {
    const recovering = sessionFor(userX, 'x-rec')
    startRecovery(recovering)
    browserWith(recovering)
    renderRoutes(routes, '/reset-password')
    expect(
      await screen.findByRole('heading', { name: 'Choose a new password' }),
    ).toBeInTheDocument()

    otherTabWritesFlag(null)
    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
  })

  it('[reported] after another tab cancels, this tab moves on to sign-in', async () => {
    const recovering = sessionFor(userX, 'x-rec')
    startRecovery(recovering)
    const browser = browserWith(recovering)
    renderRoutes(routes, '/reset-password')
    expect(
      await screen.findByRole('heading', { name: 'Choose a new password' }),
    ).toBeInTheDocument()

    otherTabWritesFlag(null)
    act(() => browser.emit('SIGNED_OUT', null))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByText(/no longer/i)).not.toBeInTheDocument()
  })

  it('another tab entering recovery for this session brings this tab to the form', async () => {
    const recovering = sessionFor(userX, 'x-rec')
    browserWith(recovering)
    renderRoutes(routes, '/debts')
    expect(await screen.findByRole('heading', { name: 'Debts', level: 1 })).toBeInTheDocument()

    otherTabWritesFlag(JSON.stringify({ userId: userX.id, sessionKey: 'session:x-rec' }))
    expect(
      await screen.findByRole('heading', { name: 'Choose a new password' }),
    ).toBeInTheDocument()
  })

  it('a signed-out visit goes to sign-in', async () => {
    browserWith(null)
    const { router } = renderRoutes(routes, '/reset-password')
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/sign-in')
  })
})
