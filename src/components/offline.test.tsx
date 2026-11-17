import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Component, Suspense, type ReactNode } from 'react'

import { lazyPage } from '@/app/lazy-page'
import { routes } from '@/app/routes'
import { PageLoadBoundary } from '@/components/page-load-boundary'
import { householdDb } from '@/test/budget-fixtures'
import { renderRoutes } from '@/test/render'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'
import { warmPages } from '@/test/warm'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

beforeAll(() => warmPages('accounts', 'dashboard'))

let online = true
beforeEach(() => {
  online = true
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)
})
afterEach(() => {
  vi.restoreAllMocks()
})

function goOffline() {
  online = false
  act(() => {
    window.dispatchEvent(new Event('offline'))
  })
}

function goOnline() {
  online = true
  act(() => {
    window.dispatchEvent(new Event('online'))
  })
}

describe('while the browser is offline [R-APP-530]', () => {
  it('says so politely across the app, and stops saying it once back online', async () => {
    mock.current = createSupabaseMock(fakeSession(), householdDb())
    renderRoutes(routes, '/')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByTestId('offline-notice')).not.toBeInTheDocument()
    goOffline()
    const notice = screen.getByTestId('offline-notice')
    expect(notice).toHaveTextContent('You are offline.')
    expect(notice.closest('[role="status"]')).toHaveAttribute('aria-live', 'polite')
    goOnline()
    expect(screen.queryByTestId('offline-notice')).not.toBeInTheDocument()
  })
})

describe('a save tried offline [R-APP-531]', () => {
  it('is refused at once with “nothing was saved”, nothing is sent, and it works once back online', async () => {
    const db = householdDb()
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/accounts')
    await userEvent.click(await screen.findByRole('button', { name: 'Add your first account' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Joint account')
    await userEvent.click(within(dialog).getByLabelText('Kind'))
    await userEvent.click(await screen.findByRole('option', { name: 'Current or salary account' }))
    goOffline()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(
      await within(dialog).findByText(
        'You are offline: nothing was saved. Try again once the connection is back; what you typed is still here.',
      ),
    ).toBeInTheDocument()
    // Not "Saving…" waiting for the connection: the button is free again.
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled()
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Joint account')
    expect(db.rpc.create_account).not.toHaveBeenCalled()
    goOnline()
    // Nothing goes out by itself.
    expect(db.rpc.create_account).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(db.rpc.create_account).toHaveBeenCalledTimes(1))
  })
})

class Outer extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown }
  static getDerivedStateFromError(error: unknown) {
    return { error }
  }
  render() {
    return this.state.error ? <p>outer caught</p> : this.props.children
  }
}

describe('a page whose code failed to load [R-APP-532]', () => {
  it('offers to try again, retries by itself when the connection returns, and then shows the page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let attempts = 0
    let failing = true
    const Page = lazyPage(() => {
      attempts += 1
      // Fails until the test lets it through (React itself may try a second time at once).
      return failing
        ? Promise.reject(new TypeError('Failed to fetch dynamically imported module'))
        : Promise.resolve({ default: () => <h1>The page</h1> })
    })
    online = false
    render(
      <PageLoadBoundary>
        <Suspense fallback={<p>Loading</p>}>
          <Page />
        </Suspense>
      </PageLoadBoundary>,
    )
    const failed = await screen.findByTestId('page-load-failed')
    expect(failed).toHaveTextContent('This page could not be loaded')
    expect(failed).toHaveTextContent('It loads by itself once the connection is back.')
    expect(within(failed).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    const before = attempts
    failing = false
    goOnline()
    expect(await screen.findByRole('heading', { name: 'The page' })).toBeInTheDocument()
    expect(attempts).toBe(before + 1)
  })

  it('tries again on request', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let failing = true
    const Page = lazyPage(() =>
      failing
        ? Promise.reject(new TypeError('Failed to fetch dynamically imported module'))
        : Promise.resolve({ default: () => <h1>The page</h1> }),
    )
    render(
      <PageLoadBoundary>
        <Suspense fallback={<p>Loading</p>}>
          <Page />
        </Suspense>
      </PageLoadBoundary>,
    )
    const failed = await screen.findByTestId('page-load-failed')
    expect(failed).toHaveTextContent('Check your connection and try again.')
    failing = false
    await userEvent.click(within(failed).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'The page' })).toBeInTheDocument()
  })

  it('reloads the page when trying again fails while online (a browser that keeps the failed download)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const reload = vi.fn()
    const Page = lazyPage(() =>
      Promise.reject(new TypeError('Failed to fetch dynamically imported module')),
    )
    render(
      <PageLoadBoundary reload={reload}>
        <Suspense fallback={<p>Loading</p>}>
          <Page />
        </Suspense>
      </PageLoadBoundary>,
    )
    const failed = await screen.findByTestId('page-load-failed')
    expect(reload).not.toHaveBeenCalled()
    await userEvent.click(within(failed).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
  })

  it('leaves any other error to the error page above it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    function Broken(): ReactNode {
      throw new Error('a bug')
    }
    render(
      <Outer>
        <PageLoadBoundary>
          <Broken />
        </PageLoadBoundary>
      </Outer>,
    )
    expect(await screen.findByText('outer caught')).toBeInTheDocument()
    expect(screen.queryByTestId('page-load-failed')).not.toBeInTheDocument()
  })
})
