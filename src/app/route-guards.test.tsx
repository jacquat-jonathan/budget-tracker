import { screen, waitFor } from '@testing-library/react'

import { routes } from '@/app/routes'
import { renderRoutes } from '@/test/render'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

describe('protected routes', () => {
  it('redirect a signed-out visitor to sign-in, then back to the requested page [R-AUTH-001]', async () => {
    mock.current = createSupabaseMock(null)
    const { router } = renderRoutes(routes, '/transactions?period=2026-01#top')

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/sign-in')
    expect(router.state.location.state).toEqual({ from: '/transactions?period=2026-01#top' })

    mock.current.emit('SIGNED_IN', fakeSession())

    expect(await screen.findByRole('heading', { name: 'Transactions' })).toBeInTheDocument()
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/transactions')
    })
    expect(router.state.location.search).toBe('?period=2026-01')
  })

  it('render the app shell for a signed-in user [R-APP-001]', async () => {
    mock.current = createSupabaseMock(fakeSession())
    renderRoutes(routes, '/money-flow')

    expect(await screen.findByRole('heading', { name: 'Money flow' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Transfers' })).toHaveAttribute('href', '/transfers')
    expect(screen.getByRole('link', { name: 'Accounts' })).toHaveAttribute('href', '/accounts')
  })

  it('send a signed-in user away from the sign-in page [R-AUTH-002]', async () => {
    mock.current = createSupabaseMock(fakeSession())
    const { router } = renderRoutes(routes, '/sign-in')

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it('show the 404 page for unknown paths [R-APP-002]', async () => {
    mock.current = createSupabaseMock(null)
    renderRoutes(routes, '/no-such-page')

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})
