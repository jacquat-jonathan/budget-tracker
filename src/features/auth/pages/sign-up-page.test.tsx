import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { renderRoutes } from '@/test/render'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

async function fillAndSubmit() {
  await userEvent.type(await screen.findByLabelText('Display name'), 'Alex')
  await userEvent.type(screen.getByLabelText('Email'), 'alex@example.com')
  await userEvent.type(screen.getByLabelText('Password'), 'long-enough')
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
}

describe('SignUpPage', () => {
  it('sends the display name as user metadata and asks to confirm the email', async () => {
    mock.current = createSupabaseMock(null)
    renderRoutes(routes, '/sign-up')
    await fillAndSubmit()

    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument()
    expect(screen.getByText(/alex@example\.com/)).toBeInTheDocument()
    expect(mock.current.client.auth.signUp).toHaveBeenCalledWith({
      email: 'alex@example.com',
      password: 'long-enough',
      options: expect.objectContaining({ data: { display_name: 'Alex' } }) as unknown,
    })
  })

  it('goes straight to the app when Supabase returns a session', async () => {
    const supabaseMock = createSupabaseMock(null)
    mock.current = supabaseMock
    const session = fakeSession()
    supabaseMock.client.auth.signUp.mockImplementationOnce(() => {
      supabaseMock.emit('SIGNED_IN', session)
      return Promise.resolve({ data: { session, user: session.user }, error: null })
    })
    const { router } = renderRoutes(routes, '/sign-up')
    await fillAndSubmit()

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it('requires a password of at least 8 characters', async () => {
    mock.current = createSupabaseMock(null)
    renderRoutes(routes, '/sign-up')
    await userEvent.type(await screen.findByLabelText('Password'), 'short')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Use at least 8 characters.')).toBeInTheDocument()
    expect(mock.current.client.auth.signUp).not.toHaveBeenCalled()
  })
})
