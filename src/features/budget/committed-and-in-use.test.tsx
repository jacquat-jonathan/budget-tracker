import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { formatMoney } from '@/lib/money'
import { renderRoutes } from '@/test/render'
import {
  categoriesDb,
  categoryRow,
  debtRow,
  periodRow,
  subscriptionRow,
} from '@/test/budget-fixtures'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

const money = (rappen: number) => formatMoney(rappen).replace(/\s/g, ' ')

describe('a category in use [R-CATEGORY-120]', () => {
  it('says what uses it before a removal is tried, and does not offer it', async () => {
    const db = categoriesDb()
    db.tables.category_overview = db.tables.category_overview.map((row) =>
      row.id === 'cat-rent' ? categoryRow({ ...row, in_use: true }) : row,
    )
    db.tables.debt_overview = [debtRow({ category_id: 'cat-rent', category_name: 'Rent' })]
    db.tables.subscription_overview = [
      subscriptionRow({ category_id: 'cat-rent', name: 'Rent insurance' }),
      subscriptionRow({ id: 'other', category_id: 'cat-groceries', name: 'Groceries box' }),
    ]
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/budget')
    const rent = (await screen.findAllByTestId('category-row')).find((row) =>
      row.textContent.includes('Rent'),
    )!
    await userEvent.click(within(rent).getAllByRole('button', { name: 'Actions for Rent' })[0]!)
    await userEvent.click(await screen.findByRole('menuitem', { name: /^Remove/ }))
    const dialog = await screen.findByRole('alertdialog')
    const notice = await within(dialog).findByTestId('category-in-use')
    await within(notice).findByText('Debt “Car loan”')
    expect(within(notice).getByText('Subscription “Rent insurance”')).toBeInTheDocument()
    expect(within(notice).queryByText(/Groceries box/)).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Remove from now on' })).toBeDisabled()
    expect(db.rpc.end_category).not.toHaveBeenCalled()
  })
})

describe('committed figures [R-PROGRESS-120]', () => {
  it('shows what subscriptions commit inside the plan, on the budget and in the progress', async () => {
    const db = categoriesDb({
      period_summaries: [periodRow({ expected_total: 300_000, committed_total: 2_990 })],
    })
    db.tables.category_overview = db.tables.category_overview.map((row) =>
      row.id === 'cat-groceries' ? categoryRow({ ...row, committed_amount: 2_990 }) : row,
    )
    db.rpc.get_period_progress.mockImplementation(() => [
      {
        category_id: 'cat-groceries',
        parent_id: null,
        name: 'Groceries',
        is_group: false,
        in_force: true,
        amount: 90_000,
        cadence: 'monthly',
        expected: 90_000,
        spent: 1_990,
        result: 88_010,
        is_overspent: false,
        transaction_count: 1,
        display_order: 0,
        committed: 2_990,
      },
    ])
    mock.current = createSupabaseMock(fakeSession(), db)
    const { unmount } = renderRoutes(routes, '/budget')
    expect(await screen.findByTestId('category-committed')).toHaveTextContent(
      `of which ${money(2_990)} committed to subscriptions`,
    )
    expect(screen.getByTestId('total-expected')).toHaveTextContent(
      `of which ${money(2_990)} committed`,
    )
    unmount()

    renderRoutes(routes, '/')
    expect(await screen.findByTestId('row-committed')).toHaveTextContent(
      `of which ${money(2_990)} committed`,
    )
    expect(screen.getByTestId('progress-committed')).toHaveTextContent(
      `of which ${money(2_990)} committed`,
    )
  })
})

describe('reopen preview of step 4 records [R-PERIOD-053]', () => {
  it('names subscriptions and debts, and the interest a reopen removes', async () => {
    const db = categoriesDb()
    db.rpc.preview_reopen.mockImplementation(() => [
      {
        record_kind: 'debt',
        record_id: 'debt-car',
        record_name: 'Car loan',
        change: 'interest_removed',
        replaces_previous: false,
      },
      {
        record_kind: 'subscription',
        record_id: 'sub-1',
        record_name: 'Netflix',
        change: 'removed',
        replaces_previous: false,
      },
    ])
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/periods')
    await userEvent.click((await screen.findAllByRole('button', { name: /^Actions for/ }))[0]!)
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'This period’s salary has not arrived yet' }),
    )
    const preview = await screen.findByTestId('reopen-preview')
    expect(preview).toHaveTextContent(
      'Debt “Car loan”: the interest added when this period started goes',
    )
    expect(preview).toHaveTextContent('Subscription “Netflix”: it will disappear')
  })
})
