import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { mainNavItems } from '@/app/navigation'
import { routes } from '@/app/routes'
import type { CategoryLine, ComparisonRow, TrendPeriod } from '@/features/compare/compare-queries'
import { BUDGET_ID, budgetRow, householdDb, periodRow } from '@/test/budget-fixtures'
import { rpcError, type MockDb } from '@/test/mock-db'
import { renderRoutes } from '@/test/render'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

/** Three periods of different lengths, the last one running. */
const P1 = { id: 'p-1', start: '2026-09-25', end: '2026-10-25', days: 31 }
const P2 = { id: 'p-2', start: '2026-10-26', end: '2026-11-13', days: 19 }
const P3 = { id: 'p-3', start: '2026-11-14', end: '2026-12-24', days: 41 }

function trendRow(period: typeof P1, overrides: Partial<TrendPeriod> = {}): TrendPeriod {
  return {
    period_id: period.id,
    seq: Number(period.id.slice(2)),
    start_date: period.start,
    end_date: period.end,
    days: period.days,
    is_current: period === P3,
    is_completed: period !== P3,
    income_total: 720_000,
    salary_total: 720_000,
    extra_income_total: 0,
    spent_total: 400_000,
    expected_total: 609_000,
    committed_total: 10_390,
    result: 320_000,
    completed_count: 2,
    average_income: 723_456,
    average_spent: 411_111,
    average_result: 312_345,
    ...overrides,
  }
}

const TREND = [
  trendRow(P1, { spent_total: 497_635, result: 222_365 }),
  trendRow(P2, { spent_total: 2_390, result: 717_610 }),
  trendRow(P3, { income_total: 870_000, spent_total: -1_234_567, result: 2_104_567 }),
]
const IDS = TREND.map((row) => row.period_id)

function line(overrides: Partial<CategoryLine> & Pick<CategoryLine, 'category_id' | 'name'>) {
  return {
    parent_id: null,
    is_group: false,
    display_order: 0,
    period_ids: IDS,
    in_force: [true, true, true],
    planned: [50_000, 50_000, 50_000],
    spent: [10_000, 20_000, 30_000],
    committed: [0, 0, 0],
    transaction_count: [1, 1, 1],
    completed_count: 2,
    average_spent: 15_000,
    ...overrides,
  } satisfies CategoryLine
}

const LINES: CategoryLine[] = [
  line({
    category_id: 'c-home',
    name: 'Home',
    is_group: true,
    planned: [200_000, 200_000, 200_000],
    spent: [210_000, 190_000, 180_000],
    average_spent: 200_000,
  }),
  line({
    category_id: 'c-rent',
    parent_id: 'c-home',
    name: 'Rent',
    planned: [180_000, 180_000, 180_000],
    spent: [180_000, 180_000, 180_000],
    average_spent: 180_000,
  }),
  line({
    category_id: 'c-power',
    parent_id: 'c-home',
    name: 'Electricity',
    display_order: 1,
    planned: [20_000, 20_000, 20_000],
    spent: [30_000, 10_000, 0],
    average_spent: 20_000,
  }),
  line({ category_id: 'c-food', name: 'Food', display_order: 1, average_spent: 90_000 }),
  line({
    category_id: 'c-garden',
    name: 'Garden',
    display_order: 2,
    in_force: [true, false, true],
    planned: [9_000, null, 9_000],
    spent: [4_000, 0, 1_000],
    average_spent: 2_000,
  }),
  line({ category_id: 'c-gifts', name: 'Gifts', display_order: 3, average_spent: 50_000 }),
  line({ category_id: 'c-car', name: 'Car', display_order: 4, average_spent: 1_000 }),
]

function totalRow(overrides: Partial<ComparisonRow> = {}): ComparisonRow {
  return {
    kind: 'total',
    category_id: null,
    parent_id: null,
    name: null,
    is_group: null,
    display_order: null,
    a_period_id: P2.id,
    a_start_date: P2.start,
    a_end_date: P2.end,
    a_days: P2.days,
    b_period_id: P3.id,
    b_start_date: P3.start,
    b_end_date: P3.end,
    b_days: P3.days,
    a_in_force: null,
    b_in_force: null,
    a_planned: 609_000,
    b_planned: 609_000,
    planned_difference: 0,
    a_spent: 2_390,
    b_spent: 378_218,
    spent_difference: 375_828,
    a_committed: 10_390,
    b_committed: 10_390,
    committed_difference: 0,
    a_transaction_count: null,
    b_transaction_count: null,
    a_income: 720_000,
    b_income: 870_000,
    income_difference: 150_000,
    a_result: 717_610,
    b_result: 491_782,
    result_difference: -225_828,
    ...overrides,
  }
}

