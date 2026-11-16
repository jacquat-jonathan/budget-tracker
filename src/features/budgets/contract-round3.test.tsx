import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { renderRoutes } from '@/test/render'
import {
  categoriesDb,
  DEBT_ID,
  debtRow,
  periodRow,
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

/** `count` monthly-ish periods, the newest current: more than one page of list_periods. */
function manyPeriods(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const seq = index + 1
    const start = new Date(Date.UTC(2016, 0, 1 + index * 30))
    const end = new Date(Date.UTC(2016, 0, 30 + index * 30))
    return periodRow({
      id: `p-${seq}`,
      seq,
      start_date: start.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
      is_current: seq === count,
      today: end.toISOString().slice(0, 10),
    })
  })
}

describe('a call answered catching_up [R-PERIOD-190]', () => {
  it('catches the budget up, keeps what was typed, and says the save can be repeated', async () => {
    const db = categoriesDb({ subscription_overview: [subscriptionRow()] })
    db.rpc.update_subscription.mockImplementationOnce(() => rpcError('catching_up'))
    db.rpc.update_subscription.mockImplementation(() => [])
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/subscriptions')
    const card = await screen.findByTestId('subscription-card')
    await userEvent.click(within(card).getByRole('button', { name: 'Actions for Netflix' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    const name = within(dialog).getByLabelText('Name')
    await userEvent.type(name, ' family')
    const before = db.rpc.ensure_periods.mock.calls.length
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(
      await within(dialog).findByText(/Nothing was saved: the budget was still catching up/),
    ).toBeInTheDocument()
    // Caught up again (ensure_periods called after the refusal), the form untouched.
    await waitFor(() => {
      expect(db.rpc.ensure_periods.mock.calls.length).toBeGreaterThan(before)
    })
    expect(name).toHaveValue('Netflix family')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.update_subscription).toHaveBeenLastCalledWith(
        expect.objectContaining({ p_name: 'Netflix family' }),
      )
    })
  })

  it('reads a refused list again once caught up', async () => {
    const db = categoriesDb({ transaction_list: [transactionRow()] })
    const list = db.rpc.list_transactions.getMockImplementation()!
    db.rpc.list_transactions.mockImplementationOnce(() => rpcError('catching_up'))
    db.rpc.list_transactions.mockImplementation(list)
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/transactions?period=all')
    expect(await screen.findAllByTestId('transaction-row')).not.toHaveLength(0)
    expect(db.rpc.list_transactions.mock.calls.length).toBeGreaterThan(1)
  })
})

describe('periods in pages [R-PERIOD-191]', () => {
  it('lists the newest 120 and reads older ones on request', async () => {
    const db = categoriesDb({ period_summaries: manyPeriods(125) })
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/periods')
    await waitFor(() => {
      expect(screen.getAllByTestId('period-row')).toHaveLength(120)
    })
    expect(db.rpc.list_periods).toHaveBeenCalledWith(expect.objectContaining({ p_limit: 120 }))
    await userEvent.click(screen.getByTestId('periods-older'))
    await waitFor(() => {
      expect(screen.getAllByTestId('period-row')).toHaveLength(125)
    })
    expect(db.rpc.list_periods).toHaveBeenCalledWith(expect.objectContaining({ p_before_seq: 6 }))
    expect(screen.queryByTestId('periods-older')).not.toBeInTheDocument()
  })
})

describe('every period picker reaches the oldest period [R-PERIOD-192]', () => {
  it('offers "Older periods…" in the transactions filter and reads them', async () => {
    const db = categoriesDb({ period_summaries: manyPeriods(125) })
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/transactions')
    await userEvent.click(await screen.findByRole('combobox', { name: 'Period' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Older periods…' }))
    await waitFor(() => {
      expect(db.rpc.list_periods).toHaveBeenCalledWith(expect.objectContaining({ p_before_seq: 6 }))
    })
    await userEvent.click(screen.getByRole('combobox', { name: 'Period' }))
    expect(await screen.findByRole('option', { name: /^01\.01\.2016/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Older periods…' })).not.toBeInTheDocument()
  })
})

describe('a reopen with more changes than listed [R-PERIOD-193]', () => {
  it('says how many more, in words', async () => {
    const db = categoriesDb()
    db.rpc.preview_reopen.mockImplementation(() => [
      {
        record_kind: 'income',
        record_id: 'i1',
        record_name: 'Salary',
        change: 'terms_changed',
        replaces_previous: false,
      },
      { record_kind: 'more', record_id: null, record_name: '123', change: 'more' },
    ])
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/periods')
    const rows = await screen.findAllByTestId('period-row')
    await userEvent.click(within(rows[0]!).getByRole('button', { name: /^Actions for/ }))
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'This period’s salary has not arrived yet' }),
    )
    expect(await screen.findByTestId('reopen-more')).toHaveTextContent(
      'And 123 more changes, not listed.',
    )
  })
})

describe('a charge held back [R-SUBSCRIPTION-190]', () => {
  it('shows a next charge date that has come as waiting, and says why', async () => {
    const db = categoriesDb({
      subscription_overview: [subscriptionRow({ next_charge_date: '2026-11-05' })],
    })
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/subscriptions')
    const held = await screen.findByTestId('charge-held')
    expect(held).toHaveTextContent('Waiting since 05.11.2026')
    expect(held).toHaveTextContent("50'000 transactions, the most it can hold")
  })

  it('says why its end is refused', async () => {
    const db = categoriesDb({ subscription_overview: [subscriptionRow()] })
    db.rpc.preview_end_subscription.mockImplementation(() => [
      { outcome: null, refusal: 'charge_held_back' },
    ])
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/subscriptions')
    const card = await screen.findByTestId('subscription-card')
    await userEvent.click(within(card).getByRole('button', { name: 'Actions for Netflix' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'End' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(
      await within(dialog).findByText(/A charge of this subscription is waiting/),
    ).toBeInTheDocument()
  })
})

describe('an ended debt cannot be changed [R-DEBT-190]', () => {
  it('says so where the edit was, and maps debt_ended on a save', async () => {
    const db = categoriesDb({ debt_overview: [debtRow({ is_active: false, end_seq: 2 })] })
    db.rpc.get_debt_history.mockImplementation(() => [])
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, `/debts/${DEBT_ID}`)
    await screen.findByTestId('detail-remaining')
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Car loan' }))
    expect(await screen.findByRole('menuitem', { name: 'Edit' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(
      screen.getByText('This debt has ended: it can no longer be changed.'),
    ).toBeInTheDocument()
  })

  it('says the debt has ended when the database refuses an edit', async () => {
    const db = categoriesDb({ debt_overview: [debtRow()] })
    db.rpc.get_debt_history.mockImplementation(() => [])
    db.rpc.update_debt.mockImplementation(() => rpcError('debt_ended'))
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, `/debts/${DEBT_ID}`)
    await screen.findByTestId('detail-remaining')
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Car loan' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Name'), ' 2')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(
      await within(dialog).findByText('This debt has ended: it can no longer be changed.'),
    ).toBeInTheDocument()
  })
})
