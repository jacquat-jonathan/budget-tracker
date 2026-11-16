import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { renderRoutes } from '@/test/render'
import { categoriesDb, DEBT_ID, debtRow, transactionRow } from '@/test/budget-fixtures'
import { rpcError } from '@/test/mock-db'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

function linksDb() {
  return categoriesDb({
    debt_overview: [
      debtRow({ id: 'debt-car', name: 'Car loan', category_id: 'cat-rent', category_name: 'Rent' }),
    ],
    transaction_list: [
      transactionRow({
        id: 'charge-1',
        amount: 1_990,
        date: '2026-11-05',
        charge_date: '2026-11-05',
        review_state: 'awaiting_confirmation',
        subscription_id: 'sub-netflix',
        subscription_name: 'Netflix',
        description: null,
        recorded_by: null,
        recorded_by_name: null,
        created_at: '2026-11-05T10:00:00+00:00',
        revision: 2,
      }),
      transactionRow({
        id: 'charge-2',
        amount: 1_990,
        date: '2026-10-05',
        charge_date: '2026-10-05',
        subscription_id: 'sub-netflix',
        subscription_name: 'Netflix',
        description: null,
        recorded_by: null,
        recorded_by_name: null,
        created_at: '2026-10-25T10:00:00+00:00',
      }),
      transactionRow({
        id: 'pay-1',
        amount: 50_000,
        date: '2026-11-02',
        category_id: 'cat-rent',
        category_name: 'Rent',
        debt_id: 'debt-car',
        debt_name: 'Car loan',
        description: null,
        created_at: '2026-11-02T10:00:00+00:00',
        revision: 3,
      }),
    ],
  })
}

function row(id: string) {
  const match = screen
    .getAllByTestId('transaction-row')
    .find((item) => item.textContent.includes(id))
  if (!match) throw new Error(`No row ${id}`)
  return match
}

describe('transactions list: charges and payments [R-SUBSCRIPTION-123]', () => {
  it('marks automatic charges and those awaiting confirmation in words, and confirms from there', async () => {
    const db = linksDb()
    db.rpc.confirm_subscription_charge.mockImplementation(() => [])
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/transactions?period=all')
    await screen.findAllByTestId('transaction-row')

    const awaiting = screen.getByTestId('awaiting-confirmation')
    expect(awaiting).toHaveTextContent('Awaiting confirmation')
    const rows = screen.getAllByTestId('transaction-row')
    expect(rows.some((item) => item.textContent.includes('Automatic charge of Netflix'))).toBe(true)
    expect(rows.some((item) => item.textContent.includes('Payment on Car loan'))).toBe(true)

    const pending = rows.find((item) => within(item).queryByTestId('awaiting-confirmation'))!
    await userEvent.click(within(pending).getByRole('button', { name: /^Actions for/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'It went through' }))
    await waitFor(() => {
      expect(db.rpc.confirm_subscription_charge).toHaveBeenCalledWith({
        p_transaction_id: 'charge-1',
        p_expected_revision: 2,
      })
    })
    // Only a charge awaiting confirmation offers the answers.
    expect(screen.getAllByTestId('awaiting-confirmation')).toHaveLength(1)
    expect(row('Payment on Car loan')).not.toHaveTextContent('Awaiting')
  })
})