function sideRow(overrides: Partial<ComparisonRow>): ComparisonRow {
  return totalRow({
    kind: 'category',
    parent_id: null,
    is_group: false,
    display_order: 0,
    a_in_force: true,
    b_in_force: true,
    a_income: null,
    b_income: null,
    income_difference: null,
    a_result: null,
    b_result: null,
    result_difference: null,
    a_transaction_count: 1,
    b_transaction_count: 1,
    ...overrides,
  })
}

const SIDE: ComparisonRow[] = [
  totalRow(),
  sideRow({
    category_id: 'c-food',
    name: 'Food',
    a_spent: 2_390,
    b_spent: 1_000,
    spent_difference: -1_390,
  }),
  sideRow({
    category_id: 'c-garden',
    name: 'Garden',
    display_order: 1,
    a_in_force: false,
    a_planned: null,
    a_spent: null,
    b_spent: 60_000,
    spent_difference: 60_000,
  }),
  sideRow({
    category_id: 'c-gifts',
    name: 'Gifts',
    display_order: 2,
    a_spent: 0,
    b_spent: 0,
    spent_difference: 0,
  }),
]

function compareDb(
  options: { trend?: TrendPeriod[]; lines?: CategoryLine[]; side?: ComparisonRow[] } = {},
): MockDb {
  const db = householdDb(undefined, {
    period_summaries: [P1, P2, P3].map((period, index) =>
      periodRow({
        id: period.id,
        seq: index + 1,
        start_date: period.start,
        end_date: period.end,
        is_current: period === P3,
      }),
    ),
  })
  db.rpc.get_period_trend.mockImplementation(() => options.trend ?? TREND)
  db.rpc.get_category_trend.mockImplementation(() => options.lines ?? LINES)
  db.rpc.get_period_comparison.mockImplementation(() => options.side ?? SIDE)
  return db
}

function open(db: MockDb, path: string) {
  mock.current = createSupabaseMock(fakeSession(), db)
  renderRoutes(routes, path)
}

/** Text with the narrow spaces and apostrophes of the formatted amounts made plain. */
const plain = (element: HTMLElement) =>
  element.textContent.replace(/[\u202f\u00a0]/g, ' ').replace(/\s+/g, ' ')

