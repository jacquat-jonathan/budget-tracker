import { act, screen, waitFor, within } from '@testing-library/react'
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

    // Sam changed the amount meanwhile: my delete is refused, and the confirmation says what
    // changed before I confirm again.
    db.rpc.delete_transaction.mockImplementationOnce(() => {
      db.tables.transaction_list = db.tables.transaction_list.map((row) =>
        row.id === 'tx-1' ? { ...row, amount: 9_990, revision: 3 } : row,
      )
      rpcError('record_changed')
    })
    await userEvent.click(
      within(screen.getAllByTestId('transaction-row')[2]!).getByRole('button', {
        name: /Actions for Migros/,
      }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const confirm = await screen.findByRole('alertdialog')
    expect(confirm).toHaveTextContent('The transaction of CHF 87.90 on 08.11.2026')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))
    const notice = await within(confirm).findByTestId('changed-elsewhere')
    expect(notice).toHaveTextContent('AmountCHF 99.90')
    expect(within(confirm).getByRole('button', { name: 'Delete' })).toBeDisabled()
    expect(db.rpc.delete_transaction).toHaveBeenCalledWith({
      p_transaction_id: 'tx-1',
      p_expected_revision: 1,
    })
    await userEvent.click(within(notice).getByRole('button', { name: 'I have looked, continue' }))
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))
    await waitFor(() => {
      expect(db.rpc.delete_transaction).toHaveBeenLastCalledWith({
        p_transaction_id: 'tx-1',
        p_expected_revision: 3,
      })
    })
  })
})

