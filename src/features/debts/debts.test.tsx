import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { formatMoney } from '@/lib/money'
import { renderRoutes } from '@/test/render'
import { BUDGET_ID, categoriesDb, DEBT_ID, debtRow } from '@/test/budget-fixtures'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

/** Amounts as the page shows them, spaces normalised as toHaveTextContent does. */
const money = (rappen: number) => formatMoney(rappen).replace(/\s/g, ' ')

/** The history as the database pages it: newest first when asked (p_newest_first). */
function withOrder<T>(args: Record<string, unknown>, rows: T[]): T[] {
  return args.p_newest_first ? [...rows].reverse() : rows
}

function debtsDb() {
  const db = categoriesDb({
    debt_overview: [
      debtRow(),
      debtRow({
        id: 'debt-card',
        name: 'Credit card',
        remaining: 300_000,
        paid_total: 0,
        interest_rate: 18,
        monthly_payment: 2_000,
        payoff: 'never',
        payments_left: null,
        expected_end_date: null,
      }),
      debtRow({
        id: 'debt-done',
        name: 'Phone',
        remaining: 0,
        paid_total: 60_000,
        interest_rate: 0,
        payoff: 'paid_off',
        payments_left: null,
        expected_end_date: null,
        paid_percent: 100,
      }),
    ],
    // What is still owed in all is the database's figure, never added up on the page.
    debt_totals: [{ budget_id: BUDGET_ID, remaining_total: 1_234_500, owing_count: 2 }],
  })
  db.rpc.get_debt_history.mockImplementation((args) =>
    withOrder(args, [
      {
        entry_id: DEBT_ID,
        kind: 'opened',
        date: '2026-10-23',
        amount: 1_200_000,
        balance: 1_200_000,
        period_id: 'period-2',
        description: null,
        created_at: '2026-10-23T10:00:00+00:00',
      },
      {
        entry_id: 'tx-pay',
        kind: 'payment',
        date: '2026-11-02',
        amount: -50_000,
        balance: 1_150_000,
        period_id: 'period-2',
        description: null,
        created_at: '2026-11-02T10:00:00+00:00',
      },
      {
        entry_id: 'adj-1',
        kind: 'adjustment',
        date: '2026-11-10',
        amount: -2_500,
        balance: 1_147_500,
        period_id: 'period-2',
        description: 'Statement',
        created_at: '2026-11-10T10:00:00+00:00',
      },
    ]),
  )
  return db
}

function card(name: string) {
  const match = screen.getAllByTestId('debt-card').find((item) => item.textContent.includes(name))
  if (!match) throw new Error(`No card for ${name}`)
  return match
}