describe('the compare page [R-COMPARE-190]', () => {
  it('is in the sidebar and keeps its view and choices in the address', async () => {
    expect(mainNavItems.map((item) => item.key).slice(0, 2)).toEqual(['dashboard', 'compare'])
    expect(mainNavItems[1]?.path).toBe('/compare')
    const db = compareDb()
    open(db, '/compare')
    expect(await screen.findByTestId('trend-view')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Trend' })).toHaveAttribute('aria-current', 'page')
    expect(db.rpc.get_period_trend).toHaveBeenCalledWith(expect.objectContaining({ p_count: 12 }))
    await userEvent.click(screen.getByRole('radio', { name: 'Last 24' }))
    await waitFor(() =>
      expect(db.rpc.get_period_trend).toHaveBeenCalledWith(
        expect.objectContaining({ p_count: 24 }),
      ),
    )
    await userEvent.click(screen.getByRole('link', { name: 'Categories' }))
    expect(await screen.findByTestId('categories-view')).toBeInTheDocument()
    expect(db.rpc.get_category_trend).toHaveBeenCalledWith(expect.objectContaining({ p_count: 24 }))
  })

  it('opens the view a link names', async () => {
    open(compareDb(), '/compare?view=side')
    expect(await screen.findByTestId('side-view')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Side by side' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})

describe('the trend [R-COMPARE-191]', () => {
  it('shows each period as the database gives it, the running one marked and not averaged', async () => {
    open(compareDb(), '/compare')
    const table = await screen.findByTestId('trend-table')
    const rows = within(table).getAllByTestId('trend-row')
    // Newest first.
    expect(plain(rows[0]!)).toContain('14.11.2026 – 24.12.2026')
    expect(plain(rows[0]!)).toContain('41 days')
    expect(within(rows[0]!).getByText('Running')).toBeInTheDocument()
    expect(plain(rows[0]!)).toContain("CHF -12'345.67")
    expect(plain(rows[2]!)).toContain("CHF 4'976.35")
    expect(within(rows[2]!).queryByText('Running')).not.toBeInTheDocument()
    const averages = screen.getByTestId('averages')
    expect(plain(averages)).toContain("CHF 7'234.56")
    expect(plain(averages)).toContain("CHF 4'111.11")
    expect(plain(averages)).toContain('over 2 completed periods')
    expect(screen.getByTestId('not-averaged')).toHaveTextContent(
      'The running period (14.11.2026 – 24.12.2026) is shown but never averaged',
    )
    expect(screen.getByTestId('lengths-differ')).toHaveTextContent('(19 to 41 days here)')
    expect(
      screen.getByRole('img', { name: /Income, spending and the planned total/ }),
    ).toBeInTheDocument()
  })

  it('says there is no completed period rather than showing an average of zero', async () => {
    const trend = TREND.map((row) => ({
      ...row,
      completed_count: 0,
      average_income: null,
      average_spent: null,
      average_result: null,
    }))
    open(compareDb({ trend }), '/compare')
    const averages = await screen.findByTestId('averages')
    expect(within(averages).getAllByText('No completed period yet')).toHaveLength(3)
    expect(averages).not.toHaveTextContent('CHF')
  })

  it('offers to open a selected period and to compare it with another', async () => {
    open(compareDb(), '/compare')
    await userEvent.click(
      await screen.findByRole('button', { name: 'Select the period 26.10.2026 – 13.11.2026' }),
    )
    const selected = await screen.findByTestId('trend-selected')
    expect(
      within(selected).getByRole('link', { name: 'Open the period 26.10.2026 – 13.11.2026' }),
    ).toHaveAttribute('href', expect.stringContaining('p-2'))
    expect(
      within(selected).getByRole('link', {
        name: 'Compare the period 26.10.2026 – 13.11.2026 with another',
      }),
    ).toHaveAttribute('href', '/compare?view=side&a=p-2')
  })

  it('needs two periods', async () => {
    open(compareDb({ trend: [TREND[2]!] }), '/compare')
    expect(await screen.findByText('Comparisons need two periods')).toBeInTheDocument()
    expect(screen.getByText(/after this one ends on 24.12.2026/)).toBeInTheDocument()
  })
})

describe('the categories over time [R-COMPARE-192]', () => {
  it('lists every line by period, "—" where not in force, spending above the plan in words', async () => {
    open(compareDb(), '/compare?view=categories')
    const table = await screen.findByTestId('categories-table')
    const garden = within(table)
      .getAllByTestId('category-line')
      .find((row) => row.textContent.includes('Garden'))!
    expect(within(garden).getByText('Not planned in this period')).toBeInTheDocument()
    expect(within(garden).getByText('—')).toBeInTheDocument()
    const home = within(table).getAllByTestId('category-line')[0]!
    expect(within(home).getByText('over the plan')).toBeInTheDocument()
    expect(
      within(home).getByRole('link', { name: /Home, 25.09.2026 – 25.10.2026: CHF.2'100.00 spent/ }),
    ).toHaveAttribute('href', '/transactions?period=p-1&category=c-home')
    // A group opens on its subcategories.
    expect(within(table).queryByText('Electricity')).not.toBeInTheDocument()
    await userEvent.click(
      within(table).getByRole('button', { name: 'Show the subcategories of Home' }),
    )
    expect(within(table).getByText('Electricity')).toBeInTheDocument()
  })

  it('draws the three top-level lines with the highest average, and the lines picked after', async () => {
    open(compareDb(), '/compare?view=categories')
    const legend = await screen.findByTestId('category-legend')
    expect(legend).toHaveTextContent('Home')
    expect(legend).toHaveTextContent('Food')
    expect(legend).toHaveTextContent('Gifts')
    expect(legend).not.toHaveTextContent('Car')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Draw Food in the chart' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Draw Car in the chart' }))
    // Car takes the slot Food left: the others keep theirs (and their colours).
    expect(screen.getByTestId('category-legend').textContent).toBe('HomeCarGifts')
  })

  it('says there are no categories yet', async () => {
    open(compareDb({ lines: [] }), '/compare?view=categories')
    expect(await screen.findByText('No categories yet')).toBeInTheDocument()
  })
})

describe('the two reads of the categories agree [R-COMPARE-193]', () => {
  it('reads both again when their periods differ', async () => {
    const db = compareDb()
    // A period was created between the two calls: the first lines are a range behind.
    db.rpc.get_category_trend.mockImplementationOnce(() =>
      LINES.map((item) => ({ ...item, period_ids: ['p-0', 'p-1', 'p-2'] })),
    )
    open(db, '/compare?view=categories')
    expect(await screen.findByTestId('categories-table')).toBeInTheDocument()
    expect(db.rpc.get_category_trend).toHaveBeenCalledTimes(2)
    expect(db.rpc.get_period_trend).toHaveBeenCalledTimes(2)
  })

  it('reports an error rather than misaligned figures when they keep differing', async () => {
    const db = compareDb({
      lines: LINES.map((item) => ({ ...item, period_ids: ['p-0', 'p-1', 'p-2'] })),
    })
    open(db, '/compare?view=categories')
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByTestId('categories-table')).not.toBeInTheDocument()
  })
})

describe('two periods side by side [R-COMPARE-194]', () => {
  it('leaves the default periods to the database and shows its figures with their direction', async () => {
    const db = compareDb()
    open(db, '/compare?view=side')
    const totals = await screen.findByTestId('side-totals')
    expect(db.rpc.get_period_comparison).toHaveBeenCalledWith({ p_budget_id: BUDGET_ID })
    const spent = within(totals).getByTestId('total-spent')
    expect(plain(spent)).toContain('CHF 23.90')
    expect(plain(spent)).toContain("+CHF 3'758.28")
    expect(within(spent).getByText("CHF 3'758.28 more")).toBeInTheDocument()
    const result = within(totals).getByTestId('total-result')
    expect(within(result).getByText("CHF 2'258.28 less")).toBeInTheDocument()
    expect(screen.getByTestId('side-a-days')).toHaveTextContent('19 days')
    expect(screen.getByTestId('side-b-days')).toHaveTextContent('41 days')
    const rows = screen.getAllByTestId('side-row')
    expect(within(rows[1]!).getByText('nothing in this period')).toBeInTheDocument()
    expect(within(rows[2]!).getByText('no change')).toBeInTheDocument()
  })

  it('sorts by the biggest change and swaps the periods in the address', async () => {
    const db = compareDb()
    open(db, '/compare?view=side&sort=change')
    await screen.findByTestId('side-totals')
    expect(
      screen.getAllByTestId('side-row').map((row) => row.querySelector('th')?.textContent),
    ).toEqual(['Garden', 'Food', 'Gifts'])
    await userEvent.click(screen.getByRole('button', { name: 'Swap the periods' }))
    await waitFor(() =>
      expect(db.rpc.get_period_comparison).toHaveBeenCalledWith({
        p_budget_id: BUDGET_ID,
        p_period_a_id: 'p-3',
        p_period_b_id: 'p-2',
      }),
    )
  })
})

describe('the compare page in its other states [R-COMPARE-195]', () => {
  it('says when the budget has ended', async () => {
    const db = compareDb()
    db.tables.my_budgets = [budgetRow({ end_date: '2026-12-24', end_date_entered: '2026-12-20' })]
    db.rpc.get_current_period.mockImplementation(() => [])
    open(db, '/compare')
    expect(await screen.findByTestId('compare-ended')).toHaveTextContent(
      'Its last period ended on 24.12.2026',
    )
  })

  it('offers to read again after a read error', async () => {
    const db = compareDb()
    db.rpc.get_period_comparison.mockImplementationOnce(() => rpcError('boom', 'XX000'))
    open(db, '/compare?view=side')
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByTestId('side-totals')).toBeInTheDocument()
  })
})
