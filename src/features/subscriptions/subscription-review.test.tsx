import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { formatMoney } from '@/lib/money'
import { renderRoutes } from '@/test/render'
import {
  budgetRow,
  categoriesDb,
  periodRow,
  subscriptionRow,
  transactionRow,
} from '@/test/budget-fixtures'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

/**
 * Netflix: CHF 19.90 a month in Groceries in period 1 (up to period 2), CHF 24.90 every 3
 * months since period 2, as get_subscription_terms gives them.
 */
function correctionDb() {
  const db = categoriesDb({
    subscription_overview: [
      subscriptionRow({ first_seq: 1, price: 2_490, cadence: 'quarterly', monthly_cost: 830 }),
    ],
  })
  db.rpc.get_subscription_terms.mockImplementation((args) => [
    args.p_period_id === 'period-1'
      ? {
          period_id: 'period-1',
          in_force: true,
          price: 1_990,
          cadence: 'monthly',
          category_id: 'cat-groceries',
          anchor_date: '2026-10-05',
          charge_day: 5,
          terms_from_period_id: 'period-1',
          until_period_id: 'period-2',
        }
      : {
          period_id: args.p_period_id,
          in_force: true,
          price: 2_490,
          cadence: 'quarterly',
          category_id: 'cat-groceries',
          anchor_date: '2026-11-05',
          charge_day: 5,
          terms_from_period_id: 'period-2',
          until_period_id: null,
        },
  ])
  db.rpc.preview_update_subscription.mockImplementation(() => ['2027-02-05'])
  db.rpc.update_subscription.mockImplementation(() => [])
  return db
}

async function openEdit(db: ReturnType<typeof categoriesDb>) {
  mock.current = createSupabaseMock(fakeSession(), db)
  const result = renderRoutes(routes, '/subscriptions')
  const card = await screen.findByTestId('subscription-card')
  await userEvent.click(within(card).getByRole('button', { name: 'Actions for Netflix' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
  const dialog = await screen.findByRole('dialog')
  return { ...result, dialog }
}

describe('correcting a subscription from an earlier period [R-SUBSCRIPTION-140]', () => {
  it('starts from that period’s terms and sends only what was changed', async () => {
    const db = correctionDb()
    const { dialog } = await openEdit(db)
    await userEvent.click(within(dialog).getByLabelText('Correct an earlier period'))
    // The period's own terms, read from the database: not today's.
    await waitFor(() => {
      expect(within(dialog).getByLabelText('Price per charge')).toHaveValue('19.90')
    })
    expect(within(dialog).getByLabelText('Charged')).toHaveTextContent('Every month')
    expect(within(dialog).getByTestId('correction-start')).toHaveTextContent(
      'show what was in force in that period',
    )
    expect(within(dialog).getByTestId('correction-start')).toHaveTextContent(
      'The correction applies from 25.09.2026 up to the period ending 22.10.2026',
    )
    // Only the category changes.
    await userEvent.click(within(dialog).getByLabelText('Category'))
    await userEvent.click(await screen.findByRole('option', { name: 'Rent' }))
    // R-SUBSCRIPTION-121: the preview is asked with exactly the save's arguments.
    await waitFor(() => {
      expect(db.rpc.preview_update_subscription).toHaveBeenLastCalledWith({
        p_subscription_id: 'sub-netflix',
        p_category_id: 'cat-rent',
        p_from_period_id: 'period-1',
        p_count: 6,
      })
    })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.update_subscription).toHaveBeenCalledWith({
        p_subscription_id: 'sub-netflix',
        p_expected_revision: 1,
        p_category_id: 'cat-rent',
        p_from_period_id: 'period-1',
      })
    })
  })

  it('sends no correction at all when nothing of that period changed', async () => {
    const db = correctionDb()
    const { dialog } = await openEdit(db)
    await userEvent.click(within(dialog).getByLabelText('Correct an earlier period'))
    await waitFor(() => {
      expect(within(dialog).getByLabelText('Price per charge')).toHaveValue('19.90')
    })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(db.rpc.update_subscription).not.toHaveBeenCalled()
  })
})

