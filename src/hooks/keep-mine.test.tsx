import { renderHook, act as hookAct, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'

import { routes } from '@/app/routes'
import { assertFieldsCovered, useConcurrentForm } from '@/hooks/use-concurrent-form'
import { useEditBase, type FieldView } from '@/hooks/use-edit-base'
import { renderRoutes } from '@/test/render'
import {
  categoriesDb,
  DEBT_ID,
  debtRow,
  householdDb,
  incomeRow,
  subscriptionRow,
  transactionRow,
} from '@/test/budget-fixtures'
import { rpcError } from '@/test/mock-db'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

type Row = { revision: number; name: string; price: number; cadence: string; note: string }
const views = (row: Row): FieldView[] => [
  { key: 'name', label: 'Name', value: row.name },
  // D-160: the price and its cadence are one field.
  {
    key: 'terms',
    fields: ['price', 'cadence'],
    label: 'Terms',
    value: `${row.price}/${row.cadence}`,
  },
  { key: 'note', label: 'Note', value: row.note },
]
const valuesOf = (row: Row) => ({
  name: row.name,
  price: row.price,
  cadence: row.cadence,
  note: row.note,
})

describe('"Keep mine" keeps exactly what was typed [R-CONCURRENCY-190]', () => {
  it('keeps the fields and groups the user changed and takes every other one from now', () => {
    const opened: Row = { revision: 1, name: 'A', price: 10, cadence: 'monthly', note: 'n' }
    const theirs: Row = { revision: 2, name: 'B', price: 20, cadence: 'yearly', note: 'm' }
    const { result, rerender } = renderHook(
      ({ live }: { live: Row }) => {
        const form = useForm({ defaultValues: valuesOf(opened) })
        const edit = useEditBase(opened, live, views)
        const sync = useConcurrentForm(form, edit, valuesOf)
        return { form, sync }
      },
      { initialProps: { live: opened } },
    )
    hookAct(() => {
      // Mine: the price only (its cadence comes with it, D-160).
      result.current.form.setValue('price', 15, { shouldDirty: true })
    })
    rerender({ live: theirs })
    hookAct(() => {
      result.current.sync.keepMine()
    })
    expect(result.current.form.getValues()).toEqual({
      name: 'B',
      price: 15,
      cadence: 'monthly',
      note: 'm',
    })
  })

  it('fails on a form field that belongs to no view', () => {
    expect(() => assertFieldsCovered(['name', 'debtId'], views(valuesOfRow()), [])).toThrow(
      /"debtId" belongs to no view/,
    )
    expect(() =>
      assertFieldsCovered(['name', 'fromPeriodId'], views(valuesOfRow()), ['fromPeriodId']),
    ).not.toThrow()
  })

  it('(a) takes another member’s change of a payment’s debt, keeping only the note typed', async () => {
    const db = categoriesDb({
      debt_overview: [
        debtRow({
          id: 'debt-car',
          name: 'Car loan',
          category_id: 'cat-rent',
          category_name: 'Rent',
        }),
        debtRow({
          id: 'debt-student',
          name: 'Student loan',
          category_id: 'cat-rent',
          category_name: 'Rent',
        }),
      ],
      transaction_list: [
        transactionRow({
          id: 'pay-1',
          amount: 40_000,
          date: '2026-11-02',
          category_id: 'cat-rent',
          category_name: 'Rent',
          debt_id: 'debt-car',
          debt_name: 'Car loan',
          description: 'November',
          revision: 3,
        }),
      ],
    })
    db.rpc.update_transaction.mockImplementationOnce(() => {
      // Sam moved the payment to the student loan first (p_relink).
      db.tables.transaction_list = db.tables.transaction_list.map((row) => ({
        ...row,
        debt_id: 'debt-student',
        debt_name: 'Student loan',
        revision: 4,
      }))
      rpcError('record_changed')
    })
    db.rpc.update_transaction.mockImplementation(() => [])
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/transactions?period=all')
    const row = await screen.findByTestId('transaction-row')
    await userEvent.click(within(row).getByRole('button', { name: /^Actions for/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const form = await screen.findByTestId('transaction-form')
    const note = within(form).getByLabelText(/^Note/)
    await userEvent.clear(note)
    await userEvent.type(note, 'November, by card')
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }))
    const banner = await within(form).findByTestId('changed-elsewhere')
    expect(banner).toHaveTextContent('Student loan')
    await userEvent.click(within(banner).getByRole('button', { name: 'Keep mine' }))
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.update_transaction).toHaveBeenCalledTimes(2)
    })
    const sent = db.rpc.update_transaction.mock.calls[1]![0]
    expect(sent).toMatchObject({
      p_transaction_id: 'pay-1',
      p_expected_revision: 4,
      p_description: 'November, by card',
    })
    // The link is theirs: nothing relinked.
    expect(sent).not.toHaveProperty('p_relink')
    expect(sent).not.toHaveProperty('p_debt_id')
  })
})

