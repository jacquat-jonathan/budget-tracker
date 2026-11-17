import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { actionsFor } from '@/features/transfers/transfer-terms'
import { formatMoney } from '@/lib/money'
import { budgetRow, categoriesDb } from '@/test/budget-fixtures'
import { accountRow, checklistRow, transferRow } from '@/test/mock-transfers'
import { renderRoutes } from '@/test/render'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'
import { warmPages } from '@/test/warm'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

beforeAll(async () => {
  await warmPages('transfers', 'dashboard')
}, 10_000)

const money = (rappen: number) => formatMoney(rappen).replace(/\s/g, ' ')

function checklistDb() {
  const db = categoriesDb({
    account_overview: [
      accountRow(),
      accountRow({ id: 'acc-savings', name: 'Savings', kind: 'savings' }),
      accountRow({ id: 'acc-joint', name: 'Joint account' }),
    ],
    transfer_overview: [
      transferRow(),
      transferRow({ id: 'tr-joint', name: 'Joint account', is_automatic: false }),
    ],
  })
  db.checklist = [
    checklistRow(),
    checklistRow({
      transfer_id: 'tr-savings',
      name: 'Savings',
      to_account_name: 'Savings',
      amount: 100_000,
      due_date: '2026-11-25',
      occurrence_date: '2026-11-25',
      is_automatic: true,
      status: 'upcoming',
      is_overdue: false,
    }),
    checklistRow({
      transfer_id: 'tr-tax',
      name: 'Taxes',
      due_date: '2026-11-01',
      occurrence_date: '2026-11-01',
      status: 'done',
      done_on: '2026-11-02',
      amount_moved: 40_000,
      amount: 45_000,
      mark_revision: 3,
      recorded_by_name: 'Sam',
      is_overdue: false,
    }),
    checklistRow({
      transfer_id: 'tr-old',
      name: 'Old order',
      due_date: null,
      occurrence_date: '2026-10-24',
      status: 'skipped',
      mark_revision: 1,
      planned: false,
      recorded_by_name: 'Alex',
    }),
    checklistRow({
      period_id: 'period-1',
      occurrence_date: '2026-09-25',
      due_date: '2026-09-27',
      is_overdue: true,
    }),
  ]
  return db
}

async function openPage(db = checklistDb()) {
  mock.current = createSupabaseMock(fakeSession(), db)
  renderRoutes(routes, '/transfers')
  await screen.findAllByTestId('checklist-row')
  return db
}

function row(name: string) {
  const match = screen
    .getAllByTestId('checklist-row')
    .find((element) => element.textContent.startsWith(name))
  if (!match) throw new Error(`No row for ${name}`)
  return match
}

