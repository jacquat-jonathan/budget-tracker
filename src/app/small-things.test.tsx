import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { MetaLine } from '@/components/meta-line'
import {
  budgetRow,
  categoriesDb,
  categoryRow,
  householdDb,
  periodRow,
  transactionRow,
} from '@/test/budget-fixtures'
import { renderRoutes } from '@/test/render'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'
import { warmPages } from '@/test/warm'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

beforeAll(() => warmPages('budget', 'income', 'dashboard', 'transactions', 'settings'))

describe('the "earlier period" sentence [R-APP-534]', () => {
  it('mentions the choice of an earlier period only when one is offered', async () => {
    // One period only: nothing earlier to choose.
    mock.current = createSupabaseMock(
      fakeSession(),
      categoriesDb({ period_summaries: [periodRow()] }),
    )
    const { unmount } = renderRoutes(routes, '/budget')
    await userEvent.click(await screen.findByRole('button', { name: 'Add category' }))
    let dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(
      'It is planned from the current period. Past periods are unchanged.',
    )
    expect(dialog).not.toHaveTextContent('unless you choose an earlier one')
    unmount()

    // Two periods: the choice is there, and the sentence names it.
    mock.current = createSupabaseMock(fakeSession(), categoriesDb())
    renderRoutes(routes, '/budget')
    await userEvent.click(await screen.findByRole('button', { name: 'Add category' }))
    dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('unless you choose an earlier one')
  })

  it('says the same for an income', async () => {
    mock.current = createSupabaseMock(
      fakeSession(),
      householdDb(undefined, { period_summaries: [periodRow()] }),
    )
    renderRoutes(routes, '/income')
    await userEvent.click(await screen.findByRole('button', { name: 'Add income' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(
      'It counts from the current period. Past periods are unchanged.',
    )
  })
})

describe('a metadata line [R-APP-535]', () => {
  it('glues each dot to the part before it, so a wrapped line never starts with one', () => {
    render(
      <MetaLine
        testId="meta"
        parts={[
          { key: 'a', content: 'Refund', className: 'sm:hidden' },
          null,
          { key: 'b', content: 'Groceries' },
          { key: 'c', content: 'Recorded by Ann' },
        ]}
      />,
    )
    const line = screen.getByTestId('meta')
    const parts = [...line.children] as HTMLElement[]
    expect(parts).toHaveLength(3)
    // The part hidden on wide screens takes its own dot with it.
    expect(parts[0]).toHaveClass('sm:hidden')
    expect(parts[0]?.textContent).toBe('Refund · ')
    expect(parts[1]?.textContent).toBe('Groceries · ')
    expect(parts[2]?.textContent).toBe('Recorded by Ann')
    expect(line.textContent.startsWith('·')).toBe(false)
  })

  it('is used for a refund row on the transactions page', async () => {
    const db = householdDb(undefined, {
      transaction_list: [transactionRow({ kind: 'refund', description: 'Returned bottles' })],
    })
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/transactions?period=all')
    const meta = await screen.findByTestId('transaction-meta')
    expect(meta.firstElementChild).toHaveClass('sm:hidden')
    expect(meta.firstElementChild?.textContent).toBe('Refund · ')
  })
})

describe('the "To categorise" row of a period [R-PROGRESS-532]', () => {
  it('is left out where nothing is in it, and shown where something is', async () => {
    const db = categoriesDb()
    db.tables.my_budgets = [budgetRow({ to_categorise_category_id: 'cat-tc' })]
    db.tables.category_overview.push(
      categoryRow({
        id: 'cat-tc',
        name: 'To categorise',
        amount: 0,
        monthly_amount: 0,
        is_to_categorise: true,
      }),
    )
    const row = (overrides: Record<string, unknown>) => ({
      category_id: 'cat-groceries',
      parent_id: null,
      name: 'Groceries',
      is_group: false,
      in_force: true,
      amount: 90_000,
      cadence: 'monthly',
      expected: 90_000,
      spent: 1_000,
      result: 89_000,
      is_overspent: false,
      transaction_count: 1,
      display_order: 0,
      committed: 0,
      transfer_committed: 0,
      ...overrides,
    })
    const empty = row({
      category_id: 'cat-tc',
      name: 'To categorise',
      amount: 0,
      expected: 0,
      spent: 0,
      result: 0,
      transaction_count: 0,
      display_order: 1,
    })
    db.rpc.get_period_progress.mockImplementation(() => [row({}), empty])
    mock.current = createSupabaseMock(fakeSession(), db)
    const { unmount } = renderRoutes(routes, '/')
    await waitFor(() => expect(screen.getAllByTestId('progress-row')).toHaveLength(1))
    expect(screen.queryByText('To categorise', { selector: 'a' })).not.toBeInTheDocument()
    unmount()

    db.rpc.get_period_progress.mockImplementation(() => [
      row({}),
      { ...empty, spent: 2_000, result: -2_000, transaction_count: 1 },
    ])
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/')
    await waitFor(() => expect(screen.getAllByTestId('progress-row')).toHaveLength(2))
  })
})

describe('skip to content [R-APP-538]', () => {
  it('is the first stop of the keyboard and moves the focus to the page', async () => {
    mock.current = createSupabaseMock(fakeSession(), householdDb())
    renderRoutes(routes, '/')
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 })
    await userEvent.tab()
    const skip = screen.getByRole('link', { name: 'Skip to content' })
    expect(skip).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(document.getElementById('main-content')).toHaveFocus()
    expect(
      within(document.getElementById('main-content')!).getByRole('heading', { level: 1 }),
    ).toBeInTheDocument()
  })
})

describe('a name already used [R-APP-539]', () => {
  it('is warned about at the category’s name, and can still be saved', async () => {
    const db = categoriesDb()
    db.rpc.create_category.mockImplementation(() => [categoryRow({ id: 'cat-new', name: 'rent' })])
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/budget')
    await userEvent.click(await screen.findByRole('button', { name: 'Add category' }))
    const dialog = await screen.findByRole('dialog')
    const name = within(dialog).getByLabelText('Name')
    await userEvent.type(name, 'Groceries2')
    expect(within(dialog).queryByTestId('field-warning')).not.toBeInTheDocument()
    await userEvent.clear(name)
    await userEvent.type(name, ' rent ')
    expect(await within(dialog).findByTestId('field-warning')).toHaveTextContent(
      'Another category is already called “rent”: both will look the same in lists. You can still save it.',
    )
    expect(name).toHaveAccessibleDescription(/Another category is already called/)
    await userEvent.type(within(dialog).getByLabelText('Amount per month'), '100')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(db.rpc.create_category).toHaveBeenCalled())
  })

  it('is warned about at a budget’s name', async () => {
    const db = householdDb()
    db.tables.my_budgets = [
      budgetRow(),
      budgetRow({ id: 'bbbbbbbb-0000-0000-0000-000000000002', name: 'Zermatt chalet' }),
    ]
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/settings')
    const section = await screen.findByTestId('settings-budget')
    const name = await within(section).findByLabelText('Budget name')
    await userEvent.clear(name)
    await userEvent.type(name, 'zermatt Chalet')
    expect(await within(section).findByTestId('field-warning')).toHaveTextContent(
      'You already have a budget called “zermatt Chalet”',
    )
  })
})