function valuesOfRow(): Row {
  return { revision: 1, name: 'A', price: 1, cadence: 'monthly', note: '' }
}

/** Opens a record's edit, ticks the correction (period 1) and waits for its terms. */
async function correct(dialog: HTMLElement, label: string, value: string) {
  await userEvent.click(within(dialog).getByLabelText('Correct an earlier period'))
  await waitFor(() => {
    expect(within(dialog).getByLabelText(label)).toHaveValue(value)
  })
}

/** Refused save, the banner, Keep mine, save again; the second call's arguments. */
async function keepMineAndSave(dialog: HTMLElement, rpc: { mock: { calls: unknown[][] } }) {
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
  const banner = await within(dialog).findByTestId('changed-elsewhere')
  await userEvent.click(within(banner).getByRole('button', { name: 'Keep mine' }))
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
  await waitFor(() => {
    expect(rpc.mock.calls).toHaveLength(2)
  })
  return rpc.mock.calls[1]![0]
}

describe('(c) "Keep mine" inside a correction never brings today’s terms [R-CONCURRENCY-190]', () => {
  it('an income: the pay day of period 1 stays, Sam’s pay day from now does not enter', async () => {
    const db = householdDb(undefined, {
      income_overview: [
        incomeRow({ id: 'income-2', name: 'Side job', is_primary: false, pay_day: 10 }),
      ],
    })
    db.rpc.get_income_terms.mockImplementation((args) => [
      {
        period_id: args.p_period_id,
        in_force: true,
        amount: 180_000,
        pay_day: 10,
        weekend_rule: 'nearest',
        terms_from_period_id: 'period-1',
        until_period_id: 'period-2',
      },
    ])
    db.rpc.update_income.mockImplementationOnce(() => {
      db.tables.income_overview = db.tables.income_overview.map((row) =>
        row.id === 'income-2' ? { ...row, pay_day: 20, revision: 2 } : row,
      )
      rpcError('record_changed')
    })
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/income')
    const card = (await screen.findAllByTestId('income-card')).find((item) =>
      item.textContent.includes('Side job'),
    )!
    await userEvent.click(within(card).getByRole('button', { name: 'Actions for Side job' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    await correct(dialog, 'Amount per month', "1'800.00")
    const amount = within(dialog).getByLabelText('Amount per month')
    await userEvent.clear(amount)
    await userEvent.type(amount, '777.75')
    expect(await keepMineAndSave(dialog, db.rpc.update_income)).toEqual({
      p_income_id: 'income-2',
      p_expected_revision: 2,
      p_amount: 77_775,
      p_from_period_id: 'period-1',
    })
  })

  it('a subscription: the category of period 1 stays, Sam’s category from now does not enter', async () => {
    const db = categoriesDb({ subscription_overview: [subscriptionRow({ first_seq: 1 })] })
    db.rpc.get_subscription_terms.mockImplementation((args) => [
      {
        period_id: args.p_period_id,
        in_force: true,
        price: 1_990,
        cadence: 'monthly',
        category_id: 'cat-groceries',
        anchor_date: '2026-10-05',
        charge_day: 5,
        terms_from_period_id: 'period-1',
        until_period_id: 'period-2',
      },
    ])
    db.rpc.update_subscription.mockImplementationOnce(() => {
      db.tables.subscription_overview = db.tables.subscription_overview.map((row) => ({
        ...row,
        category_id: 'cat-rent',
        category_name: 'Rent',
        revision: 2,
      }))
      rpcError('record_changed')
    })
    db.rpc.update_subscription.mockImplementation(() => [])
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/subscriptions')
    const card = await screen.findByTestId('subscription-card')
    await userEvent.click(within(card).getByRole('button', { name: 'Actions for Netflix' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    await correct(dialog, 'Price per charge', '19.90')
    const price = within(dialog).getByLabelText('Price per charge')
    await userEvent.clear(price)
    await userEvent.type(price, '77.75')
    expect(await keepMineAndSave(dialog, db.rpc.update_subscription)).toEqual({
      p_subscription_id: 'sub-netflix',
      p_expected_revision: 2,
      p_price: 7_775,
      p_cadence: 'monthly',
      p_from_period_id: 'period-1',
    })
  })

  it('a debt: the rate of period 1 stays, Sam’s rate from now does not enter', async () => {
    const db = categoriesDb({ debt_overview: [debtRow({ first_seq: 1, interest_rate: 2 })] })
    db.rpc.get_debt_history.mockImplementation(() => [])
    db.rpc.get_debt_terms.mockImplementation((args) => [
      {
        period_id: args.p_period_id,
        in_force: true,
        category_id: 'cat-groceries',
        interest_rate: 2,
        monthly_payment: 40_000,
        terms_from_period_id: 'period-1',
        until_period_id: 'period-2',
      },
    ])
    db.rpc.update_debt.mockImplementationOnce(() => {
      db.tables.debt_overview = db.tables.debt_overview.map((row) => ({
        ...row,
        interest_rate: 9,
        revision: 2,
      }))
      rpcError('record_changed')
    })
    db.rpc.update_debt.mockImplementation(() => [])
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, `/debts/${DEBT_ID}`)
    await screen.findByTestId('detail-remaining')
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Car loan' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    await correct(dialog, 'Planned payment per month', '400.00')
    const payment = within(dialog).getByLabelText('Planned payment per month')
    await userEvent.clear(payment)
    await userEvent.type(payment, '77.75')
    expect(await keepMineAndSave(dialog, db.rpc.update_debt)).toEqual({
      p_debt_id: DEBT_ID,
      p_expected_revision: 2,
      p_monthly_payment: 7_775,
      p_from_period_id: 'period-1',
    })
  })

  it('a category: its amount of period 1 stays, Sam’s amount from now does not enter', async () => {
    const db = categoriesDb()
    db.rpc.get_category_terms.mockImplementation((args) => [
      {
        period_id: args.p_period_id,
        in_force: true,
        amount: 80_000,
        cadence: 'monthly',
        terms_from_period_id: 'period-1',
        until_period_id: 'period-2',
      },
    ])
    db.rpc.update_category.mockImplementationOnce(() => {
      db.tables.category_overview = db.tables.category_overview.map((row) =>
        row.id === 'cat-groceries'
          ? { ...row, amount: 100_000, monthly_amount: 100_000, revision: 2 }
          : row,
      )
      rpcError('record_changed')
    })
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/budget')
    await screen.findAllByTestId('category-row')
    const row = screen
      .getAllByTestId('category-row')
      .find((item) => item.textContent.includes('Groceries'))!
    await userEvent.click(within(row).getAllByRole('button', { name: 'Actions for Groceries' })[0]!)
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    await correct(dialog, 'Amount per month', '800.00')
    const name = within(dialog).getByLabelText('Name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Food')
    // Only the name was changed: no term, so no correction is sent at all.
    expect(await keepMineAndSave(dialog, db.rpc.update_category)).toEqual({
      p_category_id: 'cat-groceries',
      p_expected_revision: 2,
      p_name: 'Food',
    })
    expect(within(dialog).queryByLabelText('Amount per month')).toBeNull()
  })
})

describe('a save whose answer was lost [R-CONCURRENCY-191]', () => {
  async function editGroceries(db: ReturnType<typeof categoriesDb>) {
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/budget')
    await screen.findAllByTestId('category-row')
    const row = screen
      .getAllByTestId('category-row')
      .find((item) => item.textContent.includes('Groceries'))!
    await userEvent.click(within(row).getAllByRole('button', { name: 'Actions for Groceries' })[0]!)
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    const amount = within(dialog).getByLabelText('Amount per month')
    await userEvent.clear(amount)
    await userEvent.type(amount, '950')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    return dialog
  }

  it('says it was saved when the record now holds what was sent', async () => {
    const db = categoriesDb()
    db.rpc.update_category.mockImplementationOnce(() => {
      // The save went through; its answer never arrived.
      db.tables.category_overview = db.tables.category_overview.map((row) =>
        row.id === 'cat-groceries'
          ? { ...row, amount: 95_000, monthly_amount: 95_000, revision: 2 }
          : row,
      )
      throw new TypeError('Failed to fetch')
    })
    const dialog = await editGroceries(db)
    expect(await within(dialog).findByTestId('saved-after-loss')).toHaveTextContent(
      'Saved. The answer was lost on the way',
    )
    expect(within(dialog).queryByTestId('changed-elsewhere')).not.toBeInTheDocument()
  })

  it('says nothing was saved when the record did not change', async () => {
    const db = categoriesDb()
    db.rpc.update_category.mockImplementationOnce(() => {
      throw new TypeError('Failed to fetch')
    })
    const dialog = await editGroceries(db)
    expect(
      await within(dialog).findByText(/The connection failed: nothing was saved/),
    ).toBeInTheDocument()
    expect(within(dialog).queryByTestId('changed-elsewhere')).not.toBeInTheDocument()
  })
})
