import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import type { Tables } from '@/lib/database.types'
import { formatMoney } from '@/lib/money'
import { renderRoutes } from '@/test/render'
import { categoriesDb, periodRow, subscriptionRow, transactionRow } from '@/test/budget-fixtures'
import { rpcError } from '@/test/mock-db'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

function subscriptionsDb() {
  const db = categoriesDb({
    period_summaries: [periodRow({ committed_total: 9_990 })],
    subscription_overview: [
      subscriptionRow({ awaiting_count: 2 }),
      subscriptionRow({
        id: 'sub-insurance',
        name: 'Car insurance',
        price: 96_000,
        cadence: 'yearly',
        monthly_cost: 8_000,
        next_charge_date: '2027-01-15',
        anchor_date: '2027-01-15',
        charge_count: 0,
        removal_deletes: true,
      }),
      subscriptionRow({
        id: 'sub-old',
        name: 'Old gym',
        is_active: false,
        first_seq: 1,
        end_seq: 2,
        next_charge_date: null,
      }),
    ],
  })
  db.rpc.subscription_charge_dates.mockImplementation((args) =>
    args.p_first_charge_date === '2026-11-05'
      ? ['2026-11-05', '2026-12-05', '2027-01-05']
      : [String(args.p_first_charge_date), '2027-03-20'],
  )
  return db
}

async function openPage(db = subscriptionsDb()) {
  mock.current = createSupabaseMock(fakeSession(), db)
  const result = renderRoutes(routes, '/subscriptions')
  await screen.findAllByTestId('subscription-card')
  return { db, ...result }
}

/** Another member's save: the row as a new read returns it. */
function theirSave(
  db: ReturnType<typeof subscriptionsDb>,
  changes: Partial<Tables<'subscription_overview'>>,
) {
  db.tables.subscription_overview = db.tables.subscription_overview.map((item) =>
    item.id === 'sub-netflix' ? { ...item, ...changes } : item,
  )
}

/** Amounts as the page shows them, spaces normalised as toHaveTextContent does. */
const money = (rappen: number) => formatMoney(rappen).replace(/\s/g, ' ')

function card(name: string) {
  const match = screen
    .getAllByTestId('subscription-card')
    .find((element) => element.textContent.includes(name))
  if (!match) throw new Error(`No card for ${name}`)
  return match
}

describe('subscriptions page [R-SUBSCRIPTION-120]', () => {
  it('lists those in force with the database’s next charge, monthly cost and charges to confirm', async () => {
    await openPage()

    const netflix = card('Netflix')
    expect(within(netflix).getByTestId('next-charge')).toHaveTextContent('05.12.2026')
    expect(within(netflix).getByTestId('monthly-cost')).toHaveTextContent(money(1_990))
    // Words and an icon, not a colour alone.
    expect(within(netflix).getByTestId('awaiting-badge')).toHaveTextContent('2 charges to confirm')
    expect(within(card('Car insurance')).getByText(/per year/)).toHaveTextContent(
      `${money(96_000)} per year`,
    )
    // The total committed is the current period's committed figure, not a sum made here.
    expect(screen.getByTestId('committed-total')).toHaveTextContent(money(9_990))
  })

  it('folds the ended ones away, and offers a first one when there is none', async () => {
    await openPage()
    expect(screen.queryByText('Old gym')).not.toBeInTheDocument()
    await userEvent.click(screen.getByTestId('ended-toggle'))
    expect(await screen.findByTestId('ended-subscription')).toHaveTextContent('Old gym')

    mock.current = createSupabaseMock(fakeSession(), categoriesDb())
    renderRoutes(routes, '/subscriptions')
    expect(await screen.findByText('No subscriptions yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add your first subscription' })).toBeEnabled()
  })
})

