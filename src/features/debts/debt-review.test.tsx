import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import type { Tables } from '@/lib/database.types'
import { formatMoney } from '@/lib/money'
import { renderRoutes } from '@/test/render'
import { BUDGET_ID, categoriesDb, DEBT_ID, debtRow } from '@/test/budget-fixtures'
import { dbError } from '@/test/mock-db'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

const money = (rappen: number) => formatMoney(rappen).replace(/\s/g, ' ')

/**
 * The car loan: 3.5 % and CHF 400.00 in period 1 (up to period 2), 4.875 % and CHF 500.00
 * since period 2, as get_debt_terms gives them.
 */
function debtDb(overrides: Partial<Tables<'debt_overview'>> = {}) {
  const db = categoriesDb({
    debt_overview: [debtRow({ first_seq: 1, ...overrides })],
  })
  db.rpc.get_debt_history.mockImplementation(() => [])
  db.rpc.update_debt.mockImplementation(() => [])
  db.rpc.get_debt_terms.mockImplementation((args) => [
    args.p_period_id === 'period-1'
      ? {
          period_id: 'period-1',
          in_force: true,
          category_id: 'cat-groceries',
          interest_rate: 3.5,
          monthly_payment: 40_000,
          terms_from_period_id: 'period-1',
          until_period_id: 'period-2',
        }
      : {
          period_id: args.p_period_id,
          in_force: true,
          category_id: 'cat-groceries',
          interest_rate: 4.875,
          monthly_payment: 50_000,
          terms_from_period_id: 'period-2',
          until_period_id: null,
        },
  ])
  return db
}

async function openDebt(db: ReturnType<typeof debtDb>) {
  mock.current = createSupabaseMock(fakeSession(), db)
  const result = renderRoutes(routes, `/debts/${DEBT_ID}`)
  await screen.findByTestId('detail-remaining')
  return result
}

async function openEdit(db: ReturnType<typeof debtDb>) {
  const result = await openDebt(db)
  await userEvent.click(screen.getByRole('button', { name: 'More actions for Car loan' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
  return { ...result, dialog: await screen.findByRole('dialog') }
}

describe('correcting a debt from an earlier period [R-DEBT-140]', () => {
  it('starts from that period’s rate and payment and sends only what was changed [R-VERSION-140]', async () => {
    const db = debtDb()
    const { dialog } = await openEdit(db)
    await userEvent.click(within(dialog).getByLabelText('Correct an earlier period'))
    const payment = within(dialog).getByLabelText('Planned payment per month')
    await waitFor(() => {
      expect(payment).toHaveValue('400.00')
    })
    expect(db.rpc.get_debt_terms).toHaveBeenCalledWith({
      p_debt_id: DEBT_ID,
      p_period_id: 'period-1',
    })
    expect(within(dialog).getByLabelText('Interest rate per year, % (optional)')).toHaveValue('3.5')
    await userEvent.clear(payment)
    await userEvent.type(payment, '450')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.update_debt).toHaveBeenCalledWith({
        p_debt_id: DEBT_ID,
        p_expected_revision: 1,
        p_monthly_payment: 45_000,
        p_from_period_id: 'period-1',
      })
    })
  })
})