describe('a transaction moved or deleted by another member while open [R-CONCURRENCY-091]', () => {
  it('moved out of the filtered list: still the same record, their change shown, mine kept', async () => {
    const { db } = await openTransactions()
    db.rpc.update_transaction.mockImplementationOnce(() => {
      // Sam moved it to the previous period: out of the current period's list.
      db.tables.transaction_list = db.tables.transaction_list.map((row) =>
        row.id === 'tx-1'
          ? { ...row, date: '2026-10-10', period_id: 'period-1', revision: 2 }
          : row,
      )
      rpcError('record_changed')
    })
    const migros = screen.getAllByTestId('transaction-row')[2]!
    await userEvent.click(within(migros).getByRole('button', { name: /Actions for Migros/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    const amount = within(dialog).getByLabelText('Amount')
    await userEvent.clear(amount)
    await userEvent.type(amount, '91')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    const notice = await within(dialog).findByTestId('changed-elsewhere')
    expect(notice).toHaveTextContent('Date10.10.2026')
    expect(within(dialog).getByLabelText('Amount')).toHaveValue('91.00')
    await userEvent.click(within(notice).getByRole('button', { name: 'Keep mine' }))
    expect(within(dialog).getByLabelText('Date')).toHaveValue('10.10.2026')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.update_transaction).toHaveBeenLastCalledWith({
        p_transaction_id: 'tx-1',
        p_expected_revision: 2,
        p_kind: 'expense',
        p_amount: 9_100,
        p_date: '2026-10-10',
        p_category_id: 'cat-groceries',
        p_description: 'Migros',
      })
    })
  })

  it('deleted while open: says so, keeps what was typed, and offers no save', async () => {
    const { db, queryClient } = await openTransactions()
    const migros = screen.getAllByTestId('transaction-row')[2]!
    await userEvent.click(within(migros).getByRole('button', { name: /Actions for Migros/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Note (optional)'), ' and Coop')
    db.tables.transaction_list = db.tables.transaction_list.filter((row) => row.id !== 'tx-1')
    await act(() => queryClient.invalidateQueries({ queryKey: ['budget'] }))
    expect(await within(dialog).findByTestId('gone-elsewhere')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(within(dialog).getByLabelText('Note (optional)')).toHaveValue('Migros and Coop')
  })
})

describe('the filters [R-TRANSACTION-051]', () => {
  it('a category the budget does not have falls back to all categories', async () => {
    const { router } = await openTransactions(transactionsDb(), '/transactions?category=elsewhere')
    expect(descriptions()).toContain('Migros')
    await waitFor(() => {
      expect(router.state.location.search).toBe('')
    })
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent('All categories')
  })

  it('a choice is written to the address', async () => {
    const { router } = await openTransactions()
    await userEvent.click(screen.getByRole('combobox', { name: 'Kind' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Refunds' }))
    await waitFor(() => {
      expect(router.state.location.search).toBe('?kind=refund')
    })
  })

  it('a removed category in the address is shown in the select', async () => {
    mock.current = createSupabaseMock(fakeSession(), transactionsDb())
    renderRoutes(routes, '/transactions?category=cat-hobby')
    expect(await screen.findByText('No transactions match these filters')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent(
      'Old hobby (removed)',
    )
  })
})

describe('the transaction form [R-TRANSACTION-050]', () => {
  it('keeps a transaction’s category even when it is no longer planned on its date', async () => {
    const db = transactionsDb()
    // Groceries was removed: the date's choices no longer have it.
    db.rpc.list_categories_for_date.mockImplementation(() => [
      {
        category_id: 'cat-rent',
        parent_id: null,
        name: 'Rent',
        parent_name: null,
        display_order: 0,
      },
    ])
    const { db: same } = await openTransactions(db)
    const migros = screen.getAllByTestId('transaction-row')[2]!
    await userEvent.click(within(migros).getByRole('button', { name: /Actions for Migros/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => {
      expect(within(dialog).getByRole('combobox', { name: 'Category' })).toHaveTextContent(
        'Groceries (kept: not planned on this date)',
      )
    })
    const amount = within(dialog).getByLabelText('Amount')
    await userEvent.clear(amount)
    await userEvent.type(amount, '88')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(same.rpc.update_transaction).toHaveBeenCalledWith(
        expect.objectContaining({ p_category_id: 'cat-groceries', p_amount: 8_800 }),
      )
    })
  })

  it('offers to keep the category only while the date stays in its own period [R-TRANSACTION-050] [R-TRANSACTION-100]', async () => {
    const db = transactionsDb()
    db.rpc.list_categories_for_date.mockImplementation(() => [
      {
        category_id: 'cat-rent',
        parent_id: null,
        name: 'Rent',
        parent_name: null,
        display_order: 0,
      },
    ])
    await openTransactions(db)
    const migros = screen.getAllByTestId('transaction-row')[2]!
    await userEvent.click(within(migros).getByRole('button', { name: /Actions for Migros/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    const date = within(dialog).getByLabelText('Date')
    // 10.10.2026 is in the previous period: the category must be chosen again.
    await userEvent.clear(date)
    await userEvent.type(date, '10.10.2026')
    await waitFor(() => {
      expect(dialog).toHaveTextContent(
        '“Groceries” is not planned in the period of this date: choose a category again',
      )
    })
    expect(within(dialog).getByRole('combobox', { name: 'Category' })).not.toHaveTextContent('kept')
    // Back in its own period, it may keep it again.
    await userEvent.clear(date)
    await userEvent.type(date, '09.11.2026')
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Category' }))
    expect(
      await screen.findByRole('option', { name: 'Groceries (kept: not planned on this date)' }),
    ).toBeInTheDocument()
  })

  it('a failed category read is shown with a retry, not as “no categories”', async () => {
    const db = transactionsDb()
    db.rpc.list_categories_for_date.mockImplementationOnce(() => rpcError('budget_not_found_x'))
    await openTransactions(db)
    await userEvent.click(screen.getByRole('button', { name: 'Add transaction' }))
    const dialog = await screen.findByRole('dialog')
    const failed = await within(dialog).findByTestId('categories-failed')
    await userEvent.click(within(failed).getByRole('button', { name: 'Try again' }))
    await waitFor(() => {
      expect(within(dialog).queryByTestId('categories-failed')).not.toBeInTheDocument()
    })
  })

  it('in an ended budget, the latest date is its last day', async () => {
    const db = transactionsDb()
    db.rpc.get_current_period.mockImplementation(() => [])
    db.tables.period_summaries = db.tables.period_summaries.map((period) => ({
      ...period,
      is_current: false,
    }))
    await openTransactions(db, '/transactions?period=all')
    await userEvent.click(screen.getByRole('button', { name: 'Add transaction' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('From 25.09.2026 to 15.11.2026, the budget’s last day.')
  })
})
