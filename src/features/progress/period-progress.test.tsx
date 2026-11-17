import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { renderRoutes } from '@/test/render'
import { categoriesDb, periodRow } from '@/test/budget-fixtures'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

const row = (overrides: Record<string, unknown>) => ({
  category_id: 'cat-groceries',
  parent_id: null,
  name: 'Groceries',
  is_group: false,
  in_force: true,
  amount: 90_000,
  cadence: 'monthly',
  expected: 90_000,
  spent: 18_635,
  result: 71_365,
  is_overspent: false,
  transaction_count: 3,
  display_order: 1,
  ...overrides,
})

/** The current period (23.10 – 24.11) with a surplus, the previous one with a deficit. */
function progressDb() {
  const db = categoriesDb({
    period_summaries: [
      periodRow({
        id: 'period-1',
        seq: 1,
        start_date: '2026-09-25',
        end_date: '2026-10-22',
        is_current: false,
        income_total: 650_000,
        expected_total: 300_000,
        spent_total: 700_000,
        left_to_assign: 350_000,
        result: -50_000,
      }),
      periodRow({
        income_total: 885_000,
        expected_total: 401_000,
        spent_total: 326_435,
        left_to_assign: 484_000,
        result: 558_565,
      }),
    ],
  })
  db.rpc.get_period_progress.mockImplementation((args) =>
    args.p_period_id === 'period-2'
      ? [
          row({
            category_id: 'cat-rent',
            name: 'Rent',
            expected: 210_000,
            spent: 210_000,
            result: 0,
            display_order: 0,
          }),
          row({}),
          row({
            category_id: 'cat-insurance',
            name: 'Insurance',
            is_group: true,
            amount: null,
            cadence: null,
            expected: 56_000,
            spent: 48_000,
            result: 8_000,
            display_order: 2,
          }),
          row({
            category_id: 'cat-health',
            parent_id: 'cat-insurance',
            name: 'Health',
            expected: 48_000,
            spent: 48_000,
            result: 0,
            display_order: 3,
          }),
          row({
            category_id: 'cat-leisure',
            name: 'Leisure',
            expected: 30_000,
            spent: 41_200,
            result: -11_200,
            is_overspent: true,
            display_order: 4,
          }),
          row({
            category_id: 'cat-hobby',
            name: 'Old hobby',
            in_force: false,
            expected: 0,
            spent: 1_500,
            result: -1_500,
            is_overspent: true,
            display_order: 5,
          }),
        ]
      : [row({ name: 'Groceries', spent: 700_000, result: -610_000, is_overspent: true })],
  )
  return db
}

