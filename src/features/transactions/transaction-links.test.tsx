import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { renderRoutes } from '@/test/render'
import { categoriesDb, debtRow, transactionRow } from '@/test/budget-fixtures'
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
  it('offers the debts of the chosen category, for an expense, and adds the payment', async () => {
    const db = linksDb()
    db.rpc.add_transaction.mockImplementation(() => [])
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/transactions')
    await userEvent.click(await screen.findByRole('button', { name: 'Add transaction' }))
    const form = await screen.findByTestId('transaction-form')
    await userEvent.type(within(form).getByLabelText('Amount'), '500')
    await userEvent.click(within(form).getByLabelText('Category'))
    await userEvent.click(await screen.findByRole('option', { name: 'Groceries' }))
    // No debt is paid from Groceries.
    expect(within(form).queryByLabelText('Debt payment')).not.toBeInTheDocument()
    await userEvent.click(within(form).getByLabelText('Category'))
    await userEvent.click(await screen.findByRole('option', { name: 'Rent' }))
    await userEvent.click(await within(form).findByLabelText('Debt payment'))
    await userEvent.click(
      await screen.findByRole('option', { name: 'This is a payment on Car loan' }),
    )
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

  it('changes the link of an existing transaction through link_transaction, never update_transaction', async () => {
    const db = linksDb()
    db.rpc.update_transaction.mockImplementation((args) => [
      transactionRow({ id: String(args.p_transaction_id), revision: 6 }),
    ])
    db.rpc.link_transaction.mockImplementation((args) => [
      transactionRow({
        id: String(args.p_transaction_id),
        revision: Number(args.p_expected_revision) + 1,
      }),
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
      expect(db.rpc.update_transaction).toHaveBeenCalled()
    })
    // Unlinked first, with the revision opened; the fields then, with the revision it returned.
    expect(db.rpc.link_transaction).toHaveBeenCalledWith({
      p_transaction_id: 'pay-1',
      p_expected_revision: 3,
    })
    expect(db.rpc.update_transaction).toHaveBeenCalledWith(
      expect.objectContaining({ p_transaction_id: 'pay-1', p_expected_revision: 4 }),
    )
    expect(db.rpc.update_transaction.mock.calls[0]?.[0]).not.toHaveProperty('p_debt_id')
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
