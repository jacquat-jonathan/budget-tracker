import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { renderRoutes } from '@/test/render'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'
import { warmPages } from '@/test/warm'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

beforeAll(() => warmPages('transactions', 'dashboard'))
beforeEach(() => window.localStorage.clear())

describe('a session that ends by itself [R-AUTH-530]', () => {
  it('says on sign-in that the session ended and what was not kept, then returns to the page', async () => {
    const supabaseMock = createSupabaseMock(fakeSession())
    mock.current = supabaseMock
    const { router } = renderRoutes(routes, '/transactions?period=all')
    await screen.findByRole('heading', { name: 'Transactions', level: 1 })

    // Expired or revoked: Supabase reports the session gone; nobody asked to sign out.
    act(() => supabaseMock.emit('SIGNED_OUT', null))

    const notice = await screen.findByTestId('session-ended')
    expect(notice).toHaveTextContent('Your session ended')
    expect(notice).toHaveTextContent(
      'What you had typed and not yet saved was not kept: enter it again after signing in.',
    )
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()

    act(() => supabaseMock.emit('SIGNED_IN', fakeSession()))
    await waitFor(() => {
      expect(`${router.state.location.pathname}${router.state.location.search}`).toBe(
        '/transactions?period=all',
      )
    })
  })

  it('says it also when a stored session no longer restores on opening the app', async () => {
    window.localStorage.setItem('sb-example-auth-token', '{"broken":true}')
    mock.current = createSupabaseMock(null)
    renderRoutes(routes, '/budget')
    expect(await screen.findByTestId('session-ended')).toHaveTextContent('Your session ended')
  })

  it('says nothing when the user signed out', async () => {
    const supabaseMock = createSupabaseMock(fakeSession())
    mock.current = supabaseMock
    renderRoutes(routes, '/')
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 })
    await userEvent.click(screen.getAllByRole('button', { name: 'Open the account menu' })[0]!)
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByTestId('session-ended')).not.toBeInTheDocument()
  })

  it('says nothing to someone who was never signed in', async () => {
    mock.current = createSupabaseMock(null)
    renderRoutes(routes, '/budget')
    const heading = await screen.findByRole('heading', { name: 'Sign in' })
    expect(within(document.body).queryByTestId('session-ended')).not.toBeInTheDocument()
    expect(heading).toBeInTheDocument()
  })
})
