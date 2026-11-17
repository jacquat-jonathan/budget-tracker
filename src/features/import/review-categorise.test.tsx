import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { budgetRow, categoriesDb, categoryRow, transactionRow } from '@/test/budget-fixtures'
import { rpcError, type MockDb } from '@/test/mock-db'
import { renderRoutes } from '@/test/render'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'
import { warmPages } from '@/test/warm'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

beforeAll(() => warmPages('transactions'))

const BATCH = 'aaaaaaaa-0000-4000-8000-000000000001'
const TO_CATEGORISE = 'cat-to-categorise'

/**
 * Four imports waiting in "to categorise" (Shop 1 to Shop 4, newest first), and
 * update_transaction answering as the database: the revision checked, the category set, the
 * row out of "to categorise", the revision raised.
 */
function reviewDb(): MockDb {
  const db = categoriesDb()
  db.tables.my_budgets = [budgetRow({ to_review: 4, to_categorise_category_id: TO_CATEGORISE })]
  db.tables.category_overview.push(
    categoryRow({
      id: TO_CATEGORISE,
      name: 'To categorise',
      sort_order: 9,
      amount: 0,
      monthly_amount: 0,
      is_to_categorise: true,
      has_transactions: true,
    }),
  )
  db.tables.transaction_list = [1, 2, 3, 4].map((n) =>
    transactionRow({
      id: `imp-${n}`,
      date: `2026-11-0${10 - n}`,
      created_at: `2026-11-0${10 - n}T10:00:00+00:00`,
      amount: 1_000 * n,
      description: `Shop ${n}`,
      category_id: TO_CATEGORISE,
      category_name: 'To categorise',
      in_to_categorise: true,
      review_state: 'to_review',
      import_batch_id: BATCH,
      import_source: 'csv',
    }),
  )
  db.rpc.update_transaction.mockImplementation((args) => {
    const row = db.tables.transaction_list.find((item) => item.id === args.p_transaction_id)
    if (!row) rpcError('transaction_not_found')
    if (row.revision !== args.p_expected_revision) rpcError('record_changed')
    const category = db.tables.category_overview.find((item) => item.id === args.p_category_id)
    if (!category) rpcError('category_not_found')
    Object.assign(row, {
      category_id: category.id,
      category_name: category.name,
      in_to_categorise: category.is_to_categorise,
      revision: row.revision + 1,
    })
    return [{ ...row }]
  })
  return db
}

function open(db: MockDb) {
  mock.current = createSupabaseMock(fakeSession(), db)
  return renderRoutes(routes, '/transactions?period=all&review=1')
}

function rowOf(name: string): HTMLElement {
  const row = screen
    .getAllByTestId('transaction-row')
    .find((item) => item.textContent.includes(name))
  if (!row) throw new Error(`no row ${name}`)
  return row
}

describe('a category on the review row itself [R-IMPORT-530]', () => {
  it('one choice saves the category and confirms the row, with the existing calls', async () => {
    const db = reviewDb()
    open(db)
    await screen.findAllByTestId('transaction-row')
    const picker = within(rowOf('Shop 2')).getByRole('combobox', {
      name: /^Category for Shop 2, CHF.20.00, 08.11.2026/,
    })
    expect(picker).toHaveTextContent('Choose a category')
    await userEvent.click(picker)
    await userEvent.click(await screen.findByRole('option', { name: 'Groceries' }))
    await waitFor(() => {
      expect(db.rpc.confirm_import).toHaveBeenCalledWith({
        p_transaction_id: 'imp-2',
        p_expected_revision: 2,
      })
    })
    // Every field as it was, the category chosen.
    expect(db.rpc.update_transaction).toHaveBeenCalledWith({
      p_transaction_id: 'imp-2',
      p_expected_revision: 1,
      p_kind: 'expense',
      p_amount: 2_000,
      p_date: '2026-11-08',
      p_category_id: 'cat-groceries',
      p_description: 'Shop 2',
    })
    expect(await screen.findByText('Category saved and transaction confirmed.')).toBeInTheDocument()
    expect(db.tables.transaction_list.find((row) => row.id === 'imp-2')?.review_state).toBe(
      'confirmed',
    )
  })
})