describe('debt payments in the transaction form [R-DEBT-123]', () => {
  it('offers the debts for an expense; choosing one sets its category and says so [R-DEBT-152]', async () => {
    const db = linksDb()
    db.rpc.add_transaction.mockImplementation(() => [])
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/transactions')
    await userEvent.click(await screen.findByRole('button', { name: 'Add transaction' }))
    const form = await screen.findByTestId('transaction-form')
    await userEvent.type(within(form).getByLabelText('Amount'), '500')
    await userEvent.click(within(form).getByLabelText('Category'))
    await userEvent.click(await screen.findByRole('option', { name: 'Groceries' }))
    await userEvent.click(await within(form).findByLabelText('Debt payment'))
    await userEvent.click(
      await screen.findByRole('option', { name: 'This is a payment on Car loan' }),
    )
    // The category of the debt's terms in force in the period of the date.
    const category = await within(form).findByTestId('debt-category')
    await waitFor(() => {
      expect(category).toHaveTextContent('Category: Rent')
    })
    expect(category).toHaveTextContent(
      'Payments on “Car loan” are in the category of its terms on that date.',
    )
    expect(db.rpc.get_debt_terms).toHaveBeenCalledWith({
      p_debt_id: 'debt-car',
      p_period_id: 'period-2',
    })
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.add_transaction).toHaveBeenCalledWith(
        expect.objectContaining({
          p_kind: 'expense',
          p_amount: 50_000,
          p_category_id: 'cat-rent',
          p_debt_id: 'debt-car',
        }),
      )
    })
  })

  it('changes the fields and the link in one update_transaction call', async () => {
    const db = linksDb()
    db.rpc.update_transaction.mockImplementation((args) => [
      transactionRow({ id: String(args.p_transaction_id), revision: 4 }),
    ])
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/transactions?period=all')
    await screen.findAllByTestId('transaction-row')
    await userEvent.click(
      within(row('Payment on Car loan')).getByRole('button', { name: /^Actions for/ }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const form = await screen.findByTestId('transaction-form')
    await userEvent.click(await within(form).findByLabelText('Debt payment'))
    await userEvent.click(await screen.findByRole('option', { name: 'Not a debt payment' }))
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.update_transaction).toHaveBeenCalledTimes(1)
    })
    // The revision opened, the new link (none) with p_relink: never link_transaction.
    expect(db.rpc.update_transaction).toHaveBeenCalledWith(
      expect.objectContaining({
        p_transaction_id: 'pay-1',
        p_expected_revision: 3,
        p_relink: true,
      }),
    )
    expect(db.rpc.update_transaction.mock.calls[0]?.[0]).not.toHaveProperty('p_debt_id')
    expect(db.rpc.link_transaction).not.toHaveBeenCalled()
  })

  it('leaves everything as it was when the one call is refused, and says why', async () => {
    const db = linksDb()
    db.tables.debt_overview.push(
      debtRow({ id: 'debt-bike', name: 'Bike loan', category_id: 'cat-rent' }),
    )
    db.rpc.update_transaction.mockImplementation(() => rpcError('debt_not_in_force'))
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/transactions?period=all')
    await screen.findAllByTestId('transaction-row')
    await userEvent.click(
      within(row('Payment on Car loan')).getByRole('button', { name: /^Actions for/ }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const form = await screen.findByTestId('transaction-form')
    await userEvent.click(await within(form).findByLabelText('Debt payment'))
    await userEvent.click(
      await screen.findByRole('option', { name: 'This is a payment on Bike loan' }),
    )
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }))
    expect(await within(form).findByText(/not in force/)).toBeInTheDocument()
    // One call, refused as a whole: nothing was unlinked or linked on its own.
    expect(db.rpc.update_transaction).toHaveBeenCalledTimes(1)
    expect(db.rpc.update_transaction).toHaveBeenCalledWith(
      expect.objectContaining({ p_relink: true, p_debt_id: 'debt-bike' }),
    )
    expect(db.rpc.link_transaction).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('refuses a payment dated before the debt was opened, before sending it [R-DEBT-150]', async () => {
    const db = linksDb()
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/transactions')
    await userEvent.click(await screen.findByRole('button', { name: 'Add transaction' }))
    const form = await screen.findByTestId('transaction-form')
    await userEvent.type(within(form).getByLabelText('Amount'), '500')
    await userEvent.click(await within(form).findByLabelText('Debt payment'))
    await userEvent.click(
      await screen.findByRole('option', { name: 'This is a payment on Car loan' }),
    )
    // The earliest date is said with the choice and under the date.
    expect(form).toHaveTextContent(
      'Payments on “Car loan” can be dated from 23.10.2026, the day it was opened.',
    )
    expect(form).toHaveTextContent('From 23.10.2026, when “Car loan” was opened')
    const date = within(form).getByLabelText('Date')
    await userEvent.clear(date)
    await userEvent.type(date, '20.10.2026')
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }))
    expect(await within(form).findByText(/before the debt was opened/)).toBeInTheDocument()
    expect(db.rpc.add_transaction).not.toHaveBeenCalled()
  })

  it('keeps a payment of an ended debt as it is, and says why [R-DEBT-151]', async () => {
    const db = linksDb()
    db.tables.debt_overview = [
      debtRow({
        id: 'debt-car',
        name: 'Car loan',
        category_id: 'cat-rent',
        category_name: 'Rent',
        is_active: false,
        end_seq: 2,
      }),
    ]
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/transactions?period=all')
    await screen.findAllByTestId('transaction-row')
    await userEvent.click(
      within(row('Payment on Car loan')).getByRole('button', { name: /^Actions for/ }),
    )
    const remove = await screen.findByRole('menuitem', { name: /^Delete/ })
    expect(remove).toHaveAttribute('aria-disabled', 'true')
    expect(remove).toHaveTextContent('Its debt has ended: it stays as it is.')
    await userEvent.click(screen.getByRole('menuitem', { name: 'View' }))
    const form = await screen.findByTestId('transaction-form')
    expect(within(form).getByTestId('frozen-payment')).toHaveTextContent(
      'This is a payment on “Car loan”, which has ended: it can no longer be changed or deleted.',
    )
    expect(within(form).queryByLabelText('Debt payment')).not.toBeInTheDocument()
    expect(within(form).getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('keeps a payment an expense: a refund needs the link removed first', async () => {
    const db = linksDb()
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/transactions?period=all')
    await screen.findAllByTestId('transaction-row')
    await userEvent.click(
      within(row('Payment on Car loan')).getByRole('button', { name: /^Actions for/ }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const form = await screen.findByTestId('transaction-form')
    await userEvent.click(within(form).getByRole('radio', { name: 'Refund' }))
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }))
    expect(await within(form).findByTestId('kind-error')).toHaveTextContent(
      'A debt payment or a subscription charge is an expense.',
    )
    expect(db.rpc.update_transaction).not.toHaveBeenCalled()
  })
})

