import { screen, within } from '@testing-library/react'

import { routes } from '@/app/routes'
import { formatMoney } from '@/lib/money'
import { categoriesDb, categoryRow, periodRow } from '@/test/budget-fixtures'
import type { MockDb } from '@/test/mock-db'
import { renderRoutes } from '@/test/render'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'
import { warmPages } from '@/test/warm'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

const money = (rappen: number) => formatMoney(rappen).replace(/\s/g, ' ')
const plain = (element: HTMLElement) => element.textContent.replace(/\s/g, ' ')

beforeAll(() => warmPages('budget', 'dashboard'))

/** A progress row as get_period_progress answers it. */
function progressRow(overrides: Record<string, unknown>) {
  return {
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
    committed: 0,
    transfer_committed: 0,
    ...overrides,
  }
}

/**
 * Hobbies: CHF 150 planned, a transfer ("Pocket money") commits CHF 200 there. Groceries: CHF 900
 * planned, CHF 29.90 of subscriptions and CHF 100 of transfers inside it. The period: CHF 3000
 * planned, CHF 151.82 of subscriptions and CHF 1300 of transfers.
 */
function committedDb(): MockDb {
  const db = categoriesDb({
    period_summaries: [
      periodRow({
        expected_total: 300_000,
        committed_total: 15_182,
        transfer_committed_total: 130_000,
      }),
    ],
  })
  db.tables.category_overview = [
    ...db.tables.category_overview.map((row) =>
      row.id === 'cat-groceries'
        ? categoryRow({ ...row, committed_amount: 2_990, transfer_committed_amount: 10_000 })
        : row,
    ),
    categoryRow({
      id: 'cat-hobbies',
      name: 'Hobbies',
      sort_order: 4,
      amount: 15_000,
      monthly_amount: 15_000,
      transfer_committed_amount: 20_000,
    }),
  ]
  db.rpc.get_period_progress.mockImplementation(() => [
    progressRow({ committed: 2_990, transfer_committed: 10_000 }),
    progressRow({
      category_id: 'cat-hobbies',
      name: 'Hobbies',
      amount: 15_000,
      expected: 15_000,
      spent: 0,
      result: 15_000,
      display_order: 1,
      transfer_committed: 20_000,
    }),
  ])
  return db
}

function rowNamed(rows: HTMLElement[], name: string): HTMLElement {
  const row = rows.find((item) => within(item).queryByText(name) !== null)
  if (!row) throw new Error(`no row ${name}`)
  return row
}

describe('the transfers’ committed amount, apart from the subscriptions’ [R-PROGRESS-530]', () => {
  it('is shown on the budget page under the period’s plan and under each category’s amount', async () => {
    mock.current = createSupabaseMock(fakeSession(), committedDb())
    renderRoutes(routes, '/budget')
    const groceries = rowNamed(await screen.findAllByTestId('category-row'), 'Groceries')
    const committed = within(groceries).getByTestId('category-committed')
    expect(plain(within(committed).getByTestId('committed-subscriptions'))).toBe(
      `incl. ${money(2_990)} for subscriptions`,
    )
    expect(plain(within(committed).getByTestId('committed-transfers'))).toBe(
      `incl. ${money(10_000)} for planned transfers`,
    )
    const total = screen.getByTestId('total-expected')
    expect(plain(within(total).getByTestId('committed-subscriptions'))).toBe(
      `Includes ${money(15_182)} for subscriptions`,
    )
    expect(plain(within(total).getByTestId('committed-transfers'))).toBe(
      `Includes ${money(130_000)} for planned transfers`,
    )
    // The two figures are never added into one.
    expect(plain(document.body)).not.toContain(money(145_182))
    expect(plain(document.body)).not.toContain(money(12_990))
  })

  it('is shown in the period progress, for the period and per category, from the database’s figures', async () => {
    mock.current = createSupabaseMock(fakeSession(), committedDb())
    renderRoutes(routes, '/')
    const totals = await screen.findByTestId('progress-totals')
    const committed = within(totals).getByTestId('progress-committed')
    expect(plain(within(committed).getByTestId('committed-transfers'))).toBe(
      `Includes ${money(130_000)} for planned transfers`,
    )
    const groceries = rowNamed(await screen.findAllByTestId('progress-row'), 'Groceries')
    const sentence = within(groceries).getByTestId('row-committed')
    expect(plain(within(sentence).getByTestId('committed-subscriptions'))).toBe(
      `The ${money(90_000)} planned include ${money(2_990)} for subscriptions`,
    )
    expect(plain(within(sentence).getByTestId('committed-transfers'))).toBe(
      `The ${money(90_000)} planned include ${money(10_000)} for planned transfers`,
    )
    expect(plain(groceries)).toContain(`incl. ${money(10_000)} for planned transfers`)
  })
})

describe('a commitment above the plan [R-PROGRESS-531]', () => {
  it('is said in words on the budget page, beside the name and under the amount', async () => {
    const db = committedDb()
    db.tables.category_overview = db.tables.category_overview.map((row) =>
      row.id === 'cat-rent'
        ? categoryRow({ ...row, monthly_amount: 4_000, committed_amount: 4_382 })
        : row,
    )
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/budget')
    const rows = await screen.findAllByTestId('category-row')
    const rent = rowNamed(rows, 'Rent')
    expect(within(rent).getByTestId('over-committed-badge')).toHaveTextContent(
      'Committed above plan',
    )
    expect(plain(within(rent).getByTestId('category-committed'))).toBe(
      `${money(4_382)} committed for subscriptions`,
    )
    const hobbies = rowNamed(rows, 'Hobbies')
    expect(within(hobbies).getByTestId('over-committed-badge')).toBeInTheDocument()
    expect(plain(within(hobbies).getByTestId('category-committed'))).toBe(
      `${money(20_000)} committed for planned transfers`,
    )
    // Inside the plan: no badge, "incl.".
    const groceries = rowNamed(rows, 'Groceries')
    expect(within(groceries).queryByTestId('over-committed-badge')).not.toBeInTheDocument()
  })

  it('counts both committed figures together against the plan', async () => {
    const db = committedDb()
    // CHF 30 + CHF 30 committed in a CHF 40 plan: neither alone is above it, together they are.
    db.tables.category_overview = db.tables.category_overview.map((row) =>
      row.id === 'cat-rent'
        ? categoryRow({
            ...row,
            monthly_amount: 4_000,
            committed_amount: 3_000,
            transfer_committed_amount: 3_000,
          })
        : row,
    )
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/budget')
    const rent = rowNamed(await screen.findAllByTestId('category-row'), 'Rent')
    expect(within(rent).getByTestId('over-committed-badge')).toBeInTheDocument()
  })

  it('is one sentence under the period’s plan and on a narrow progress card', async () => {
    const db = committedDb()
    db.tables.period_summaries = [
      periodRow({ expected_total: 10_000, committed_total: 15_182, transfer_committed_total: 0 }),
    ]
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/')
    const totals = await screen.findByTestId('progress-totals')
    expect(plain(within(totals).getByTestId('committed-over'))).toBe(
      `More is committed than planned: ${money(15_182)} for subscriptions, against ${money(10_000)} planned.`,
    )
    const hobbies = rowNamed(await screen.findAllByTestId('progress-row'), 'Hobbies')
    expect(within(hobbies).getByTestId('over-committed-badge')).toHaveTextContent(
      'Committed above plan',
    )
    expect(plain(within(hobbies).getByTestId('committed-over'))).toBe(
      `More is committed than planned: ${money(20_000)} for planned transfers, against ${money(15_000)} planned.`,
    )
  })
})