describe('one category for several review rows [R-IMPORT-530]', () => {
  it('saves and confirms the selected rows one after another, with a visible count', async () => {
    const db = reviewDb()
    open(db)
    await screen.findAllByTestId('transaction-row')
    const bar = screen.getByTestId('review-bulk')
    await userEvent.click(within(rowOf('Shop 1')).getByRole('checkbox', { name: /^Select Shop 1/ }))
    await userEvent.click(within(rowOf('Shop 3')).getByRole('checkbox', { name: /^Select Shop 3/ }))
    expect(within(bar).getByTestId('review-selected-count')).toHaveTextContent('2 selected')
    const apply = within(bar).getByRole('button', { name: 'Set the category and confirm 2' })
    expect(apply).toBeDisabled()
    await userEvent.click(
      within(bar).getByRole('combobox', { name: 'Category for the selected ones' }),
    )
    await userEvent.click(await screen.findByRole('option', { name: 'Rent' }))
    await userEvent.click(apply)
    expect(await within(bar).findByTestId('review-bulk-outcome')).toHaveTextContent(
      '2 saved and confirmed.',
    )
    const updated = db.rpc.update_transaction.mock.calls.map(([args]) => args.p_transaction_id)
    expect(updated).toEqual(['imp-1', 'imp-3'])
    expect(db.rpc.confirm_import).toHaveBeenCalledTimes(2)
  })

  it('stops at the first failure and says truthfully how many were saved and which were not', async () => {
    const db = reviewDb()
    const answer = db.rpc.update_transaction.getMockImplementation()!
    db.rpc.update_transaction.mockImplementation((args) =>
      args.p_transaction_id === 'imp-2' ? rpcError('category_not_in_force') : answer(args),
    )
    open(db)
    await screen.findAllByTestId('transaction-row')
    const bar = screen.getByTestId('review-bulk')
    await userEvent.click(within(bar).getByRole('checkbox', { name: 'Select all 4 shown' }))
    expect(within(bar).getByTestId('review-selected-count')).toHaveTextContent('4 selected')
    await userEvent.click(
      within(bar).getByRole('combobox', { name: 'Category for the selected ones' }),
    )
    await userEvent.click(await screen.findByRole('option', { name: 'Rent' }))
    await userEvent.click(
      within(bar).getByRole('button', { name: 'Set the category and confirm 4' }),
    )
    const outcome = await within(bar).findByTestId('review-bulk-outcome')
    expect(outcome).toHaveTextContent('1 of 4 saved and confirmed')
    expect(outcome).toHaveTextContent(/It stopped at “Shop 2, CHF.20.00, 08.11.2026”/)
    expect(outcome).toHaveTextContent('3 not saved and confirmed:')
    const notSaved = within(outcome).getByTestId('review-bulk-not-saved')
    expect(
      within(notSaved)
        .getAllByRole('listitem')
        .map((item) => item.textContent.replace(/\s/g, ' ')),
    ).toEqual([
      'Shop 2, CHF 20.00, 08.11.2026',
      'Shop 3, CHF 30.00, 07.11.2026',
      'Shop 4, CHF 40.00, 06.11.2026',
    ])
    // Nothing after the failure was sent.
    const updated = db.rpc.update_transaction.mock.calls.map(([args]) => args.p_transaction_id)
    expect(updated).toEqual(['imp-1', 'imp-2'])
    expect(db.rpc.confirm_import).toHaveBeenCalledTimes(1)
  })

  it('says when a category was saved but the confirmation was refused', async () => {
    const db = reviewDb()
    db.rpc.confirm_import.mockImplementation(() => rpcError('record_changed'))
    open(db)
    await screen.findAllByTestId('transaction-row')
    const bar = screen.getByTestId('review-bulk')
    await userEvent.click(within(rowOf('Shop 1')).getByRole('checkbox', { name: /^Select Shop 1/ }))
    await userEvent.click(
      within(bar).getByRole('combobox', { name: 'Category for the selected ones' }),
    )
    await userEvent.click(await screen.findByRole('option', { name: 'Rent' }))
    await userEvent.click(
      within(bar).getByRole('button', { name: 'Set the category and confirm 1' }),
    )
    const outcome = await within(bar).findByTestId('review-bulk-outcome')
    expect(outcome).toHaveTextContent('0 of 1 saved and confirmed')
    expect(outcome).toHaveTextContent('its category was saved, but it was not confirmed')
  })
})
