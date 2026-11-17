import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthError } from '@supabase/supabase-js'

import { routes } from '@/app/routes'
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

beforeAll(() => warmPages('settings'))

function open() {
  const supabaseMock = createSupabaseMock(fakeSession(), householdDb())
  mock.current = supabaseMock
  renderRoutes(routes, '/settings')
  return supabaseMock
}

describe('settings in sections [R-APP-533]', () => {
  it('has a heading per section and links to each from the top', async () => {
    open()
    const nav = await screen.findByRole('navigation', { name: 'Settings sections' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Budget', '#settings-budget'],
      ['Members', '#settings-members'],
      ['Import', '#settings-import'],
      ['My account', '#settings-account'],
    ])
    for (const [, href] of links.map((link) => [link, link.getAttribute('href')] as const)) {
      expect(document.getElementById(href?.slice(1) ?? '')).not.toBeNull()
    }
    const importSection = screen.getByTestId('settings-import')
    expect(within(importSection).getByRole('heading', { level: 2, name: 'Import' })).toBeVisible()
    expect(
      within(importSection).getByRole('heading', { level: 3, name: 'Import tokens' }),
    ).toBeVisible()
    const account = screen.getByTestId('settings-account')
    expect(within(account).getByRole('heading', { level: 2, name: 'My account' })).toBeVisible()
    expect(within(account).getByRole('heading', { level: 3, name: 'Password' })).toBeVisible()
  })

  it('words the import tokens for a household, without pointing to project files', async () => {
    open()
    const tokens = (await screen.findByRole('heading', { name: 'Import tokens' })).closest(
      '[data-slot="card"]',
    ) as HTMLElement
    expect(tokens).toHaveTextContent('lets a program you trust add transactions to this budget')
    expect(tokens).toHaveTextContent('A token is shown only once, when you create it.')
    expect(tokens).toHaveTextContent('To stop one, choose Revoke beside it below')
    expect(tokens).not.toHaveTextContent('docs/')
    expect(tokens).not.toHaveTextContent('project')
  })
})

describe('changing the password while signed in [R-AUTH-531]', () => {
  it('asks for it twice, at least 8 characters, and saves it with updateUser', async () => {
    const supabaseMock = open()
    const form = await screen.findByTestId('password-form')
    await userEvent.type(within(form).getByLabelText('New password'), 'short')
    await userEvent.type(within(form).getByLabelText('Confirm password'), 'short')
    await userEvent.click(within(form).getByRole('button', { name: 'Change password' }))
    expect(await within(form).findByText(/at least 8 characters/)).toBeInTheDocument()

    await userEvent.clear(within(form).getByLabelText('New password'))
    await userEvent.type(within(form).getByLabelText('New password'), 'harbour-kite-77')
    await userEvent.clear(within(form).getByLabelText('Confirm password'))
    await userEvent.type(within(form).getByLabelText('Confirm password'), 'harbour-kite-78')
    await userEvent.click(within(form).getByRole('button', { name: 'Change password' }))
    expect(await within(form).findByText('The passwords do not match.')).toBeInTheDocument()
    expect(supabaseMock.client.auth.updateUser).not.toHaveBeenCalled()

    await userEvent.clear(within(form).getByLabelText('Confirm password'))
    await userEvent.type(within(form).getByLabelText('Confirm password'), 'harbour-kite-77')
    await userEvent.click(within(form).getByRole('button', { name: 'Change password' }))
    await waitFor(() => {
      expect(supabaseMock.client.auth.updateUser).toHaveBeenCalledWith({
        password: 'harbour-kite-77',
      })
    })
    expect(await screen.findByText('Password changed.')).toBeInTheDocument()
    expect(within(form).getByLabelText('New password')).toHaveValue('')
  })

  it('says clearly when the password is refused', async () => {
    const supabaseMock = open()
    supabaseMock.client.auth.updateUser.mockImplementation(() =>
      Promise.resolve({
        data: { user: null },
        error: new AuthError('same', 422, 'same_password'),
      }),
    )
    const form = await screen.findByTestId('password-form')
    await userEvent.type(within(form).getByLabelText('New password'), 'harbour-kite-77')
    await userEvent.type(within(form).getByLabelText('Confirm password'), 'harbour-kite-77')
    await userEvent.click(within(form).getByRole('button', { name: 'Change password' }))
    expect(
      await within(form).findByText('Choose a password different from your current one.'),
    ).toBeInTheDocument()
  })
})