describe('transactions of one debt, one subscription, or awaiting [R-TRANSACTION-150]', () => {
  it('shows the filter a link set, keeps it in the address, and removes it on request', async () => {
    const db = linksDb()
    db.tables.debt_overview.push(debtRow({ id: DEBT_ID, name: 'Bike loan' }))
    mock.current = createSupabaseMock(fakeSession(), db)
    const { router } = renderRoutes(routes, `/transactions?period=all&debt=${DEBT_ID}`)
    const chips = await screen.findByTestId('link-filters')
    expect(chips).toHaveTextContent('Debt: Bike loan')
    await waitFor(() => {
      expect(db.rpc.list_transactions).toHaveBeenCalledWith(
        expect.objectContaining({ p_debt_id: DEBT_ID }),
      )
    })
    await userEvent.click(
      within(chips).getByRole('button', { name: 'Remove the filter “Debt: Bike loan”' }),
    )
    await waitFor(() => {
      expect(router.state.location.search).toBe('?period=all')
    })
    expect(db.rpc.list_transactions).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ p_debt_id: expect.anything() as unknown }),
    )
  })

  it('lists only the charges awaiting confirmation, and drops a link to no record', async () => {
    const db = linksDb()
    mock.current = createSupabaseMock(fakeSession(), db)
    const { router } = renderRoutes(
      routes,
      '/transactions?period=all&awaiting=1&subscription=not-a-uuid',
    )
    expect(await screen.findByTestId('link-filters')).toHaveTextContent('Awaiting confirmation')
    await waitFor(() => {
      expect(router.state.location.search).toBe('?period=all&awaiting=1')
    })
    await waitFor(() => {
      expect(db.rpc.list_transactions).toHaveBeenCalledWith(
        expect.objectContaining({ p_awaiting_only: true }),
      )
    })
  })
})

describe('a payment whose debt ended meanwhile [R-DEBT-151]', () => {
  it('says the payment can no longer be changed, in the words of what was tried', async () => {
    const db = linksDb()
    db.rpc.update_transaction.mockImplementation(() => rpcError('debt_ended'))
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/transactions?period=all')
    await screen.findAllByTestId('transaction-row')
    await userEvent.click(
      within(row('Payment on Car loan')).getByRole('button', { name: /^Actions for/ }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const form = await screen.findByTestId('transaction-form')
    const amount = within(form).getByLabelText('Amount')
    await userEvent.clear(amount)
    await userEvent.type(amount, '450')
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }))
    expect(
      await within(form).findByText(
        'This payment’s debt has ended: the payment can no longer be changed or deleted.',
      ),
    ).toBeInTheDocument()
  })
})
