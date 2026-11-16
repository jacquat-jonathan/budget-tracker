import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { renderRoutes } from '@/test/render'
import { BUDGET_ID, categoriesDb, transactionRow } from '@/test/budget-fixtures'
import { rpcError } from '@/test/mock-db'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

/** Periods 25.09 – 22.10 and 23.10 – 24.11 (current); the database's today is 15.11.2026. */
function transactionsDb() {
  return categoriesDb({
    transaction_list: [
      transactionRow(),
      transactionRow({
        id: 'tx-2',
        kind: 'refund',
        amount: 2_500,
        date: '2026-11-09',
        description: 'Returned bottles',
        created_at: '2026-11-09T10:00:00+00:00',
      }),
      transactionRow({
        id: 'tx-3',
        kind: 'extra_income',
        amount: 25_000,
        date: '2026-11-12',
        category_id: null,
        category_name: null,
        description: 'Sold the old bike',
        created_at: '2026-11-12T10:00:00+00:00',
      }),
      transactionRow({
        id: 'tx-4',
        amount: 48_000,
        date: '2026-11-01',
        category_id: 'cat-health',
        category_name: 'Health',
        parent_category_id: 'cat-insurance',
        parent_category_name: 'Insurance',
        description: null,
        recorded_by_name: 'Sam',
        created_at: '2026-11-01T10:00:00+00:00',
      }),
      transactionRow({
        id: 'tx-old',
        amount: 84_530,
        date: '2026-10-10',
        period_id: 'period-1',
        description: 'Migros (October)',
        created_at: '2026-10-10T10:00:00+00:00',
      }),
    ],
  })
}

async function openTransactions(db = transactionsDb(), path = '/transactions') {
  mock.current = createSupabaseMock(fakeSession(), db)
  const result = renderRoutes(routes, path)
  await screen.findByTestId('transaction-list')
  return { db, ...result }
}

const descriptions = () =>
  screen.getAllByTestId('transaction-row').map((row) => row.querySelector('span')?.textContent)