describe('period progress [R-PROGRESS-050]', () => {
  it('shows the current period by default: totals, each category, overspending and the surplus', async () => {
    const db = progressDb()
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/')

    const card = await screen.findByTestId('period-progress')
    expect(await within(card).findByTestId('progress-period')).toHaveTextContent(
      '23.10.2026 – 24.11.2026',
    )
    await within(card).findAllByTestId('progress-row')
    const totals = within(card).getByTestId('progress-totals')
    expect(totals).toHaveTextContent("IncomeCHF 8'850.00")
    expect(totals).toHaveTextContent("PlannedCHF 4'010.00")
    expect(totals).toHaveTextContent("CHF 4'840.00 left to assign")
    expect(totals).toHaveTextContent("SpentCHF 3'264.35")
    expect(within(card).getByTestId('progress-result')).toHaveTextContent("SurplusCHF 5'585.65")

    const rows = within(card).getAllByTestId('progress-row')
    expect(rows.map((item) => item.querySelector('a')?.textContent)).toEqual([
      'Rent',
      'Groceries',
      'Insurance',
      'Health',
      'Leisure',
      'Old hobby',
    ])
    // R-PROGRESS-071: overspent at a glance, from the database's flag.
    const leisure = rows[4]!
    expect(leisure).toHaveAttribute('data-overspent', 'true')
    expect(within(leisure).getByText('Overspent')).toBeInTheDocument()
    expect(within(leisure).getByTestId('progress-row-result')).toHaveTextContent('CHF -112.00')
    // R-PROGRESS-091: spending on a category not planned then still shows.
    expect(within(rows[5]!).getByText('Not planned')).toBeInTheDocument()
    // Each row leads to its transactions in that period.
    expect(within(rows[1]!).getByRole('link', { name: 'Groceries' })).toHaveAttribute(
      'href',
      '/transactions?period=period-2&category=cat-groceries',
    )
    expect(db.rpc.get_period_progress).toHaveBeenCalledWith({ p_period_id: 'period-2' })
  })

  it('every figure of a row has its column header for assistive technology', async () => {
    mock.current = createSupabaseMock(fakeSession(), progressDb())
    renderRoutes(routes, '/')
    const card = await screen.findByTestId('period-progress')
    const table = await within(card).findByRole('table', { name: 'Progress per category' })
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Category', 'Planned', 'Spent', 'Left'])
    const leisure = within(table).getAllByRole('row')[5]!
    expect(within(leisure).getByRole('rowheader')).toHaveTextContent('Leisure')
    expect(
      within(leisure)
        .getAllByRole('cell')
        // The money formatter's space is a no-break space.
        .map((c) => c.textContent.replace(/\u00a0/g, ' ')),
    ).toEqual(['CHF 300.00', 'CHF 412.00', 'LeftCHF -112.00'])
  })

  it('browses to a past period and back [R-COMPARE-001]', async () => {
    const db = progressDb()
    mock.current = createSupabaseMock(fakeSession(), db)
    const { router } = renderRoutes(routes, '/')
    const card = await screen.findByTestId('period-progress')
    await within(card).findAllByTestId('progress-row')

    await userEvent.click(within(card).getByRole('button', { name: 'Previous period' }))
    await waitFor(() => {
      expect(within(card).getByTestId('progress-period')).toHaveTextContent(
        '25.09.2026 – 22.10.2026',
      )
    })
    expect(router.state.location.search).toBe('?period=period-1')
    expect(within(card).getByTestId('progress-result')).toHaveTextContent('DeficitCHF -500.00')
    await waitFor(() => {
      expect(db.rpc.get_period_progress).toHaveBeenCalledWith({ p_period_id: 'period-1' })
    })
    expect(within(card).getByRole('button', { name: 'Previous period' })).toBeDisabled()

    await userEvent.click(within(card).getByRole('button', { name: 'Back to the current period' }))
    await waitFor(() => {
      expect(within(card).getByTestId('progress-period')).toHaveTextContent(
        '23.10.2026 – 24.11.2026',
      )
    })
    expect(router.state.location.search).toBe('')
  })

  it('the Periods page links each period to its progress', async () => {
    const db = progressDb()
    mock.current = createSupabaseMock(fakeSession(), db)
    const { router } = renderRoutes(routes, '/periods')
    const link = await screen.findByRole('link', {
      name: 'See the progress of the period 25.09.2026 – 22.10.2026',
    })
    await act(() => userEvent.click(link))
    await waitFor(() => {
      expect(router.state.location.search).toBe('?period=period-1')
    })
    expect(await screen.findByTestId('progress-period')).toHaveTextContent(
      '25.09.2026 – 22.10.2026',
    )
  })
})

describe('reopen confirmation lists categories too [R-PERIOD-053]', () => {
  it('words a category’s changes as plans', async () => {
    const db = progressDb()
    db.rpc.preview_reopen.mockImplementation(() => [
      {
        record_kind: 'category',
        record_id: 'c1',
        record_name: 'Groceries',
        change: 'terms_changed',
        replaces_previous: true,
      },
      {
        record_kind: 'category',
        record_id: 'c2',
        record_name: 'Gifts',
        change: 'removed',
        replaces_previous: false,
      },
    ])
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/periods')
    const rows = await screen.findAllByTestId('period-row')
    await userEvent.click(
      within(rows[0]!).getByRole('button', {
        name: 'Actions for the period 23.10.2026 – 24.11.2026',
      }),
    )
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'This period’s salary has not arrived yet' }),
    )
    const preview = await screen.findByTestId('reopen-preview')
    expect(preview).toHaveTextContent(
      'Category “Groceries”: its new amount will apply to the reopened period. It replaces what the reopened period had for it.',
    )
    expect(preview).toHaveTextContent(
      'Category “Gifts”: it will disappear: it would never be planned. If it has transactions, it is kept without an amount',
    )
  })
})