describe('ending a subscription from an earlier period [R-SUBSCRIPTION-141]', () => {
  it('says the one outcome the database gives for the period chosen', async () => {
    const db = correctionDb()
    db.rpc.preview_end_subscription.mockImplementation((args) => [
      args.p_from_period_id === 'period-1'
        ? { outcome: 'deleted', refusal: null }
        : { outcome: 'ended', refusal: null },
    ])
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/subscriptions')
    const card = await screen.findByTestId('subscription-card')
    await userEvent.click(within(card).getByRole('button', { name: 'Actions for Netflix' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'End' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('End “Netflix”?')
    await userEvent.click(within(dialog).getByLabelText('End it from an earlier period'))
    await waitFor(() => {
      expect(dialog).toHaveTextContent('Delete “Netflix”?')
    })
    const outcome = within(dialog).getByTestId('end-subscription-outcome')
    expect(outcome).toHaveTextContent(
      'It never counted before the period you chose and has no charge, so it is deleted.',
    )
    expect(dialog).not.toHaveTextContent('End or delete')
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeEnabled()
    expect(db.rpc.preview_end_subscription).toHaveBeenLastCalledWith({
      p_subscription_id: 'sub-netflix',
      p_from_period_id: 'period-1',
    })
  })
})

describe('a subscription another member ended while it was edited [R-SUBSCRIPTION-140]', () => {
  it('says so once and offers no save', async () => {
    const db = correctionDb()
    const { dialog, queryClient } = await openEdit(db)
    await userEvent.type(within(dialog).getByLabelText('Name'), ' family')
    db.tables.subscription_overview = db.tables.subscription_overview.map((row) => ({
      ...row,
      is_active: false,
      end_seq: 2,
      revision: 2,
    }))
    await act(async () => {
      await queryClient.invalidateQueries()
    })
    const gone = await within(dialog).findByTestId('gone-elsewhere')
    expect(gone).toHaveTextContent('Someone else removed this')
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(db.rpc.update_subscription).not.toHaveBeenCalled()
  })
})

describe('the dashboard card stays compact [R-SUBSCRIPTION-142]', () => {
  it('shows the true number awaiting, the five oldest, and the way to the others', async () => {
    const charges = Array.from({ length: 7 }, (_, index) =>
      transactionRow({
        id: `charge-${index}`,
        date: `2026-10-${String(10 + index).padStart(2, '0')}`,
        charge_date: `2026-10-${String(10 + index).padStart(2, '0')}`,
        review_state: 'awaiting_confirmation',
        subscription_id: 'sub-netflix',
        subscription_name: 'Netflix',
        description: null,
        recorded_by: null,
        recorded_by_name: null,
      }),
    )
    const db = categoriesDb({
      period_summaries: [periodRow()],
      transaction_list: charges,
      // The budget's count, not the subscriptions' counts added up.
      subscription_overview: [subscriptionRow({ awaiting_count: 2 })],
    })
    db.tables.my_budgets = [budgetRow({ charges_awaiting: 318 })]
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/')
    const card = await screen.findByTestId('charges-to-confirm')
    await within(card).findByText('318 charges to confirm')
    expect(within(card).getAllByTestId('charge-to-confirm')).toHaveLength(5)
    const rest = within(card).getByTestId('charges-see-all')
    expect(rest).toHaveTextContent('And 313 more: see the transactions')
    expect(rest).toHaveAttribute('href', '/transactions?period=all&awaiting=1')
  })

  it('confirms all after saying how many and from which date, and says how many it confirmed', async () => {
    const charges = [10, 12].map((day) =>
      transactionRow({
        id: `charge-${day}`,
        date: `2026-11-${day}`,
        charge_date: `2026-11-${day}`,
        review_state: 'awaiting_confirmation',
        subscription_id: 'sub-netflix',
        subscription_name: 'Netflix',
      }),
    )
    const db = categoriesDb({ period_summaries: [periodRow()], transaction_list: charges })
    db.tables.my_budgets = [budgetRow({ charges_awaiting: 2 })]
    // Another member answered one meanwhile: one is confirmed, not two.
    db.rpc.confirm_subscription_charges.mockImplementation(() => 1)
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/')
    const card = await screen.findByTestId('charges-to-confirm')
    await within(card).findByText('2 charges to confirm')
    await userEvent.click(within(card).getByRole('button', { name: 'All went through' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Confirm all 2 charges awaiting?')
    expect(dialog).toHaveTextContent(
      'The 2 charges awaiting, dated from 10.11.2026 to 15.11.2026, are confirmed',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm all 2' }))
    await waitFor(() => {
      expect(db.rpc.confirm_subscription_charges).toHaveBeenCalledWith({
        p_budget_id: db.tables.my_budgets[0]!.id,
        p_through_date: '2026-11-15',
      })
    })
    expect(
      await screen.findByText(
        '1 charge confirmed, not 2: another member answered some meanwhile, or new ones came.',
      ),
    ).toBeInTheDocument()
  })

  it('names a moved charge by its own date, with the date it was scheduled for', async () => {
    const db = categoriesDb({
      transaction_list: [
        transactionRow({
          id: 'moved',
          amount: 1_990,
          date: '2026-11-07',
          charge_date: '2026-11-05',
          review_state: 'awaiting_confirmation',
          subscription_id: 'sub-netflix',
          subscription_name: 'Netflix',
        }),
      ],
    })
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/')
    const row = await screen.findByTestId('charge-to-confirm')
    expect(row).toHaveTextContent('07.11.2026 (scheduled for 05.11.2026)')
    expect(
      within(row).getByRole('button', {
        name: `It went through: Netflix, ${formatMoney(1_990)} on 07.11.2026`,
      }),
    ).toBeInTheDocument()
  })
})

describe('transaction rows [R-SUBSCRIPTION-123]', () => {
  it('never end with a separator', async () => {
    const db = categoriesDb({
      transaction_list: [
        transactionRow({
          id: 'auto',
          charge_date: '2026-11-08',
          review_state: 'confirmed',
          subscription_id: 'sub-netflix',
          subscription_name: 'Netflix',
          description: null,
          recorded_by: null,
          recorded_by_name: null,
        }),
      ],
    })
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/transactions')
    const row = await screen.findByTestId('transaction-row')
    const line = within(row).getByText(/Automatic charge of Netflix/)
    expect(line.textContent.trim()).toBe('Automatic charge of Netflix')
  })
})
