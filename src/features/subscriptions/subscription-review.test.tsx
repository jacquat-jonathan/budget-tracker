import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import type { Tables } from '@/lib/database.types'
import { formatMoney } from '@/lib/money'
import { renderRoutes } from '@/test/render'
import {
  BUDGET_ID,
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

function version(
  seq: number,
  overrides: Partial<Tables<'subscription_versions'>>,
): Tables<'subscription_versions'> {
  return {
    id: `v${seq}`,
    budget_id: BUDGET_ID,
    subscription_id: 'sub-netflix',
    effective_from_seq: seq,
    price: 1_990,
    cadence: 'monthly',
    category_id: 'cat-groceries',
    anchor_date: '2026-10-05',
    created_at: '2026-10-01T10:00:00+00:00',
    updated_at: '2026-10-01T10:00:00+00:00',
    ...overrides,
  }
}

/** Netflix: CHF 19.90 a month in Groceries from period 1; CHF 24.90 every 3 months since 2. */
function correctionDb() {
  const db = categoriesDb({
    subscription_overview: [
      subscriptionRow({ first_seq: 1, price: 2_490, cadence: 'quarterly', monthly_cost: 830 }),
    ],
    subscription_versions: [version(1, {}), version(2, { price: 2_490, cadence: 'quarterly' })],
  })
  db.rpc.subscription_charge_dates.mockImplementation(() => ['2026-12-05'])
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
    // Only the category changes.
    await userEvent.click(within(dialog).getByLabelText('Category'))
    await userEvent.click(await screen.findByRole('option', { name: 'Rent' }))
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
  it('says both outcomes, since which one happens is only known for a removal from now', async () => {
    const db = correctionDb()
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/subscriptions')
    const card = await screen.findByTestId('subscription-card')
    await userEvent.click(within(card).getByRole('button', { name: 'Actions for Netflix' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'End or delete' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('End “Netflix”?')
    await userEvent.click(within(dialog).getByLabelText('End it from an earlier period'))
    expect(dialog).toHaveTextContent('End or delete “Netflix”?')
    const outcome = within(dialog).getByTestId('end-subscription-outcome')
    expect(outcome).toHaveTextContent('it is deleted; otherwise it ends there')
    expect(within(dialog).getByRole('button', { name: 'End or delete' })).toBeEnabled()
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
      subscription_overview: [subscriptionRow({ awaiting_count: 318 })],
    })
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/')
    const card = await screen.findByTestId('charges-to-confirm')
    await within(card).findByText('318 charges to confirm')
    expect(within(card).getAllByTestId('charge-to-confirm')).toHaveLength(5)
    expect(within(card).getByTestId('charges-see-all')).toHaveTextContent(
      'And 313 more: see the transactions',
    )
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