describe('debts page [R-DEBT-121]', () => {
  it('shows each debt’s remaining amount, rate, payment and projection in words', async () => {
    mock.current = createSupabaseMock(fakeSession(), debtsDb())
    renderRoutes(routes, '/debts')
    await screen.findAllByTestId('debt-card')

    const car = card('Car loan')
    expect(within(car).getByTestId('debt-remaining')).toHaveTextContent(money(1_150_000))
    expect(car).toHaveTextContent('4.875 % per year')
    expect(within(car).getByTestId('payoff')).toHaveTextContent(
      'Ends around November 2028 · 24 payments left',
    )
    expect(within(car).getByTestId('payoff')).toHaveTextContent('An estimate')
    // Never ends: in words, with an icon, not by colour alone.
    expect(within(card('Credit card')).getByTestId('payoff')).toHaveTextContent(
      'Never ends at this payment',
    )
    expect(within(card('Phone')).getByTestId('payoff')).toHaveTextContent('Paid off')
    expect(within(card('Phone')).getByText('No interest')).toBeInTheDocument()
    // The paid share is the database's paid_percent.
    expect(car).toHaveTextContent(`${money(50_000)} paid · 4 %`)
    expect(within(car).getByRole('progressbar', { name: '4 % paid off' })).toBeInTheDocument()
    // The total and the count are debt_totals', not the cards' amounts added up.
    expect(screen.getByTestId('debts-total')).toHaveTextContent(
      `Still owed on 2 debts${money(1_234_500)}`,
    )
  })

  it('says a projected end after the budget’s end, and an overpaid debt by overpaid_by [R-DEBT-121]', async () => {
    const db = debtsDb()
    db.tables.debt_overview = [
      debtRow({ expected_end_after_budget_end: true }),
      debtRow({
        id: 'debt-over',
        name: 'Overpaid',
        remaining: -12_345,
        overpaid_by: 12_345,
        payoff: 'paid_off',
        payments_left: 0,
        expected_end_date: null,
        paid_percent: 100,
      }),
    ]
    db.tables.debt_totals = []
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/debts')
    await screen.findAllByTestId('debt-card')
    expect(within(card('Car loan')).getByTestId('payoff-after-budget-end')).toHaveTextContent(
      'This is after the budget ends.',
    )
    const over = card('Overpaid')
    expect(within(over).getByTestId('debt-remaining')).toHaveTextContent(money(12_345))
    expect(over).toHaveTextContent('Overpaid')
    expect(within(over).getByTestId('payoff')).toHaveTextContent(
      `Paid off · overpaid by ${money(12_345)}`,
    )
    // No debt_totals row: nothing owed.
    expect(screen.getByTestId('debts-total')).toHaveTextContent(
      `Nothing left to pay on your debts${money(0)}`,
    )
  })

  it('says the month of the expected end in French too', async () => {
    const { default: i18n } = await import('@/lib/i18n')
    await i18n.changeLanguage('fr')
    try {
      mock.current = createSupabaseMock(fakeSession(), debtsDb())
      renderRoutes(routes, '/debts')
      await screen.findAllByTestId('debt-card')
      expect(within(card('Car loan')).getByTestId('payoff')).toHaveTextContent(
        'Se termine vers novembre 2028 · 24 remboursements restants',
      )
      expect(within(card('Credit card')).getByTestId('payoff')).toHaveTextContent(
        'Ne se termine jamais à ce rythme',
      )
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('creates a debt with its rate sent exactly as typed', async () => {
    const db = debtsDb()
    db.rpc.create_debt.mockImplementation(() => [debtRow({ id: 'debt-new' })])
    mock.current = createSupabaseMock(fakeSession(), db)
    const { router } = renderRoutes(routes, '/debts')
    await screen.findAllByTestId('debt-card')
    await userEvent.click(screen.getAllByRole('button', { name: 'Add debt' })[0]!)
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Leasing')
    await userEvent.click(within(dialog).getByLabelText('Category of the payments'))
    await userEvent.click(await screen.findByRole('option', { name: 'Groceries' }))
    await userEvent.type(within(dialog).getByLabelText('Amount owed at the start'), "20'000")
    const rate = within(dialog).getByLabelText('Interest rate per year, % (optional)')
    await userEvent.type(rate, '3,1234')
    await userEvent.type(within(dialog).getByLabelText('Planned payment per month'), '450')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByText(/at most three decimals/)).toBeInTheDocument()
    expect(db.rpc.create_debt).not.toHaveBeenCalled()

    await userEvent.clear(rate)
    await userEvent.type(rate, '3,125')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.create_debt).toHaveBeenCalledWith({
        p_client_id: expect.any(String) as unknown,
        p_budget_id: expect.any(String) as string,
        p_name: 'Leasing',
        p_principal: 2_000_000,
        p_category_id: 'cat-groceries',
        p_monthly_payment: 45_000,
        p_interest_rate: 3.125,
      })
    })
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/debts/debt-new')
    })
  })
})

