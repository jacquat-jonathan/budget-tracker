import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import {
  categoriesDb,
  DEBT_ID,
  debtRow,
  incomeRow,
  periodRow,
  subscriptionRow,
  transactionRow,
} from '@/test/budget-fixtures'
import { rpcError, type MockDb } from '@/test/mock-db'
import { renderRoutes } from '@/test/render'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

/** Three periods: two earlier ones to correct, the third current. */
const PERIODS = [
  periodRow({
    id: 'period-0',
    seq: 1,
    start_date: '2026-08-25',
    end_date: '2026-09-24',
    is_current: false,
  }),
  periodRow({
    id: 'period-1',
    seq: 2,
    start_date: '2026-09-25',
    end_date: '2026-10-22',
    is_current: false,
  }),
  periodRow({ id: 'period-2', seq: 3, start_date: '2026-10-23', is_current: true }),
]

function db3(tables: Parameters<typeof categoriesDb>[0] = {}): MockDb {
  return categoriesDb({ period_summaries: PERIODS, ...tables })
}

function open(db: MockDb, path: string) {
  mock.current = createSupabaseMock(fakeSession(), db)
  renderRoutes(routes, path)
}

async function editFromMenu(card: HTMLElement, name: string) {
  await userEvent.click(within(card).getAllByRole('button', { name })[0]!)
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
  return screen.findByRole('dialog')
}