describe('the transaction list [R-TRANSACTION-051]', () => {
  it('shows the current period, newest first, grouped by day, with kinds and who recorded them', async () => {
    const { db } = await openTransactions()

    expect(descriptions()).toEqual([
      'Sold the old bike',
      'Returned bottles',
      'Migros',
      'Insurance › Health',
    ])
    const rows = screen.getAllByTestId('transaction-row')
    expect(within(rows[0]!).getByTestId('transaction-amount')).toHaveTextContent('+CHF 250.00')
    expect(rows[0]).toHaveTextContent('Extra income')
    expect(within(rows[1]!).getByText('Refund')).toBeInTheDocument()
    expect(within(rows[2]!).getByTestId('transaction-amount')).toHaveTextContent('CHF 87.90')
    expect(rows[3]).toHaveTextContent('Insurance › Health')
    expect(rows[3]).toHaveTextContent('by Sam')
    expect(screen.getByRole('region', { name: '08.11.2026' })).toHaveTextContent('Sunday')
    expect(db.rpc.list_transactions).toHaveBeenCalledWith({
      p_budget_id: BUDGET_ID,
      p_limit: 50,
      p_from_date: '2026-10-23',
      p_to_date: '2026-11-24',
    })
  })

  it('pages through the database’s cursor [R-TRANSACTION-095]', async () => {
    const db = transactionsDb()
    db.tables.transaction_list = Array.from({ length: 55 }, (_, index) =>
      transactionRow({
        id: `tx-${String(index).padStart(2, '0')}`,
        date: '2026-11-08',
        description: `Receipt ${index}`,
        created_at: `2026-11-08T10:${String(index).padStart(2, '0')}:00+00:00`,
      }),
    )
    await openTransactions(db)
    expect(screen.getAllByTestId('transaction-row')).toHaveLength(50)

    await userEvent.click(screen.getByRole('button', { name: 'Show older transactions' }))
    await waitFor(() => {
      expect(screen.getAllByTestId('transaction-row')).toHaveLength(55)
    })
    expect(db.rpc.list_transactions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        p_before_date: '2026-11-08',
        p_before_created_at: '2026-11-08T10:05:00+00:00',
        p_before_id: 'tx-05',
      }),
    )
    expect(
      screen.queryByRole('button', { name: 'Show older transactions' }),
    ).not.toBeInTheDocument()
  })

  it('filters by period, category and kind, from the address too', async () => {
    const { db } = await openTransactions(
      transactionsDb(),
      '/transactions?period=all&category=cat-insurance',
    )
    expect(descriptions()).toEqual(['Insurance › Health'])
    expect(db.rpc.list_transactions).toHaveBeenCalledWith({
      p_budget_id: BUDGET_ID,
      p_limit: 50,
      p_category_id: 'cat-insurance',
    })

    await userEvent.click(screen.getByRole('combobox', { name: 'Category' }))
    await userEvent.click(await screen.findByRole('option', { name: 'All categories' }))
    await waitFor(() => {
      expect(descriptions()).toContain('Migros (October)')
    })
    await userEvent.click(screen.getByRole('combobox', { name: 'Kind' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Refunds' }))
    await waitFor(() => {
      expect(descriptions()).toEqual(['Returned bottles'])
    })
  })
})

describe('recording transactions [R-TRANSACTION-050] [R-TRANSACTION-004]', () => {
  it('adds an expense on a category the database allows for its date, up to today', async () => {
    const { db } = await openTransactions()

    await userEvent.click(screen.getByRole('button', { name: 'Add transaction' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add a transaction' })
    expect(within(dialog).getByLabelText('Date')).toHaveValue('15.11.2026')
    expect(dialog).toHaveTextContent('From 25.09.2026 to 15.11.2026 (today at the latest).')
    await userEvent.type(within(dialog).getByLabelText('Amount'), '45.20')
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Category' }))
    const listbox = await screen.findByRole('listbox')
    // Subcategories under their category; groups are not choices.
    expect(within(listbox).getByRole('group', { name: 'Insurance' })).toBeInTheDocument()
    expect(within(listbox).queryByRole('option', { name: 'Insurance' })).not.toBeInTheDocument()
    await userEvent.click(within(listbox).getByRole('option', { name: 'Groceries' }))
    await userEvent.type(within(dialog).getByLabelText('Note (optional)'), 'Migros')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(db.rpc.add_transaction).toHaveBeenCalledWith({
        p_budget_id: BUDGET_ID,
        p_kind: 'expense',
        p_amount: 4_520,
        p_date: '2026-11-15',
        p_category_id: 'cat-groceries',
        p_description: 'Migros',
      })
    })
    expect(db.rpc.list_categories_for_date).toHaveBeenCalledWith({
      p_budget_id: BUDGET_ID,
      p_date: '2026-11-15',
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('reads the categories again when the date changes, and refuses a date after today before sending', async () => {
    const { db } = await openTransactions()
    await userEvent.click(screen.getByRole('button', { name: 'Add transaction' }))
    const dialog = await screen.findByRole('dialog')
    const date = within(dialog).getByLabelText('Date')
    await userEvent.clear(date)
    await userEvent.type(date, '10.10.2026')
    await waitFor(() => {
      expect(db.rpc.list_categories_for_date).toHaveBeenCalledWith({
        p_budget_id: BUDGET_ID,
        p_date: '2026-10-10',
      })
    })

    await userEvent.clear(date)
    await userEvent.type(date, '16.11.2026')
    await userEvent.type(within(dialog).getByLabelText('Amount'), '10')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(
      await within(dialog).findByText('Choose a date within the range shown under the field.'),
    ).toBeInTheDocument()
    expect(db.rpc.add_transaction).not.toHaveBeenCalled()
  })

  it('an extra income has no category', async () => {
    const { db } = await openTransactions()
    await userEvent.click(screen.getByRole('button', { name: 'Add transaction' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Extra income' }))
    expect(within(dialog).queryByRole('combobox', { name: 'Category' })).not.toBeInTheDocument()
    await userEvent.type(within(dialog).getByLabelText('Amount'), '250')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.add_transaction).toHaveBeenCalledWith({
        p_budget_id: BUDGET_ID,
        p_kind: 'extra_income',
        p_amount: 25_000,
        p_date: '2026-11-15',
      })
    })
  })

  it('“save and add another” keeps the kind, date and category for the next receipt', async () => {
    const { db } = await openTransactions()
    await userEvent.click(screen.getByRole('button', { name: 'Add transaction' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Refund' }))
    await userEvent.type(within(dialog).getByLabelText('Amount'), '12')
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Category' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Groceries' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save and add another' }))

    expect(await within(dialog).findByTestId('saved-in-a-row')).toHaveTextContent(
      'Saved (CHF 12.00).',
    )
    expect(within(dialog).getByLabelText('Amount')).toHaveValue('')
    expect(within(dialog).getByLabelText('Amount')).toHaveFocus()
    expect(within(dialog).getByRole('radio', { name: 'Refund' })).toBeChecked()
    expect(within(dialog).getByRole('combobox', { name: 'Category' })).toHaveTextContent(
      'Groceries',
    )
    await userEvent.type(within(dialog).getByLabelText('Amount'), '3.50{Enter}')
    await waitFor(() => {
      expect(db.rpc.add_transaction).toHaveBeenCalledTimes(2)
    })
    expect(db.rpc.add_transaction).toHaveBeenLastCalledWith({
      p_budget_id: BUDGET_ID,
      p_kind: 'refund',
      p_amount: 350,
      p_date: '2026-11-15',
      p_category_id: 'cat-groceries',
    })
  })

  it('edits and deletes with the revision they were opened on [R-CONCURRENCY-090]', async () => {
    const { db } = await openTransactions()
    const migros = screen.getAllByTestId('transaction-row')[2]!
    await userEvent.click(within(migros).getByRole('button', { name: /Actions for Migros/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit transaction' })
    expect(
      within(dialog).queryByRole('button', { name: 'Save and add another' }),
    ).not.toBeInTheDocument()
    const amount = within(dialog).getByLabelText('Amount')
    await userEvent.clear(amount)
    await userEvent.type(amount, '88')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.update_transaction).toHaveBeenCalledWith({
        p_transaction_id: 'tx-1',
        p_expected_revision: 1,
        p_kind: 'expense',
        p_amount: 8_800,
        p_date: '2026-11-08',
        p_category_id: 'cat-groceries',
        p_description: 'Migros',
      })
    })

    db.rpc.delete_transaction.mockImplementationOnce(() => rpcError('record_changed'))
    await userEvent.click(
      within(screen.getAllByTestId('transaction-row')[2]!).getByRole('button', {
        name: /Actions for Migros/,
      }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const confirm = await screen.findByRole('alertdialog')
    expect(confirm).toHaveTextContent('The transaction of CHF 87.90 on 08.11.2026')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))
    expect(
      await within(confirm).findByText(/Someone else changed this in the meantime/),
    ).toBeInTheDocument()
    expect(db.rpc.delete_transaction).toHaveBeenCalledWith({
      p_transaction_id: 'tx-1',
      p_expected_revision: 1,
    })
  })
})