describe('how far a correction reaches [R-VERSION-150]', () => {
  it('says up to which period the correction applies, from until_period_id', async () => {
    const db = debtDb()
    const { dialog } = await openEdit(db)
    await userEvent.click(within(dialog).getByLabelText('Correct an earlier period'))
    expect(await within(dialog).findByTestId('correction-start')).toHaveTextContent(
      'The correction applies from 25.09.2026 up to the period ending 22.10.2026; from 23.10.2026, the terms recorded later stay.',
    )
  })

  it('says there is nothing to correct in a period the debt was not in force, and offers no save', async () => {
    const db = debtDb()
    db.rpc.get_debt_terms.mockImplementation((args) => [
      {
        period_id: args.p_period_id,
        in_force: false,
        category_id: null,
        interest_rate: null,
        monthly_payment: null,
        terms_from_period_id: null,
        until_period_id: 'period-2',
      },
    ])
    const { dialog } = await openEdit(db)
    await userEvent.click(within(dialog).getByLabelText('Correct an earlier period'))
    expect(await within(dialog).findByTestId('correction-not-in-force')).toHaveTextContent(
      'It did not exist in that period (not yet, or no longer), so there is nothing to correct there.',
    )
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})

describe('correcting a debt’s category [R-DEBT-140]', () => {
  it('sends a new category as a term of the period corrected', async () => {
    const db = debtDb()
    const { dialog } = await openEdit(db)
    await userEvent.click(within(dialog).getByLabelText('Correct an earlier period'))
    await waitFor(() => {
      expect(within(dialog).getByLabelText('Planned payment per month')).toHaveValue('400.00')
    })
    await userEvent.click(within(dialog).getByLabelText('Category of the payments'))
    await userEvent.click(await screen.findByRole('option', { name: 'Rent' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.update_debt).toHaveBeenCalledWith({
        p_debt_id: DEBT_ID,
        p_expected_revision: 1,
        p_category_id: 'cat-rent',
        p_from_period_id: 'period-1',
      })
    })
  })
})

describe('debt dialogs [R-DEBT-122]', () => {
  it('lets the starting amount change only while the debt has no history', async () => {
    const db = debtDb({ has_history: false, paid_total: 0, remaining: 1_200_000 })
    const { dialog, queryClient } = await openEdit(db)
    expect(within(dialog).getByLabelText('Amount owed at the start')).toBeInTheDocument()
    // A payment arrives meanwhile: no new revision, but the debt now has a history.
    db.tables.debt_overview = [debtRow({ first_seq: 1, has_history: true })]
    await act(async () => {
      await queryClient.invalidateQueries()
    })
    expect(await within(dialog).findByTestId('principal-locked')).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('Amount owed at the start')).not.toBeInTheDocument()
  })

  it('says beforehand the one outcome the database gives, from now and from an earlier period [R-SUBSCRIPTION-141]', async () => {
    const db = debtDb({ removal_deletes: true, has_history: false })
    db.rpc.preview_remove_debt.mockImplementation((args) =>
      args.p_from_period_id
        ? [{ outcome: null, refusal: 'period_not_found' }]
        : [{ outcome: 'deleted', refusal: null }],
    )
    await openDebt(db)
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Car loan' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog')
    await waitFor(() => {
      expect(within(dialog).getByTestId('remove-debt-outcome')).toHaveTextContent(
        'It has no payment, interest or adjustment yet, so it is deleted.',
      )
    })
    expect(dialog).toHaveTextContent('Delete “Car loan”?')
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeEnabled()
    expect(db.rpc.preview_remove_debt).toHaveBeenCalledWith({ p_debt_id: DEBT_ID })
    // From an earlier period: the database's answer for that period, a refusal in words.
    await userEvent.click(within(dialog).getByLabelText('End it from an earlier period'))
    await waitFor(() => {
      expect(within(dialog).getByTestId('remove-debt-outcome')).toHaveTextContent(
        'It cannot be ended from that period:',
      )
    })
    expect(db.rpc.preview_remove_debt).toHaveBeenCalledWith({
      p_debt_id: DEBT_ID,
      p_from_period_id: 'period-1',
    })
    expect(dialog).not.toHaveTextContent('End or delete')
    expect(within(dialog).getByRole('button', { name: 'End debt' })).toBeDisabled()
  })

  it('shows another member’s change of the planned payment, and keeps mine on request', async () => {
    const db = debtDb()
    const { dialog, queryClient } = await openEdit(db)
    const rate = within(dialog).getByLabelText('Interest rate per year, % (optional)')
    await userEvent.clear(rate)
    await userEvent.type(rate, '5')
    db.tables.debt_overview = [debtRow({ first_seq: 1, monthly_payment: 60_000, revision: 2 })]
    await act(async () => {
      await queryClient.invalidateQueries()
    })
    const banner = await within(dialog).findByTestId('changed-elsewhere')
    expect(banner).toHaveTextContent(`Planned payment per month${money(60_000)}`)
    await userEvent.click(within(banner).getByRole('button', { name: 'Keep mine' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    // My rate, their payment, over their revision.
    await waitFor(() => {
      expect(db.rpc.update_debt).toHaveBeenCalledWith({
        p_debt_id: DEBT_ID,
        p_expected_revision: 2,
        p_interest_rate: 5,
      })
    })
  })

  it('stops an adjustment while another member’s adjustment is unseen', async () => {
    const db = debtDb()
    db.rpc.adjust_debt_balance.mockImplementation(() => [])
    const { queryClient } = await openDebt(db)
    await userEvent.click(screen.getByRole('button', { name: 'Adjust balance' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Balance on your statement'), '11000')
    db.tables.debt_overview = [debtRow({ first_seq: 1, remaining: 1_100_000, revision: 2 })]
    await act(async () => {
      await queryClient.invalidateQueries()
    })
    const banner = await within(dialog).findByTestId('changed-elsewhere')
    // Nothing of theirs to load here: look, then continue.
    expect(within(banner).queryByRole('button', { name: 'Load their version' })).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Adjust' })).toBeDisabled()
    await userEvent.click(within(banner).getByRole('button', { name: 'I have looked, continue' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Adjust' }))
    await waitFor(() => {
      expect(db.rpc.adjust_debt_balance).toHaveBeenCalledWith(
        expect.objectContaining({ p_expected_revision: 2, p_balance: 1_100_000 }),
      )
    })
  })

  it('says once that another member ended the debt being edited, and offers no save', async () => {
    const db = debtDb()
    const { dialog, queryClient } = await openEdit(db)
    await userEvent.type(within(dialog).getByLabelText('Name'), ' 2')
    db.tables.debt_overview = [debtRow({ first_seq: 1, is_active: false, end_seq: 2, revision: 2 })]
    await act(async () => {
      await queryClient.invalidateQueries()
    })
    expect(await within(dialog).findByTestId('gone-elsewhere')).toHaveTextContent(
      'Someone else removed this',
    )
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})

describe('debt figures [R-DEBT-121]', () => {
  it('shows an overpaid debt as paid off, never a negative remaining amount', async () => {
    const db = debtDb({
      remaining: -10_000,
      overpaid_by: 10_000,
      payoff: 'paid_off',
      payments_left: null,
    })
    db.tables.debt_overview.push(debtRow({ id: 'other', name: 'Phone', remaining: 30_000 }))
    db.tables.debt_totals = [{ budget_id: BUDGET_ID, remaining_total: 30_000, owing_count: 1 }]
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/debts')
    const cards = await screen.findAllByTestId('debt-card')
    const car = cards.find((card) => card.textContent.includes('Car loan'))!
    expect(car).toHaveTextContent(`Overpaid${money(10_000)}`)
    expect(within(car).getByTestId('payoff')).toHaveTextContent(
      `Paid off · overpaid by ${money(10_000)}`,
    )
    // What is still owed: the overpaid debt adds nothing and is not counted.
    expect(screen.getByTestId('debts-total')).toHaveTextContent(
      `Still owed on 1 debt${money(30_000)}`,
    )
  })

  it('says there is no planned payment rather than "never ends at this payment"', async () => {
    const db = debtDb({ monthly_payment: 0, payoff: 'never', payments_left: null })
    await openDebt(db)
    expect(screen.getByTestId('payoff')).toHaveTextContent('No planned payment')
    expect(screen.getByTestId('payoff')).not.toHaveTextContent('Never ends')
  })

  it('says a debt that does not exist does not, and shows a failed read with a retry', async () => {
    mock.current = createSupabaseMock(fakeSession(), debtDb())
    renderRoutes(routes, '/debts/not-a-uuid')
    expect(await screen.findByText('This debt does not exist')).toBeInTheDocument()

    const db = debtDb()
    db.failNextRead('debt_overview', dbError('boom', 'XX000'))
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, `/debts/${DEBT_ID}`)
    const alert = await screen.findByRole('alert')
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByTestId('detail-remaining')).toBeInTheDocument()
  })

  it('shows words, not an empty chart, for a debt with only its opening', async () => {
    const db = debtDb()
    db.rpc.get_debt_history.mockImplementation(() => [
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
    ])
    await openDebt(db)
    expect(await screen.findByTestId('debt-chart-empty')).toHaveTextContent(
      `Only the opening so far: ${money(1_200_000)} owed since 23.10.2026.`,
    )
  })
})