async function openDebt(db: MockDb) {
  db.rpc.get_debt_history.mockImplementation(() => [])
  open(db, `/debts/${DEBT_ID}`)
  await screen.findByTestId('detail-remaining')
  await userEvent.click(screen.getByRole('button', { name: 'More actions for Car loan' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
  return screen.findByRole('dialog')
}

async function openSubscription(db: MockDb) {
  open(db, '/subscriptions')
  return editFromMenu(await screen.findByTestId('subscription-card'), 'Actions for Netflix')
}

async function openIncome(db: MockDb) {
  open(db, '/income')
  const card = (await screen.findAllByTestId('income-card')).find((item) =>
    item.textContent.includes('Side job'),
  )!
  return editFromMenu(card, 'Actions for Side job')
}

async function openCategory(db: MockDb) {
  open(db, '/budget')
  await screen.findAllByTestId('category-row')
  const row = screen
    .getAllByTestId('category-row')
    .find((item) => item.textContent.includes('Groceries'))!
  return editFromMenu(row, 'Actions for Groceries')
}

async function retype(field: HTMLElement, value: string) {
  await userEvent.clear(field)
  await userEvent.type(field, value)
  await userEvent.tab()
}

describe('a refused save is never reported as saved [R-CONCURRENCY-280]', () => {
  // Sam saved the same value Ann typed in one field; Ann also typed something else. Ann's
  // save is refused (record_changed): the form must not say "Saved", must keep her other
  // field and let her choose.
  async function expectRefusalKept(dialog: HTMLElement, field: string, typed: string) {
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    const banner = await within(dialog).findByTestId('changed-elsewhere')
    expect(within(dialog).queryByTestId('saved-after-loss')).not.toBeInTheDocument()
    expect(dialog).not.toHaveTextContent('Saved. The answer was lost')
    expect(within(dialog).getByLabelText(field)).toHaveValue(typed)
    return banner
  }

  it('a transaction', async () => {
    const db = db3({
      transaction_list: [
        transactionRow({ id: 'tx-1', amount: 1_000, description: 'Lunch', revision: 1 }),
      ],
    })
    db.rpc.update_transaction.mockImplementationOnce(() => {
      db.tables.transaction_list = db.tables.transaction_list.map((row) => ({
        ...row,
        amount: 55_500,
        revision: 2,
      }))
      rpcError('record_changed')
    })
    db.rpc.update_transaction.mockImplementation(() => [])
    open(db, '/transactions?period=all')
    const row = await screen.findByTestId('transaction-row')
    await userEvent.click(within(row).getByRole('button', { name: /^Actions for/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const form = await screen.findByTestId('transaction-form')
    await retype(within(form).getByLabelText('Amount'), '555.00')
    await retype(within(form).getByLabelText(/^Note/), 'Lunch with Sam')
    const banner = await expectRefusalKept(form, 'Note (optional)', 'Lunch with Sam')
    await userEvent.click(within(banner).getByRole('button', { name: 'Keep mine' }))
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.update_transaction).toHaveBeenCalledTimes(2)
    })
    expect(db.rpc.update_transaction.mock.calls[1]![0]).toMatchObject({
      p_expected_revision: 2,
      p_amount: 55_500,
      p_description: 'Lunch with Sam',
    })
  })

  it('a category', async () => {
    const db = db3()
    db.rpc.update_category.mockImplementationOnce(() => {
      db.tables.category_overview = db.tables.category_overview.map((row) =>
        row.id === 'cat-groceries'
          ? { ...row, amount: 95_000, monthly_amount: 95_000, revision: 2 }
          : row,
      )
      rpcError('record_changed')
    })
    const dialog = await openCategory(db)
    await retype(within(dialog).getByLabelText('Amount per month'), '950.00')
    await retype(within(dialog).getByLabelText('Name'), 'Food')
    await expectRefusalKept(dialog, 'Name', 'Food')
  })

  it('a subscription', async () => {
    const db = db3({ subscription_overview: [subscriptionRow()] })
    db.rpc.update_subscription.mockImplementationOnce(() => {
      db.tables.subscription_overview = db.tables.subscription_overview.map((row) => ({
        ...row,
        name: 'Netflix family',
        revision: 2,
      }))
      rpcError('record_changed')
    })
    const dialog = await openSubscription(db)
    await retype(within(dialog).getByLabelText('Name'), 'Netflix family')
    await retype(within(dialog).getByLabelText('Price per charge'), '25.00')
    await expectRefusalKept(dialog, 'Price per charge', '25.00')
  })

  it('a debt', async () => {
    const db = db3({ debt_overview: [debtRow()] })
    db.rpc.update_debt.mockImplementationOnce(() => {
      db.tables.debt_overview = db.tables.debt_overview.map((row) => ({
        ...row,
        name: 'Car loan 2',
        revision: 2,
      }))
      rpcError('record_changed')
    })
    const dialog = await openDebt(db)
    await retype(within(dialog).getByLabelText('Name'), 'Car loan 2')
    await retype(within(dialog).getByLabelText('Planned payment per month'), '99.00')
    await expectRefusalKept(dialog, 'Planned payment per month', '99.00')
  })

  it('an income', async () => {
    const db = db3({
      income_overview: [incomeRow({ id: 'income-2', name: 'Side job', is_primary: false })],
    })
    db.rpc.update_income.mockImplementationOnce(() => {
      db.tables.income_overview = db.tables.income_overview.map((row) => ({
        ...row,
        name: 'Side job 2',
        revision: 2,
      }))
      rpcError('record_changed')
    })
    const dialog = await openIncome(db)
    await retype(within(dialog).getByLabelText('Name'), 'Side job 2')
    await retype(within(dialog).getByLabelText('Amount per month'), '777.75')
    await expectRefusalKept(dialog, 'Amount per month', '777.75')
  })

  it('says saved after a lost answer only when the record holds every value sent', async () => {
    const db = db3()
    db.rpc.update_category.mockImplementationOnce(() => {
      // Only the amount reached the record (another member typed the same amount); the
      // name this form also sent is not there: not this form's save.
      db.tables.category_overview = db.tables.category_overview.map((row) =>
        row.id === 'cat-groceries'
          ? { ...row, amount: 95_000, monthly_amount: 95_000, revision: 2 }
          : row,
      )
      throw new TypeError('Failed to fetch')
    })
    const dialog = await openCategory(db)
    await retype(within(dialog).getByLabelText('Amount per month'), '950.00')
    await retype(within(dialog).getByLabelText('Name'), 'Food')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByTestId('changed-elsewhere')).toBeInTheDocument()
    expect(within(dialog).queryByTestId('saved-after-loss')).not.toBeInTheDocument()
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Food')
  })
})

/** Picks another correction period in the open dialog. */
async function pickPeriod(dialog: HTMLElement, label: string) {
  await userEvent.click(within(dialog).getByRole('combobox', { name: 'Correct from the period' }))
  await userEvent.click(await screen.findByRole('option', { name: label }))
}

const OLDEST = '25.08.2026 – 24.09.2026'

describe('typed values survive a change of correction period [D-294]', () => {
  it('a debt: the payment typed stays, the rate follows the new period', async () => {
    const db = db3({ debt_overview: [debtRow({ first_seq: 1, interest_rate: 2 })] })
    db.rpc.get_debt_terms.mockImplementation((args) => [
      {
        period_id: args.p_period_id,
        in_force: true,
        category_id: 'cat-groceries',
        interest_rate: args.p_period_id === 'period-0' ? 1 : 2,
        monthly_payment: args.p_period_id === 'period-0' ? 30_000 : 40_000,
        terms_from_period_id: args.p_period_id,
        until_period_id: null,
      },
    ])
    db.rpc.update_debt.mockImplementation(() => [])
    const dialog = await openDebt(db)
    await userEvent.click(within(dialog).getByLabelText('Correct an earlier period'))
    const payment = within(dialog).getByLabelText('Planned payment per month')
    await waitFor(() => {
      expect(payment).toHaveValue('400.00')
    })
    await retype(payment, '77.75')
    await pickPeriod(dialog, OLDEST)
    await waitFor(() => {
      expect(within(dialog).getByLabelText(/^Interest rate/)).toHaveValue('1')
    })
    expect(payment).toHaveValue('77.75')
    expect(within(dialog).getByTestId('kept-typed')).toHaveTextContent(
      'You had typed Planned payment per month: it is kept. The other fields now show the terms of the period you chose.',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.update_debt).toHaveBeenCalledWith({
        p_debt_id: DEBT_ID,
        p_expected_revision: 1,
        p_monthly_payment: 7_775,
        p_from_period_id: 'period-0',
      })
    })
  })

  it('a subscription: the price typed stays, the category follows the new period', async () => {
    const db = db3({ subscription_overview: [subscriptionRow({ first_seq: 1 })] })
    db.rpc.get_subscription_terms.mockImplementation((args) => [
      {
        period_id: args.p_period_id,
        in_force: true,
        price: args.p_period_id === 'period-0' ? 1_500 : 1_990,
        cadence: 'monthly',
        category_id: args.p_period_id === 'period-0' ? 'cat-rent' : 'cat-groceries',
        anchor_date: '2026-08-05',
        charge_day: 5,
        terms_from_period_id: args.p_period_id,
        until_period_id: null,
      },
    ])
    db.rpc.update_subscription.mockImplementation(() => [])
    const dialog = await openSubscription(db)
    await userEvent.click(within(dialog).getByLabelText('Correct an earlier period'))
    const price = within(dialog).getByLabelText('Price per charge')
    await waitFor(() => {
      expect(price).toHaveValue('19.90')
    })
    await retype(price, '77.75')
    await pickPeriod(dialog, OLDEST)
    await waitFor(() => {
      expect(within(dialog).getByRole('combobox', { name: 'Category' })).toHaveTextContent('Rent')
    })
    expect(price).toHaveValue('77.75')
    expect(within(dialog).getByTestId('kept-typed')).toHaveTextContent('You had typed')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.update_subscription).toHaveBeenCalledTimes(1)
    })
    const sent = db.rpc.update_subscription.mock.calls[0]![0]
    expect(sent).toMatchObject({ p_price: 7_775, p_from_period_id: 'period-0' })
    expect(sent).not.toHaveProperty('p_category_id')
  })

  it('an income: the amount typed stays, the pay day follows the new period', async () => {
    const db = db3({
      income_overview: [
        incomeRow({ id: 'income-2', name: 'Side job', is_primary: false, first_seq: 1 }),
      ],
    })
    db.rpc.get_income_terms.mockImplementation((args) => [
      {
        period_id: args.p_period_id,
        in_force: true,
        amount: args.p_period_id === 'period-0' ? 150_000 : 180_000,
        pay_day: args.p_period_id === 'period-0' ? 5 : 10,
        weekend_rule: 'nearest',
        terms_from_period_id: args.p_period_id,
        until_period_id: null,
      },
    ])
    db.rpc.update_income.mockImplementation(() => [])
    const dialog = await openIncome(db)
    await userEvent.click(within(dialog).getByLabelText('Correct an earlier period'))
    const amount = within(dialog).getByLabelText('Amount per month')
    await waitFor(() => {
      expect(amount).toHaveValue("1'800.00")
    })
    await retype(amount, '777.75')
    await pickPeriod(dialog, OLDEST)
    await waitFor(() => {
      expect(within(dialog).getByRole('combobox', { name: 'Pay day' })).toHaveTextContent('5')
    })
    expect(amount).toHaveValue('777.75')
    expect(within(dialog).getByTestId('kept-typed')).toHaveTextContent('You had typed')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.update_income).toHaveBeenCalledTimes(1)
    })
    const sent = db.rpc.update_income.mock.calls[0]![0]
    expect(sent).toMatchObject({ p_amount: 77_775, p_from_period_id: 'period-0' })
    expect(sent).not.toHaveProperty('p_pay_day')
  })

  it('a category: the amount typed stays over the new period’s', async () => {
    const db = db3()
    db.rpc.get_category_terms.mockImplementation((args) => [
      {
        period_id: args.p_period_id,
        in_force: true,
        amount: args.p_period_id === 'period-0' ? 50_000 : 80_000,
        cadence: 'monthly',
        terms_from_period_id: args.p_period_id,
        until_period_id: null,
      },
    ])
    db.rpc.update_category.mockImplementation(() => [])
    const dialog = await openCategory(db)
    await userEvent.click(within(dialog).getByLabelText('Correct an earlier period'))
    const amount = within(dialog).getByLabelText('Amount per month')
    await waitFor(() => {
      expect(amount).toHaveValue('800.00')
    })
    await retype(amount, '77.75')
    await pickPeriod(dialog, OLDEST)
    await waitFor(() => {
      expect(db.rpc.get_category_terms).toHaveBeenCalledWith(
        expect.objectContaining({ p_period_id: 'period-0' }),
      )
    })
    expect(await within(dialog).findByTestId('kept-typed')).toHaveTextContent('You had typed')
    expect(amount).toHaveValue('77.75')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.update_category).toHaveBeenCalledTimes(1)
    })
    expect(db.rpc.update_category.mock.calls[0]![0]).toMatchObject({
      p_amount: 7_775,
      p_from_period_id: 'period-0',
    })
  })
})

describe('a form across a long absence [R-BUDGET-280]', () => {
  it('a debt edit refused while catching up stays an edit, with what was typed', async () => {
    const db = db3({ debt_overview: [debtRow()] })
    db.rpc.update_debt.mockImplementationOnce(() => {
      // Today jumped years ahead: mid catch-up there is no current period yet.
      db.rpc.get_current_period.mockImplementation(() => [])
      rpcError('catching_up')
    })
    const dialog = await openDebt(db)
    const payment = within(dialog).getByLabelText('Planned payment per month')
    await retype(payment, '99.00')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(
      await within(dialog).findByText(/Nothing was saved: the budget was still catching up/),
    ).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Correct an earlier period')).not.toBeChecked()
    expect(payment).toHaveValue('99.00')
  })
})
