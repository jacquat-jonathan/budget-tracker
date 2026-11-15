import { AuthError } from '@supabase/supabase-js'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { captureAuthRedirect } from '@/features/auth/auth-redirect'
import i18n from '@/lib/i18n'
import { renderRoutes } from '@/test/render'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

/** Simulate the browser landing on `url` from an email link (main.tsx captures it). */
function landOn(url: string) {
  window.history.replaceState(null, '', url)
  captureAuthRedirect()
  const path = `${window.location.pathname}${window.location.search}${window.location.hash}`
  return path
}

afterEach(async () => {
  window.history.replaceState(null, '', '/')
  await i18n.changeLanguage('en')
})

describe('password recovery link', () => {
  it('asks for a new password even when the link lands outside /reset-password', async () => {
    mock.current = createSupabaseMock(null)
    const path = landOn(
      '/budget#access_token=at&refresh_token=rt&expires_in=3600&token_type=bearer&type=recovery',
    )
    const { router } = renderRoutes(routes, path)

    expect(
      await screen.findByRole('heading', { name: 'Choose a new password' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/reset-password')
    expect(mock.current.client.auth.setSession).toHaveBeenCalledWith({
      access_token: 'at',
      refresh_token: 'rt',
    })

    // The app stays locked behind the form until a new password is saved.
    await act(() => router.navigate('/settings'))
    expect(router.state.location.pathname).toBe('/reset-password')

    await userEvent.type(screen.getByLabelText('New password'), 'brand-new-password')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'brand-new-password')
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }))

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
    expect(mock.current.client.auth.updateUser).toHaveBeenCalledWith({
      password: 'brand-new-password',
    })
    await act(() => router.navigate('/settings'))
    expect(router.state.location.pathname).toBe('/settings')
  })

  it('is also driven by the PASSWORD_RECOVERY auth event', async () => {
    const supabaseMock = createSupabaseMock(fakeSession())
    mock.current = supabaseMock
    const { router } = renderRoutes(routes, '/debts')
    expect(await screen.findByRole('heading', { name: 'Debts', level: 1 })).toBeInTheDocument()

    act(() => supabaseMock.emit('PASSWORD_RECOVERY', fakeSession()))

    expect(
      await screen.findByRole('heading', { name: 'Choose a new password' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/reset-password')
  })

  it('a confirmation (non-recovery) link signs the user straight in', async () => {
    mock.current = createSupabaseMock(null)
    const path = landOn('/#access_token=at&refresh_token=rt&type=signup')
    renderRoutes(routes, path)

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
  })
})

describe('expired or used email link', () => {
  it('explains the problem on the sign-in page and offers to resend the confirmation', async () => {
    mock.current = createSupabaseMock(null)
    const path = landOn(
      '/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    )
    const { router } = renderRoutes(routes, path)

    expect(await screen.findByText('This link no longer works')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/sign-in')
    expect(
      screen.getByText(/Email links expire after a while and work only once/),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Request a new password reset link' }),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: 'Resend the confirmation email' }))
    await screen.findByRole('heading', { name: 'Resend the confirmation email' })
    await userEvent.type(screen.getByLabelText('Email'), 'alex@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send the link' }))

    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument()
    expect(mock.current.client.auth.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'alex@example.com',
      options: { emailRedirectTo: expect.any(String) as unknown },
    })
  })

  it('is translated', async () => {
    await i18n.changeLanguage('fr')
    mock.current = createSupabaseMock(null)
    renderRoutes(routes, landOn('/#error=access_denied&error_code=otp_expired'))

    expect(await screen.findByText('Ce lien ne fonctionne plus')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Renvoyer l’e-mail de confirmation' }),
    ).toBeInTheDocument()
  })

  it('offers to resend the confirmation when sign-in says the email is not confirmed', async () => {
    mock.current = createSupabaseMock(null)
    mock.current.client.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: new AuthError('Email not confirmed', 400, 'email_not_confirmed'),
    })
    renderRoutes(routes, '/sign-in')

    await userEvent.type(await screen.findByLabelText('Email'), 'alex@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'some-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await userEvent.click(
      await screen.findByRole('link', { name: 'Resend the confirmation email' }),
    )
    await screen.findByRole('heading', { name: 'Resend the confirmation email' })

    expect(screen.getByLabelText('Email')).toHaveValue('alex@example.com')
  })
})

describe('query cache', () => {
  it('is cleared when the session switches to another user, kept for the same user', async () => {
    const supabaseMock = createSupabaseMock(fakeSession())
    mock.current = supabaseMock
    const { queryClient } = renderRoutes(routes, '/')
    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()

    queryClient.setQueryData(['budgets'], ['first user budget'])
    act(() => supabaseMock.emit('TOKEN_REFRESHED', fakeSession({}, 'refreshed-token')))
    expect(queryClient.getQueryData(['budgets'])).toEqual(['first user budget'])

    act(() =>
      supabaseMock.emit(
        'SIGNED_IN',
        fakeSession({ id: '00000000-0000-0000-0000-000000000002', email: 'sam@example.com' }),
      ),
    )
    await waitFor(() => {
      expect(queryClient.getQueryData(['budgets'])).toBeUndefined()
    })
  })

  it('is cleared on sign-out', async () => {
    const supabaseMock = createSupabaseMock(fakeSession())
    mock.current = supabaseMock
    const { queryClient } = renderRoutes(routes, '/')
    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()

    queryClient.setQueryData(['budgets'], ['data'])
    act(() => supabaseMock.emit('SIGNED_OUT', null))

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(queryClient.getQueryData(['budgets'])).toBeUndefined()
  })
})