describe('the checklist of a period [R-ACCOUNT-005] [R-ACCOUNT-004]', () => {
  it('lists every occurrence with its due date, amount, accounts and state in words', async () => {
    await openPage()
    const joint = row('Joint account')
    expect(joint).toHaveTextContent('due 25.10.2026')
    expect(within(joint).getByTestId('checklist-status')).toHaveTextContent('Overdue')
    expect(
      within(joint).getByRole('button', { name: 'Mark “Joint account” as done' }),
    ).toBeEnabled()
    expect(
      within(joint).getByRole('button', { name: 'Skip “Joint account” this time' }),
    ).toBeEnabled()

    // A standing order is assumed done: nothing to tick, only "did not happen".
    const savings = row('Savings')
    expect(savings).toHaveTextContent('Standing order: assumed done on its due date')
    expect(
      within(savings)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Did not happen'])

    // Who recorded it, and the amount actually moved beside the planned one.
    const taxes = row('Taxes')
    expect(taxes).toHaveTextContent('Done on 02.11.2026 by Sam')
    expect(taxes).toHaveTextContent(money(40_000))
    expect(taxes).toHaveTextContent(`planned ${money(45_000)}`)
    expect(
      within(taxes)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Undo'])
  })

  it('a tick whose occurrence is no longer planned is flagged and can only be undone [R-ACCOUNT-301]', async () => {
    await openPage()
    const old = row('Old order')
    expect(within(old).getByTestId('checklist-status')).toHaveTextContent(
      /^Skipped by Alex · no longer planned$/,
    )
    expect(old).toHaveTextContent('It stays until you undo it.')
    expect(
      within(old)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Undo'])
  })

  it('a tick no longer planned still says what it was and what Undo removes [R-ACCOUNT-301]', async () => {
    const db = checklistDb()
    db.checklist = [
      checklistRow({
        transfer_id: 'tr-moved',
        name: 'Moved order',
        due_date: null,
        occurrence_date: '2026-10-28',
        status: 'done',
        planned: false,
        done_on: '2026-10-28',
        amount: 50_000,
        amount_moved: 45_000,
        category_id: 'cat-savings',
        category_name: 'Savings',
        transaction_id: 'tx-moved',
        mark_revision: 2,
        recorded_by_name: 'Bruno',
      }),
    ]
    await openPage(db)
    const moved = row('Moved order')
    expect(within(moved).getByTestId('checklist-status')).toHaveTextContent(
      /^Done on 28\.10\.2026 by Bruno · no longer planned$/,
    )
    expect(moved).toHaveTextContent(money(45_000))
    expect(moved).toHaveTextContent(`planned ${money(50_000)}`)
    expect(moved).toHaveTextContent('Undo removes it with its transaction in Savings.')
  })

  it('done names the occurrence and the tick read, then undo leads back [R-CONCURRENCY-230]', async () => {
    const db = await openPage()
    await userEvent.click(screen.getByRole('button', { name: 'Mark “Joint account” as done' }))
    const dialog = await screen.findByRole('dialog')
    // Today in the current period, and the planned amount.
    expect(within(dialog).getByLabelText('Done on')).toHaveValue('15.11.2026')
    const amount = within(dialog).getByLabelText('Amount moved')
    await userEvent.clear(amount)
    await userEvent.type(amount, '1400')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    await waitFor(() => {
      expect(db.rpc.mark_transfer_done).toHaveBeenCalledWith({
        p_transfer_id: 'tr-joint',
        p_period_id: 'period-2',
        p_occurrence_date: '2026-10-23',
        p_expected_revision: 0,
        p_done_on: '2026-11-15',
        p_amount: 140_000,
      })
    })
    await waitFor(() => {
      expect(within(row('Joint account')).getByTestId('checklist-status')).toHaveTextContent(
        'Done on 15.11.2026 by Alex',
      )
    })
    await userEvent.click(screen.getByRole('button', { name: 'Undo the tick of “Joint account”' }))
    await waitFor(() => {
      expect(db.rpc.undo_transfer_mark).toHaveBeenCalledWith({
        p_transfer_id: 'tr-joint',
        p_period_id: 'period-2',
        p_occurrence_date: '2026-10-23',
        p_expected_revision: 1,
      })
    })
    await waitFor(() => {
      expect(within(row('Joint account')).getByTestId('checklist-status')).toHaveTextContent(
        'Overdue',
      )
    })
  })

  it('a tick changed meanwhile is refused, said, and the list shows where it stands', async () => {
    const db = await openPage()
    // Another member skipped it after this page read the list.
    Object.assign(db.checklist[0]!, {
      status: 'skipped',
      mark_revision: 1,
      recorded_by_name: 'Sam',
    })
    await userEvent.click(screen.getByRole('button', { name: 'Skip “Joint account” this time' }))
    expect(
      await screen.findByText(/Someone ticked or changed this transfer meanwhile/),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(row('Joint account')).toHaveTextContent('Skipped by Sam')
    })
    expect(db.rpc.skip_transfer).toHaveBeenCalledTimes(1)
  })

  it('a stale Done closes its dialog with the message, and the focus goes back to the row', async () => {
    const db = await openPage()
    await userEvent.click(screen.getByRole('button', { name: 'Mark “Joint account” as done' }))
    const dialog = await screen.findByRole('dialog')
    // Another member ticks it while the dialog is open.
    Object.assign(db.checklist[0]!, {
      status: 'done',
      done_on: '2026-11-14',
      amount_moved: 150_000,
      mark_revision: 1,
      recorded_by_name: 'Sam',
    })
    const stale = /Someone ticked or changed this transfer meanwhile/
    const before = screen.queryAllByText(stale).length
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    // Said once more than before (an earlier test's toast may still be on screen).
    await waitFor(() => {
      expect(screen.queryAllByText(stale)).toHaveLength(before + 1)
    })
    await waitFor(() => {
      expect(row('Joint account')).toHaveTextContent('Done on 14.11.2026 by Sam')
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Undo the tick of “Joint account”' })).toHaveFocus()
    })
    expect(db.rpc.mark_transfer_done).toHaveBeenCalledTimes(1)
  })

  it('a past period is looked at and corrected: done defaults to its due date', async () => {
    const db = await openPage()
    await userEvent.click(screen.getByLabelText('Period'))
    await userEvent.click(await screen.findByRole('option', { name: /25\.09\.2026/ }))
    await waitFor(() => {
      expect(db.rpc.get_transfer_checklist).toHaveBeenLastCalledWith({ p_period_id: 'period-1' })
    })
    await userEvent.click(
      await screen.findByRole('button', { name: 'Mark “Joint account” as done' }),
    )
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Done on')).toHaveValue('27.09.2026')
  })
})

describe('a standing order counts as done from its due date [R-ACCOUNT-004]', () => {
  function standingOrderDb() {
    const db = checklistDb()
    db.checklist = [
      // Due, no category: no transaction and no mark, so the database gives no done date.
      checklistRow({
        transfer_id: 'tr-plain',
        name: 'Plain order',
        is_automatic: true,
        due_date: '2026-11-01',
        occurrence_date: '2026-11-01',
        status: 'done',
        assumed: true,
        is_overdue: false,
        done_on: null,
        amount_moved: null,
        mark_revision: 0,
      }),
      // Said not to have happened by a member: undo leads back to assumed done.
      checklistRow({
        transfer_id: 'tr-said',
        name: 'Said order',
        is_automatic: true,
        due_date: '2026-11-03',
        occurrence_date: '2026-11-03',
        status: 'not_done',
        is_overdue: false,
        mark_revision: 2,
        recorded_by_name: 'Sam',
      }),
      // The app's transaction kept from when it was automatic, now manual: undo deletes it.
      checklistRow({
        transfer_id: 'tr-kept',
        name: 'Kept order',
        is_automatic: false,
        category_id: 'cat-savings',
        category_name: 'Savings',
        due_date: '2026-11-02',
        occurrence_date: '2026-11-02',
        status: 'done',
        assumed: true,
        is_overdue: false,
        done_on: '2026-11-02',
        amount_moved: 150_000,
        transaction_id: 'tx-kept',
        mark_revision: 1,
      }),
    ]
    return db
  }

  it('an unlinked standing order due says “Done by standing order on” its due date', async () => {
    await openPage(standingOrderDb())
    expect(within(row('Plain order')).getByTestId('checklist-status')).toHaveTextContent(
      /^Done by standing order on 01\.11\.2026$/,
    )
  })

  it('undoing “did not happen” leads back to done by standing order on its due date', async () => {
    const db = await openPage(standingOrderDb())
    await userEvent.click(screen.getByRole('button', { name: 'Undo the tick of “Said order”' }))
    await waitFor(() => {
      expect(within(row('Said order')).getByTestId('checklist-status')).toHaveTextContent(
        /^Done by standing order on 03\.11\.2026$/,
      )
    })
    // As the database answers it: no mark and no date of its own.
    expect(db.checklist.find((item) => item.transfer_id === 'tr-said')).toMatchObject({
      done_on: null,
      mark_revision: 0,
      assumed: true,
    })
  })

  it('the app’s transaction kept on a transfer made manual can be undone', async () => {
    const db = await openPage(standingOrderDb())
    const kept = row('Kept order')
    expect(within(kept).getByTestId('checklist-status')).toHaveTextContent(
      'Done by standing order on 02.11.2026',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Undo the tick of “Kept order”' }))
    await waitFor(() => {
      expect(within(row('Kept order')).getByTestId('checklist-status')).toHaveTextContent('Overdue')
    })
    expect(db.rpc.undo_transfer_mark).toHaveBeenCalledWith(
      expect.objectContaining({ p_transfer_id: 'tr-kept', p_expected_revision: 1 }),
    )
  })
})

describe('what can be done from each state [R-ACCOUNT-240]', () => {
  it('every state has a way out, and only the marks the contract allows', () => {
    const base = checklistRow()
    expect(actionsFor(base)).toEqual({ done: true, skip: true, notDone: false, undo: false })
    const auto = { ...base, is_automatic: true, status: 'done', assumed: true, mark_revision: 1 }
    expect(actionsFor(auto)).toEqual({ done: false, skip: false, notDone: true, undo: false })
    const notDone = { ...auto, status: 'not_done', assumed: false, mark_revision: 2 }
    expect(actionsFor(notDone)).toEqual({ done: false, skip: false, notDone: false, undo: true })
    // The catch-up's transaction kept from when it was automatic: undo leads out of it.
    const kept = { ...base, status: 'done', assumed: true, mark_revision: 1 }
    expect(actionsFor(kept).undo).toBe(true)
    const unplanned = { ...base, planned: false, status: 'done', mark_revision: 1 }
    expect(actionsFor(unplanned)).toEqual({ done: false, skip: false, notDone: false, undo: true })
  })
})

describe('the dashboard’s transfers to make [R-ACCOUNT-241]', () => {
  it('counts what the database counts, once caught up, and leads to the checklist', async () => {
    const db = checklistDb()
    db.rpc.get_transfers_to_do.mockImplementation(() => [
      { transfers_to_do: 3, transfers_overdue: 2 },
    ])
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/')
    const card = await screen.findByTestId('transfers-to-do')
    expect(card).toHaveTextContent('3 transfers to make')
    expect(within(card).getByTestId('transfers-overdue')).toHaveTextContent(
      '2 of them are overdue.',
    )
    expect(within(card).getByRole('link', { name: 'Open the checklist' })).toHaveAttribute(
      'href',
      '/transfers',
    )
  })

  it('stays quiet with nothing to do, and waits for the catch-up before asking', async () => {
    const db = checklistDb()
    db.tables.my_budgets = [budgetRow({ caught_up: false })]
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/')
    await screen.findByRole('heading', { name: 'Dashboard' })
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(db.rpc.get_transfers_to_do).not.toHaveBeenCalled()
    expect(screen.queryByTestId('transfers-to-do')).not.toBeInTheDocument()
  })
})