describe('subscription form [R-SUBSCRIPTION-121]', () => {
  it('previews the charge dates the database computes, and creates the subscription', async () => {
    const { db } = await openPage()
    await userEvent.click(screen.getAllByRole('button', { name: 'Add subscription' })[0]!)
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Spotify')
    await userEvent.type(within(dialog).getByLabelText('Price per charge'), '12.90')
    await userEvent.click(within(dialog).getByLabelText('Category'))
    await userEvent.click(await screen.findByRole('option', { name: 'Groceries' }))
    await userEvent.type(within(dialog).getByLabelText('First charge date'), '05.11.2026')

    const preview = await within(dialog).findByTestId('charge-dates-preview')
    await within(preview).findByText('05.12.2026')
    // From the start of the period it counts from; the dates up to today are charged at once.
    expect(db.rpc.subscription_charge_dates).toHaveBeenCalledWith(
      expect.objectContaining({
        p_first_charge_date: '2026-11-05',
        p_cadence: 'monthly',
        p_from: '2026-10-23',
      }),
    )
    expect(within(preview).getByText(/recorded at once, to confirm/)).toBeInTheDocument()

    db.rpc.create_subscription.mockImplementation(() => [subscriptionRow({ id: 'new' })])
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.create_subscription).toHaveBeenCalledWith({
        p_budget_id: expect.any(String) as string,
        p_name: 'Spotify',
        p_price: 1_290,
        p_cadence: 'monthly',
        p_category_id: 'cat-groceries',
        p_first_charge_date: '2026-11-05',
      })
    })
  })

  it('explains that new terms apply from now, and previews a new next charge date', async () => {
    const { db } = await openPage()
    await userEvent.click(
      within(card('Netflix')).getByRole('button', { name: 'Actions for Netflix' }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('New terms apply from the current period (from 23.10.2026)')
    // The schedule as it stands: from the anchor, its next charges.
    await waitFor(() => {
      expect(db.rpc.subscription_charge_dates).toHaveBeenCalledWith(
        expect.objectContaining({ p_first_charge_date: '2026-11-05', p_from: '2026-12-05' }),
      )
    })
    await userEvent.type(
      within(dialog).getByLabelText('New next charge date (optional)'),
      '20.12.2026',
    )
    await within(dialog).findByText('20.03.2027')

    db.rpc.update_subscription.mockImplementation(() => [subscriptionRow({ revision: 2 })])
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.update_subscription).toHaveBeenCalledWith({
        p_subscription_id: 'sub-netflix',
        p_expected_revision: 1,
        p_price: 1_990,
        p_cadence: 'monthly',
        p_next_charge_date: '2026-12-20',
      })
    })
  })

  it('refuses a new next charge date that is not after today', async () => {
    const { db } = await openPage()
    await userEvent.click(
      within(card('Netflix')).getByRole('button', { name: 'Actions for Netflix' }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(
      within(dialog).getByLabelText('New next charge date (optional)'),
      '10.11.2026',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByText(/must be after today/)).toBeInTheDocument()
    expect(db.rpc.update_subscription).not.toHaveBeenCalled()
  })
})

describe('subscription terms are one field for concurrent edits [R-SUBSCRIPTION-122]', () => {
  it('keeps my price and cadence together when another member changed the terms', async () => {
    const { db, queryClient } = await openPage()
    await userEvent.click(
      within(card('Netflix')).getByRole('button', { name: 'Actions for Netflix' }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    // I change only the cadence: CHF 19.90 per year.
    await userEvent.click(within(dialog).getByLabelText('Charged'))
    await userEvent.click(await screen.findByRole('option', { name: 'Every year' }))

    // Meanwhile another member saved CHF 50.00 per month.
    theirSave(db, { price: 5_000, monthly_cost: 5_000, revision: 2 })
    await act(async () => {
      await queryClient.invalidateQueries()
    })
    const banner = await within(dialog).findByTestId('changed-elsewhere')
    // One line for the whole group, with their value.
    expect(banner).toHaveTextContent(`Price and schedule${money(5_000)} per month`)

    await userEvent.click(within(banner).getByRole('button', { name: 'Keep mine' }))
    db.rpc.update_subscription.mockImplementation(() => [subscriptionRow({ revision: 3 })])
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    // Never "CHF 50.00 per year", a value nobody chose: my group, whole, over their revision.
    await waitFor(() => {
      expect(db.rpc.update_subscription).toHaveBeenCalledWith({
        p_subscription_id: 'sub-netflix',
        p_expected_revision: 2,
        p_price: 1_990,
        p_cadence: 'yearly',
      })
    })
  })

  it('takes their terms whole when I edited only another field', async () => {
    const { db, queryClient } = await openPage()
    await userEvent.click(
      within(card('Netflix')).getByRole('button', { name: 'Actions for Netflix' }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    const name = within(dialog).getByLabelText('Name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Netflix family')

    theirSave(db, { price: 5_000, cadence: 'quarterly', revision: 2 })
    await act(async () => {
      await queryClient.invalidateQueries()
    })
    const banner = await within(dialog).findByTestId('changed-elsewhere')
    await userEvent.click(within(banner).getByRole('button', { name: 'Keep mine' }))
    db.rpc.update_subscription.mockImplementation(() => [subscriptionRow({ revision: 3 })])
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.update_subscription).toHaveBeenCalledWith({
        p_subscription_id: 'sub-netflix',
        p_expected_revision: 2,
        p_name: 'Netflix family',
      })
    })
  })
})

describe('ending a subscription [R-SUBSCRIPTION-124]', () => {
  it('says beforehand whether it is deleted or ended, from the database’s answer', async () => {
    const { db } = await openPage()
    await userEvent.click(
      within(card('Car insurance')).getByRole('button', { name: 'Actions for Car insurance' }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'End or delete' }))
    let dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByTestId('end-subscription-outcome')).toHaveTextContent(
      'it is deleted',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await userEvent.click(
      within(card('Netflix')).getByRole('button', { name: 'Actions for Netflix' }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'End or delete' }))
    dialog = await screen.findByRole('alertdialog')
    const outcome = within(dialog).getByTestId('end-subscription-outcome')
    expect(outcome).toHaveTextContent('It ends from the current period (from 23.10.2026)')
    expect(outcome).toHaveTextContent('2 charges still await confirmation')
    await userEvent.click(within(dialog).getByRole('button', { name: 'End subscription' }))
    await waitFor(() => {
      expect(db.rpc.end_subscription).toHaveBeenCalledWith({
        p_subscription_id: 'sub-netflix',
        p_expected_revision: 1,
      })
    })
  })
})

