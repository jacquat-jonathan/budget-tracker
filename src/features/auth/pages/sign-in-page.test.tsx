import { AuthError } from '@supabase/supabase-js'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SignInPage } from '@/features/auth/pages/sign-in-page'
import i18n from '@/lib/i18n'
import { renderRoutes } from '@/test/render'
import { createSupabaseMock } from '@/test/supabase-mock'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

function renderSignIn() {
  mock.current = createSupabaseMock(null)
  renderRoutes([{ path: '/sign-in', element: <SignInPage /> }], '/sign-in')
  return mock.current.client.auth
}

describe('SignInPage', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('says an import interrupted by the end of the session can be finished after signing in [R-IMPORT-369]', () => {
    localStorage.setItem(
      'budget-tracker-import-pending:0b7c2b8e-8d40-4c4e-9a43-2f5d4d6c1a11',
      JSON.stringify({
        batchId: '0b7c2b8e-8d40-4c4e-9a43-2f5d4d6c1a10',
        fingerprint: 'abc',
        source: 'csv',
        parts: 3,
        confirmedParts: 1,
        startedAt: '2026-11-15T10:00:00Z',
      }),
    )
    renderSignIn()
    expect(screen.getByTestId('sign-in-import')).toHaveTextContent(
      'An import was being sent from this device when the session ended. What it had recorded is kept. Sign in and open the same file on the Import page to finish it',
    )
    localStorage.clear()
    renderSignIn()
    expect(screen.getAllByTestId('sign-in-import')).toHaveLength(1)
  })

  it('shows required-field errors and does not call Supabase [R-AUTH-009]', async () => {
    const auth = renderSignIn()
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Enter your email address.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('rejects an invalid email address [R-AUTH-009]', async () => {
    const auth = renderSignIn()
    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email')
    await userEvent.type(screen.getByLabelText('Password'), 'secret')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('translates validation errors [R-I18N-001]', async () => {
    renderSignIn()
    await i18n.changeLanguage('fr')
    await userEvent.click(await screen.findByRole('button', { name: 'Se connecter' }))

    expect(await screen.findByText('Saisissez votre adresse e-mail.')).toBeInTheDocument()
    expect(screen.getByText('Saisissez votre mot de passe.')).toBeInTheDocument()
  })

  it('submits trimmed credentials and shows a translated auth error [R-AUTH-010] [R-AUTH-011]', async () => {
    const auth = renderSignIn()
    auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: new AuthError('Invalid login credentials', 400, 'invalid_credentials'),
    })

    await userEvent.type(screen.getByLabelText('Email'), '  alex@example.com ')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Incorrect email or password.')).toBeInTheDocument()
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'alex@example.com',
      password: 'wrong-password',
    })
  })
})