describe('debt detail [R-DEBT-122]', () => {
  it('shows the history as a table next to the chart, newest first a page at a time [R-DEBT-191]', async () => {
    const db = debtsDb()
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, `/debts/${DEBT_ID}`)
    const table = await screen.findByTestId('debt-history')
    const rows = within(table).getAllByTestId('history-row')
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Adjustment'),
      expect.stringContaining('Payment'),
      expect.stringContaining('Opened'),
    ])
    expect(rows[0]).toHaveTextContent(`10.11.2026 · ${money(-2_500)}Statement`)
    expect(rows[0]).toHaveTextContent(money(1_147_500))
    expect(screen.getByTestId('history-shown')).toHaveTextContent('All 3 events, newest first.')
    // The table reads newest first, 50 at a time; the chart oldest first, 1000 at a time.
    expect(db.rpc.get_debt_history).toHaveBeenCalledWith({
      p_debt_id: DEBT_ID,
      p_limit: 50,
      p_newest_first: true,
    })
    expect(screen.getByTestId('debt-chart')).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: /Remaining amount over time, 3 events/ }),
    ).toBeInTheDocument()
    // A payment leads to the debt's payments in its period.
    expect(within(rows[1]!).getByRole('link', { name: /See the payment of/ })).toHaveAttribute(
      'href',
      `/transactions?period=period-2&debt=${DEBT_ID}`,
    )
    expect(db.rpc.get_debt_history).toHaveBeenCalledWith({ p_debt_id: DEBT_ID, p_limit: 1000 })
  })

  it('adjusts the balance to the bank’s figure, saying the difference is what is stored', async () => {
    const db = debtsDb()
    db.rpc.adjust_debt_balance.mockImplementation(() => [debtRow({ revision: 2 })])
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, `/debts/${DEBT_ID}`)
    await screen.findByTestId('debt-history')
    await userEvent.click(screen.getByRole('button', { name: 'Adjust balance' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('stores the difference')
    await userEvent.type(within(dialog).getByLabelText('Balance on your statement'), "11'400")
    await userEvent.type(within(dialog).getByLabelText('Note (optional)'), 'November')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Adjust' }))
    await waitFor(() => {
      expect(db.rpc.adjust_debt_balance).toHaveBeenCalledWith({
        p_debt_id: DEBT_ID,
        p_expected_revision: 1,
        p_balance: 1_140_000,
        p_note: 'November',
      })
    })
  })

  it('deletes an adjustment with the debt’s revision', async () => {
    const db = debtsDb()
    db.tables.debt_overview[0] = debtRow({ revision: 7 })
    db.rpc.delete_debt_adjustment.mockImplementation(() => [debtRow({ revision: 8 })])
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, `/debts/${DEBT_ID}`)
    await screen.findByTestId('debt-history')
    await userEvent.click(screen.getByRole('button', { name: /^Delete the adjustment of/ }))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete adjustment' }))
    await waitFor(() => {
      expect(db.rpc.delete_debt_adjustment).toHaveBeenCalledWith({
        p_adjustment_id: 'adj-1',
        p_expected_revision: 7,
      })
    })
  })

  it('records a payment: the transaction form with the debt and its category chosen', async () => {
    const db = debtsDb()
    db.rpc.add_transaction.mockImplementation(() => [])
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, `/debts/${DEBT_ID}`)
    await screen.findByTestId('debt-history')
    await userEvent.click(screen.getByRole('button', { name: 'Record a payment' }))
    const form = await screen.findByTestId('transaction-form')
    await userEvent.type(within(form).getByLabelText('Amount'), '500')
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.add_transaction).toHaveBeenCalledWith(
        expect.objectContaining({
          p_kind: 'expense',
          p_amount: 50_000,
          p_category_id: 'cat-groceries',
          p_debt_id: DEBT_ID,
        }),
      )
    })
  })

  it('says whether removing deletes or ends it', async () => {
    const db = debtsDb()
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, `/debts/${DEBT_ID}`)
    await screen.findByTestId('debt-history')
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Car loan' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'End' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByTestId('remove-debt-outcome')).toHaveTextContent(
      `Its history stays, and so does its remaining amount (${money(1_150_000)})`,
    )
  })
})

describe('a debt in an ended budget [R-BUDGET-150]', () => {
  it('adjusts on the budget’s last day by default, sending no date, as the database does', async () => {
    const db = debtsDb()
    db.rpc.get_current_period.mockImplementation(() => [])
    db.tables.period_summaries = db.tables.period_summaries.map((period) => ({
      ...period,
      is_current: false,
    }))
    db.rpc.adjust_debt_balance.mockImplementation(() => [])
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, `/debts/${DEBT_ID}`)
    await screen.findByTestId('debt-history')
    await userEvent.click(screen.getByRole('button', { name: 'Adjust balance' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Date of the statement')).toHaveValue('15.11.2026')
    await userEvent.type(within(dialog).getByLabelText('Balance on your statement'), '11000')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Adjust' }))
    await waitFor(() => {
      expect(db.rpc.adjust_debt_balance).toHaveBeenCalledWith({
        p_debt_id: DEBT_ID,
        p_expected_revision: 1,
        p_balance: 1_100_000,
      })
    })
  })

  it('freezes an ended debt: no payment, no adjustment, adjustments kept, and says why [R-DEBT-151]', async () => {
    const db = debtsDb()
    db.tables.debt_overview[0] = debtRow({ is_active: false, end_seq: 2 })
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, `/debts/${DEBT_ID}`)
    await screen.findByTestId('debt-history')
    expect(screen.queryByRole('button', { name: 'Record a payment' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Adjust balance' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Delete the adjustment of/ })).toBeNull()
    expect(
      screen.getByText(/its payments and adjustments can no longer be changed/),
    ).toBeInTheDocument()
  })
})