describe('dashboard: charges to confirm [R-SUBSCRIPTION-076]', () => {
  function chargesDb() {
    return categoriesDb({
      transaction_list: [
        transactionRow({
          id: 'charge-1',
          amount: 1_990,
          date: '2026-11-05',
          charge_date: '2026-11-05',
          review_state: 'awaiting_confirmation',
          subscription_id: 'sub-netflix',
          subscription_name: 'Netflix',
          recorded_by: null,
          recorded_by_name: null,
          description: null,
          revision: 4,
        }),
      ],
    })
  }

  it('asks whether each charge awaiting confirmation went through, and confirms it', async () => {
    const db = chargesDb()
    db.rpc.confirm_subscription_charge.mockImplementation(() => {
      db.tables.transaction_list[0]!.review_state = 'confirmed'
      return [db.tables.transaction_list[0]]
    })
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/')
    const card = await screen.findByTestId('charges-to-confirm')
    const row = within(card).getByTestId('charge-to-confirm')
    expect(row).toHaveTextContent('Netflix')
    expect(row).toHaveTextContent(money(1_990))
    expect(row).toHaveTextContent('05.11.2026')
    expect(row).toHaveTextContent('Groceries')
    // After the catch-up: the list is read once the periods are ensured.
    expect(db.rpc.ensure_periods).toHaveBeenCalled()

    await userEvent.click(within(row).getByRole('button', { name: /^It went through/ }))
    await waitFor(() => {
      expect(db.rpc.confirm_subscription_charge).toHaveBeenCalledWith({
        p_transaction_id: 'charge-1',
        p_expected_revision: 4,
      })
    })
    // Nothing left to confirm: nothing shown.
    await waitFor(() => {
      expect(screen.queryByTestId('charges-to-confirm')).not.toBeInTheDocument()
    })
  })

  it('says another member answered first, reloads the list, and never resends', async () => {
    const db = chargesDb()
    db.rpc.confirm_subscription_charge.mockImplementation(() => {
      db.tables.transaction_list[0]!.review_state = 'confirmed'
      rpcError('record_changed')
    })
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/')
    const card = await screen.findByTestId('charges-to-confirm')
    await userEvent.click(within(card).getByRole('button', { name: /^It went through/ }))
    expect(
      await screen.findByText(
        'Another member already answered this charge. The list has been refreshed.',
      ),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByTestId('charges-to-confirm')).not.toBeInTheDocument()
    })
    expect(db.rpc.confirm_subscription_charge).toHaveBeenCalledTimes(1)
  })

  it('asks before removing a charge that did not go through, saying it will not come back', async () => {
    const db = chargesDb()
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/')
    const card = await screen.findByTestId('charges-to-confirm')
    await userEvent.click(within(card).getByRole('button', { name: /^It did not go through/ }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(
      'It will not be created again for its scheduled date, 05.11.2026.',
    )
    expect(db.rpc.dismiss_subscription_charge).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove the charge' }))
    await waitFor(() => {
      expect(db.rpc.dismiss_subscription_charge).toHaveBeenCalledWith({
        p_transaction_id: 'charge-1',
        p_expected_revision: 4,
      })
    })
  })

  it('shows nothing when no charge awaits', async () => {
    mock.current = createSupabaseMock(fakeSession(), categoriesDb())
    renderRoutes(routes, '/')
    await screen.findByTestId('current-period-card')
    expect(screen.queryByTestId('charges-to-confirm')).not.toBeInTheDocument()
  })
})
