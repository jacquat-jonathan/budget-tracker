import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { actionsFor } from '@/features/transfers/transfer-terms'
import { formatMoney } from '@/lib/money'
import { budgetRow, categoriesDb, periodRow } from '@/test/budget-fixtures'
import { rpcError } from '@/test/mock-db'
import {
  accountRow,
  checklistRow,
  occurrenceKindOf,
  transferRow,
  type ChecklistRow as ChecklistRowType,
} from '@/test/mock-transfers'
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
  await screen.findByTestId('checklist')
  await waitFor(() => {
    expect(
      screen.queryAllByTestId('checklist-row').length +
        screen.queryAllByTestId('checklist-settled-toggle').length,
    ).toBeGreaterThan(0)
  })
  // The settled rows are folded away: unfold them to look at every row.
  const toggle = screen.queryByTestId('checklist-settled-toggle')
  if (toggle) await userEvent.click(toggle)
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
        p_occurrence_kind: 'payday',
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
        p_occurrence_kind: 'payday',
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

describe('a long checklist stays usable [D-543]', () => {
  it('folds what is settled away with its count; a row marked here stays in place', async () => {
    const db = checklistDb()
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/transfers')
    const open = await screen.findByTestId('checklist-open')
    // To do and upcoming are listed; done and no longer planned are folded, counted.
    expect(
      within(open)
        .getAllByTestId('checklist-row')
        .map((r) => r.textContent),
    ).toEqual([expect.stringMatching(/^Joint account/), expect.stringMatching(/^Savings/)])
    const toggle = screen.getByTestId('checklist-settled-toggle')
    expect(toggle).toHaveTextContent('2 done or settled')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('checklist-settled')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Skip “Joint account” this time' }))
    await waitFor(() => {
      expect(
        within(screen.getByTestId('checklist-open')).getAllByTestId('checklist-row')[0],
      ).toHaveTextContent('Skipped by Alex')
    })
    expect(
      screen.getByRole('button', { name: 'Undo the tick of “Joint account”' }),
    ).toBeInTheDocument()
  })

  it('the planned transfers are a view of their own, in the address', async () => {
    mock.current = createSupabaseMock(fakeSession(), checklistDb())
    renderRoutes(routes, '/transfers')
    await screen.findByTestId('checklist')
    expect(screen.queryByTestId('transfer-card')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Checklist' })).toHaveAttribute('aria-current', 'page')
    const planned = screen.getByRole('link', { name: 'Planned transfers (2)' })
    expect(planned).toHaveAttribute('href', '/transfers?view=planned')
    await userEvent.click(planned)
    expect(await screen.findAllByTestId('transfer-card')).toHaveLength(2)
    expect(screen.queryByTestId('checklist')).not.toBeInTheDocument()
  })
})

describe('the open rows of the period before [R-ACCOUNT-241]', () => {
  it('the current checklist says how many are still to do there and leads to them', async () => {
    const db = await openPage()
    const note = await screen.findByTestId('checklist-previous-open')
    expect(note).toHaveTextContent(
      '1 transfer is still to do in the period before (25.09.2026 to 22.10.2026).',
    )
    await userEvent.click(within(note).getByRole('button', { name: 'Open that checklist' }))
    await waitFor(() => {
      expect(db.rpc.get_transfer_checklist).toHaveBeenLastCalledWith({ p_period_id: 'period-1' })
    })
    expect(await screen.findByText('due 27.09.2026')).toBeInTheDocument()
    expect(screen.queryByTestId('checklist-previous-open')).not.toBeInTheDocument()
  })
})

describe('with every account closed [D-501]', () => {
  it('past checklists and the ended transfers stay reachable', async () => {
    const db = checklistDb()
    db.tables.account_overview = db.tables.account_overview.map((account) => ({
      ...account,
      is_active: false,
      end_seq: 2,
    }))
    db.tables.transfer_overview = db.tables.transfer_overview.map((transfer) => ({
      ...transfer,
      is_active: false,
      end_seq: 2,
      next_due_date: null,
    }))
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/transfers')
    expect(await screen.findByTestId('checklist')).toBeInTheDocument()
    expect(screen.queryByText('Add your accounts first')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Planned transfers (0)' }))
    // Nothing in force: new ones need accounts; the ended ones are listed.
    expect(await screen.findByText('Add your accounts first')).toBeInTheDocument()
    expect(screen.getByTestId('ended-transfers-toggle')).toHaveTextContent('2')
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

  it('[D-526] an assumed-done standing order offers no Undo (it would be nothing to undo), and “did not happen”', async () => {
    const db = await openPage(standingOrderDb())
    const plain = row('Plain order')
    expect(within(plain).queryByRole('button', { name: /Undo/ })).not.toBeInTheDocument()
    // As the database: undo there answers nothing_to_undo.
    expect(() =>
      db.rpc.undo_transfer_mark({
        p_transfer_id: 'tr-plain',
        p_period_id: 'period-2',
        p_occurrence_date: '2026-11-01',
        p_expected_revision: 0,
      }),
    ).toThrow('nothing_to_undo')
    await userEvent.click(
      within(plain).getByRole('button', { name: '“Plain order” did not happen' }),
    )
    await waitFor(() => {
      expect(db.rpc.mark_transfer_not_done).toHaveBeenCalledWith(
        expect.objectContaining({
          p_transfer_id: 'tr-plain',
          p_period_id: 'period-2',
          p_occurrence_date: '2026-11-01',
          p_expected_revision: 0,
        }),
      )
    })
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

  it('the mock answers as the database: undoing “did not happen” on a linked standing order due is a fresh mark, revision 1', () => {
    const db = standingOrderDb()
    Object.assign(db.checklist[1]!, { category_id: 'cat-savings', category_name: 'Savings' })
    const [after] = db.rpc.undo_transfer_mark({
      p_transfer_id: 'tr-said',
      p_period_id: 'period-2',
      p_occurrence_date: '2026-11-03',
      p_expected_revision: 2,
    }) as { mark_revision: number; status: string; assumed: boolean; done_on: string }[]
    expect(after).toMatchObject({
      status: 'done',
      assumed: true,
      done_on: '2026-11-03',
      mark_revision: 1,
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

describe('one date, two periods [R-ACCOUNT-446] [R-ACCOUNT-421]', () => {
  it('two rows of a transfer with the same date in two periods are two rows; a mark acts on the one pressed', async () => {
    const db = checklistDb()
    db.checklist = [
      checklistRow({
        period_id: 'period-1',
        due_date: '2026-10-22',
        occurrence_date: '2026-10-23',
      }),
      checklistRow({
        period_id: 'period-2',
        due_date: '2026-10-25',
        occurrence_date: '2026-10-23',
      }),
    ]
    // The checklist of the current period lists both (the earlier one kept with its date).
    db.rpc.get_transfer_checklist.mockImplementation(() =>
      db.checklist.map((item) => ({ ...item })),
    )
    await openPage(db)
    const rows = screen.getAllByTestId('checklist-row')
    expect(rows).toHaveLength(2)
    const second = rows.find((element) => element.textContent.includes('25.10.2026'))!
    await userEvent.click(
      within(second).getByRole('button', { name: 'Skip “Joint account” this time' }),
    )
    await waitFor(() => {
      expect(db.rpc.skip_transfer).toHaveBeenCalledWith(
        expect.objectContaining({ p_period_id: 'period-2', p_occurrence_date: '2026-10-23' }),
      )
    })
    // The focus stays on the row acted on, not on its twin of the other period.
    await waitFor(() => {
      const focused = document.activeElement?.closest('[data-testid="checklist-row"]')
      expect(focused?.textContent).toContain('25.10.2026')
    })
    expect(screen.getAllByTestId('checklist-row')).toHaveLength(2)
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

  it('says so when the count could not be read, and offers to try again', async () => {
    const db = checklistDb()
    db.rpc.get_transfers_to_do.mockImplementation(() => rpcError('TypeError: Failed to fetch', ''))
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/')
    const card = await screen.findByTestId('transfers-to-do', {}, { timeout: 4000 })
    expect(card).toHaveTextContent('They could not be counted just now.')
    db.rpc.get_transfers_to_do.mockImplementation(() => [
      { transfers_to_do: 1, transfers_overdue: 0 },
    ])
    await userEvent.click(within(card).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('1 transfer to make')).toBeInTheDocument()
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

describe('the note about the period before, and rows that wait [R-ACCOUNT-241] [D-543]', () => {
  it('counts only the manual transfers still to do there, never a standing order', async () => {
    const db = checklistDb()
    db.checklist.push(
      checklistRow({
        period_id: 'period-1',
        transfer_id: 'tr-savings',
        name: 'Savings',
        occurrence_date: '2026-10-20',
        due_date: '2026-10-20',
        is_automatic: true,
        status: 'upcoming',
        is_overdue: false,
      }),
      checklistRow({
        period_id: 'period-1',
        transfer_id: 'tr-auto',
        name: 'Auto',
        occurrence_date: '2026-10-21',
        due_date: '2026-10-21',
        is_automatic: true,
        status: 'to_do',
      }),
    )
    await openPage(db)
    expect(await screen.findByTestId('checklist-previous-open')).toHaveTextContent(
      '1 transfer is still to do in the period before (25.09.2026 to 22.10.2026).',
    )
  })

  it('says nothing about the period before on a past period’s checklist', async () => {
    const db = checklistDb()
    db.tables.period_summaries.unshift(
      periodRow({
        id: 'period-0',
        seq: 0,
        start_date: '2026-08-25',
        end_date: '2026-09-24',
        is_current: false,
        end_is_manual: true,
      }),
    )
    db.checklist.push(
      checklistRow({
        period_id: 'period-0',
        occurrence_date: '2026-08-25',
        due_date: '2026-08-27',
      }),
    )
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/transfers?period=period-1')
    expect(await screen.findByText('due 27.09.2026')).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(screen.queryByTestId('checklist-previous-open')).not.toBeInTheDocument()
  })

  it('a row waiting for room in the budget stays among the open rows, not folded away', async () => {
    const db = checklistDb()
    db.checklist = [
      checklistRow({
        transfer_id: 'tr-wait',
        name: 'Waiting order',
        is_automatic: true,
        status: 'done',
        held_back: true,
        is_overdue: false,
      }),
    ]
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/transfers')
    const open = await screen.findByTestId('checklist-open')
    expect(within(open).getByTestId('checklist-row')).toHaveTextContent('Waiting for room')
    expect(screen.queryByTestId('checklist-settled-toggle')).not.toBeInTheDocument()
  })
})

describe('after a mark whose row goes, the focus goes somewhere sensible [R-APP-481]', () => {
  it('undoing a tick no longer planned says it is removed with its transaction and focuses the next row', async () => {
    const db = checklistDb()
    db.checklist = [
      checklistRow({
        transfer_id: 'tr-moved',
        name: 'Moved order',
        occurrence_date: '2026-10-28',
        status: 'done',
        planned: false,
        done_on: '2026-10-28',
        category_id: 'cat-savings',
        category_name: 'Savings',
        transaction_id: 'tx-moved',
        mark_revision: 2,
      }),
      checklistRow(),
    ]
    await openPage(db)
    await userEvent.click(screen.getByRole('button', { name: 'Undo the tick of “Moved order”' }))
    expect(
      await screen.findByText(
        '“Moved order” is no longer planned here: its tick is removed, with its transaction.',
      ),
    ).toBeInTheDocument()
    // Toasts of earlier tests may linger in the shared toaster: look for this row's own.
    expect(screen.queryByText('“Moved order” is back as it was planned.')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(document.activeElement).toBe(within(row('Joint account')).getAllByRole('button')[0])
    })
  })

  it('a skip on a transfer ended meanwhile: the row is gone and the focus is on the list’s heading', async () => {
    const db = checklistDb()
    db.checklist = [checklistRow()]
    db.rpc.skip_transfer.mockImplementation(() => {
      db.checklist = []
      return rpcError('transfer_not_in_force')
    })
    await openPage(db)
    await userEvent.click(screen.getByRole('button', { name: 'Skip “Joint account” this time' }))
    await waitFor(() => {
      expect(screen.queryAllByTestId('checklist-row')).toHaveLength(0)
    })
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Checklist' }))
    })
    expect(document.activeElement).not.toBe(document.body)
  })
})

describe('two rows of one transfer with one key in one period [R-ACCOUNT-500] [R-ACCOUNT-460]', () => {
  const text = (element: Element) => element.textContent.replace(/\s/g, ' ')
  /** A row by its name and, for a twin, the start of the words that say its kind. */
  const twin = (label: string) => {
    const [name = '', kind] = label.split(', ')
    const match = screen
      .getAllByTestId('checklist-row')
      .find(
        (element) =>
          text(element).startsWith(name) && (kind === undefined || text(element).includes(kind)),
      )
    if (!match) throw new Error(`No row for ${label}`)
    return match
  }
  const status = (label: string) => text(within(twin(label)).getByTestId('checklist-status'))
  const twins = (overrides: Parameters<typeof checklistRow>[0] = {}) => [
    checklistRow({
      occurrence_date: '2026-11-20',
      due_date: '2026-11-20',
      is_overdue: false,
      ...overrides,
    }),
    checklistRow({
      occurrence_date: '2026-11-20',
      due_date: '2026-11-20',
      is_overdue: false,
      cadence: 'monthly',
      ...overrides,
      occurrence_kind: 'fixed_day',
    }),
  ]

  it('says which kind of date each twin is, and nothing on an ordinary row', async () => {
    const db = checklistDb()
    db.checklist = [...twins(), checklistRow({ transfer_id: 'tr-other', name: 'Other order' })]
    await openPage(db)
    expect(within(twin('Joint account, on the payday')).getByTestId('checklist-kind')).toBeTruthy()
    expect(twin('Joint account, on the payday')).toHaveTextContent(
      'on the payday that started the period',
    )
    expect(twin('Joint account, on its fixed day')).toHaveTextContent('on its fixed day')
    expect(within(row('Other order')).queryByTestId('checklist-kind')).not.toBeInTheDocument()
    // Keys are identifiers only: the twins' shared key is said as their due date, never apart.
    expect(screen.getAllByTestId('checklist-row')).toHaveLength(3)
  })

  it('Done and Skip each act on their own twin and send its kind; Undo undoes its own', async () => {
    const db = checklistDb()
    db.checklist = twins()
    await openPage(db)
    await userEvent.click(
      screen.getByRole('button', { name: 'Skip “Joint account, on its fixed day” this time' }),
    )
    await waitFor(() => {
      expect(db.rpc.skip_transfer).toHaveBeenCalledWith({
        p_transfer_id: 'tr-joint',
        p_period_id: 'period-2',
        p_occurrence_date: '2026-11-20',
        p_occurrence_kind: 'fixed_day',
        p_expected_revision: 0,
      })
    })
    await waitFor(() => {
      expect(status('Joint account, on its fixed day')).toBe('Skipped by Alex')
    })
    expect(status('Joint account, on the payday')).toBe('To do')
    // The focus stays on the twin acted on, not on the other one with the same key.
    await waitFor(() => {
      expect(document.activeElement?.closest('[data-testid="checklist-row"]')).toBe(
        twin('Joint account, on its fixed day'),
      )
    })

    await userEvent.click(
      screen.getByRole('button', {
        name: 'Mark “Joint account, on the payday that started the period” as done',
      }),
    )
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    await waitFor(() => {
      expect(db.rpc.mark_transfer_done).toHaveBeenCalledWith(
        expect.objectContaining({
          p_occurrence_date: '2026-11-20',
          p_occurrence_kind: 'payday',
          p_expected_revision: 0,
        }),
      )
    })
    await waitFor(() => {
      expect(status('Joint account, on the payday')).toBe('Done on 15.11.2026 by Alex')
    })
    expect(status('Joint account, on its fixed day')).toBe('Skipped by Alex')

    await userEvent.click(
      screen.getByRole('button', { name: 'Undo the tick of “Joint account, on its fixed day”' }),
    )
    await waitFor(() => {
      expect(db.rpc.undo_transfer_mark).toHaveBeenLastCalledWith(
        expect.objectContaining({ p_occurrence_kind: 'fixed_day', p_expected_revision: 1 }),
      )
    })
    await waitFor(() => {
      expect(status('Joint account, on its fixed day')).toBe('To do')
    })
    expect(status('Joint account, on the payday')).toBe('Done on 15.11.2026 by Alex')
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Undo the tick of “Joint account, on the payday that started the period”',
      }),
    )
    await waitFor(() => {
      expect(db.rpc.undo_transfer_mark).toHaveBeenLastCalledWith(
        expect.objectContaining({ p_occurrence_kind: 'payday', p_expected_revision: 1 }),
      )
    })
    await waitFor(() => {
      expect(status('Joint account, on the payday')).toBe('To do')
    })
  })

  it('a twin marked here stays in place while its settled twin stays folded away [D-543]', async () => {
    const db = checklistDb()
    const [payday, fixed] = twins()
    db.checklist = [
      payday!,
      { ...fixed!, status: 'skipped', mark_revision: 1, recorded_by_name: 'Sam' },
    ]
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/transfers')
    await screen.findByTestId('checklist-open')
    expect(screen.getByTestId('checklist-settled-toggle')).toHaveTextContent('1')
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Skip “Joint account, on the payday that started the period” this time',
      }),
    )
    await waitFor(() => {
      expect(
        within(screen.getByTestId('checklist-open')).getAllByTestId('checklist-row'),
      ).toHaveLength(1)
    })
    await waitFor(() => {
      expect(
        within(screen.getByTestId('checklist-open')).getByTestId('checklist-status'),
      ).toHaveTextContent('Skipped by Alex')
    })
    // Only the row skipped here is kept in place: its twin, settled before, is still folded.
    expect(screen.getByTestId('checklist-settled-toggle')).toHaveTextContent('1')
  })

  it('Did not happen on a standing order acts on its own twin and sends its kind', async () => {
    const db = checklistDb()
    db.checklist = [
      checklistRow({
        transfer_id: 'tr-savings',
        name: 'Savings',
        is_automatic: true,
        status: 'upcoming',
        occurrence_date: '2026-11-25',
        due_date: '2026-11-25',
        is_overdue: false,
      }),
      checklistRow({
        transfer_id: 'tr-savings',
        name: 'Savings',
        is_automatic: true,
        status: 'upcoming',
        occurrence_date: '2026-11-25',
        due_date: '2026-11-25',
        is_overdue: false,
        occurrence_kind: 'income_payday',
      }),
    ]
    await openPage(db)
    await userEvent.click(
      screen.getByRole('button', {
        name: '“Savings, on its chosen income’s payday” did not happen',
      }),
    )
    await waitFor(() => {
      expect(db.rpc.mark_transfer_not_done).toHaveBeenCalledWith({
        p_transfer_id: 'tr-savings',
        p_period_id: 'period-2',
        p_occurrence_date: '2026-11-25',
        p_occurrence_kind: 'income_payday',
        p_expected_revision: 0,
      })
    })
    await waitFor(() => {
      expect(status('Savings, on its chosen')).toBe('Did not happen (said by Alex)')
    })
    expect(status('Savings, on the payday')).toBe('Standing order: assumed done on its due date')
  })

  it('two ticks no longer planned with one key: each Undo removes its own', async () => {
    const db = checklistDb()
    db.checklist = [
      checklistRow({
        transfer_id: 'tr-old',
        name: 'Old order',
        occurrence_date: '2026-10-24',
        due_date: null,
        planned: false,
        status: 'done',
        done_on: '2026-10-24',
        mark_revision: 2,
        recorded_by_name: 'Sam',
      }),
      checklistRow({
        transfer_id: 'tr-old',
        name: 'Old order',
        occurrence_date: '2026-10-24',
        due_date: null,
        planned: false,
        status: 'skipped',
        mark_revision: 1,
        recorded_by_name: 'Sam',
        cadence: 'monthly',
      }),
    ]
    await openPage(db)
    await userEvent.click(
      screen.getByRole('button', { name: 'Undo the tick of “Old order, on its fixed day”' }),
    )
    await waitFor(() => {
      expect(db.rpc.undo_transfer_mark).toHaveBeenCalledWith({
        p_transfer_id: 'tr-old',
        p_period_id: 'period-2',
        p_occurrence_date: '2026-10-24',
        p_occurrence_kind: 'fixed_day',
        p_expected_revision: 1,
      })
    })
    await waitFor(() => {
      expect(screen.getAllByTestId('checklist-row')).toHaveLength(1)
    })
    // The one left is the other tick (done by Sam), now alone: its kind need not be said.
    expect(status('Old order')).toBe('Done on 24.10.2026 by Sam · no longer planned')
    await userEvent.click(screen.getByRole('button', { name: 'Undo the tick of “Old order”' }))
    await waitFor(() => {
      expect(db.rpc.undo_transfer_mark).toHaveBeenLastCalledWith(
        expect.objectContaining({ p_occurrence_kind: 'payday', p_expected_revision: 2 }),
      )
    })
    await waitFor(() => {
      expect(screen.queryAllByTestId('checklist-row')).toHaveLength(0)
    })
  })

  it('if the database still asks which occurrence, says the list changed and reads it again', async () => {
    const db = checklistDb()
    db.checklist = [checklistRow()]
    db.rpc.skip_transfer.mockImplementation(() => rpcError('occurrence_required'))
    await openPage(db)
    const reads = db.rpc.get_transfer_checklist.mock.calls.length
    await userEvent.click(screen.getByRole('button', { name: 'Skip “Joint account” this time' }))
    expect(
      await screen.findByText(/This period’s checklist changed meanwhile: it is shown again/),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(db.rpc.get_transfer_checklist.mock.calls.length).toBeGreaterThan(reads)
    })
    expect(db.rpc.skip_transfer).toHaveBeenCalledTimes(1)
  })

  it('a Done the database answers with occurrence_required closes its dialog and reads the list again', async () => {
    const db = checklistDb()
    db.checklist = [checklistRow()]
    db.rpc.mark_transfer_done.mockImplementation(() => rpcError('occurrence_required'))
    await openPage(db)
    await userEvent.click(screen.getByRole('button', { name: 'Mark “Joint account” as done' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(
      (await screen.findAllByText(/This period’s checklist changed meanwhile/)).length,
    ).toBeGreaterThan(0)
  })

  it('the mock refuses as the database: a call that names fewer than the period lists, or no row', () => {
    const db = checklistDb()
    db.checklist = twins({ status: 'to_do' })
    const base = { p_transfer_id: 'tr-joint', p_period_id: 'period-2', p_expected_revision: 0 }
    expect(() => db.rpc.skip_transfer(base)).toThrow('occurrence_required')
    expect(() => db.rpc.skip_transfer({ ...base, p_occurrence_date: '2026-11-20' })).toThrow(
      'occurrence_required',
    )
    expect(() =>
      db.rpc.skip_transfer({
        ...base,
        p_occurrence_date: '2026-11-20',
        p_occurrence_kind: 'income_payday',
      }),
    ).toThrow('transfer_not_in_force')
    const [skipped] = db.rpc.skip_transfer({
      ...base,
      p_occurrence_date: '2026-11-20',
      p_occurrence_kind: 'fixed_day',
    }) as ChecklistRowType[]
    expect(skipped).toMatchObject({ occurrence_kind: 'fixed_day', status: 'skipped' })
    expect(db.checklist[0]).toMatchObject({ occurrence_kind: 'payday', status: 'to_do' })
    // Only the kind, with one row of that kind there, names it too.
    expect(() =>
      db.rpc.undo_transfer_mark({
        ...base,
        p_expected_revision: 1,
        p_occurrence_kind: 'fixed_day',
      }),
    ).not.toThrow()
  })

  it.each([
    [
      'two ticks no longer planned (97k_db_fix4 “two”)',
      [
        { kind: 'payday', due: null, status: 'done', planned: false, revision: 1 },
        { kind: 'fixed_day', due: null, status: 'done', planned: false, revision: 1 },
      ],
      {
        undoNoKey: 'occurrence_required',
        undoKeyOnly: 'occurrence_required',
        undoWrongKind: 'transfer_not_in_force',
        undoStale: 'record_changed',
        skipUnplanned: 'transfer_not_in_force',
        notDoneManual: 'record_changed',
      },
    ],
    [
      'a tick no longer planned and a fixed day to do (97k_db_fix4 “ok”)',
      [
        { kind: 'payday', due: null, status: 'done', planned: false, revision: 1 },
        { kind: 'fixed_day', due: '2026-11-25', status: 'to_do', planned: true, revision: 0 },
      ],
      {
        undoNoKey: 'occurrence_required',
        undoKeyOnly: 'occurrence_required',
        undoWrongKind: 'transfer_not_in_force',
        undoStale: 'record_changed',
        skipUnplanned: 'transfer_not_in_force',
        notDoneManual: 'transfer_is_manual',
      },
    ],
  ] as const)('the mock refuses what the real stack refused for %s', (_name, real, refusals) => {
    // Rows and refusals as my stack answered them (seed2.cjs d1105..d1126, probe.cjs).
    const db = checklistDb()
    db.checklist = real.map((item) =>
      checklistRow({
        transfer_id: 'tr-hand',
        name: 'By hand',
        occurrence_date: '2026-11-25',
        occurrence_kind: item.kind,
        due_date: item.due,
        status: item.status,
        planned: item.planned,
        mark_revision: item.revision,
        is_overdue: false,
      }),
    )
    const base = { p_transfer_id: 'tr-hand', p_period_id: 'period-2' }
    const key = { ...base, p_occurrence_date: '2026-11-25' }
    const refusal = (call: () => unknown) => {
      try {
        call()
        return 'accepted'
      } catch (error) {
        return (error as Error).message
      }
    }
    expect({
      undoNoKey: refusal(() => db.rpc.undo_transfer_mark({ ...base, p_expected_revision: 1 })),
      undoKeyOnly: refusal(() => db.rpc.undo_transfer_mark({ ...key, p_expected_revision: 1 })),
      undoWrongKind: refusal(() =>
        db.rpc.undo_transfer_mark({
          ...key,
          p_expected_revision: 1,
          p_occurrence_kind: 'income_payday',
        }),
      ),
      undoStale: refusal(() =>
        db.rpc.undo_transfer_mark({ ...key, p_expected_revision: 7, p_occurrence_kind: 'payday' }),
      ),
      skipUnplanned: refusal(() =>
        db.rpc.skip_transfer({ ...key, p_expected_revision: 1, p_occurrence_kind: 'payday' }),
      ),
      notDoneManual: refusal(() =>
        db.rpc.mark_transfer_not_done({
          ...key,
          p_expected_revision: 0,
          p_occurrence_kind: 'fixed_day',
        }),
      ),
    }).toEqual(refusals)
  })

  it('the mock derives a row’s kind as the database does, not a constant payday', () => {
    expect(checklistRow().occurrence_kind).toBe('payday')
    expect(checklistRow({ cadence: 'yearly' }).occurrence_kind).toBe('fixed_day')
    const incomes = [
      { id: 'inc-ann', is_primary: true, is_active: true },
      { id: 'inc-ben', is_primary: false, is_active: true },
      { id: 'inc-gone', is_primary: false, is_active: false },
    ]
    expect(occurrenceKindOf({ schedule: 'day_of_month', income_id: null }, incomes)).toBe(
      'fixed_day',
    )
    expect(occurrenceKindOf({ schedule: 'pay_date', income_id: null }, incomes)).toBe('payday')
    expect(occurrenceKindOf({ schedule: 'pay_date', income_id: 'inc-ann' }, incomes)).toBe('payday')
    expect(occurrenceKindOf({ schedule: 'pay_date', income_id: 'inc-ben' }, incomes)).toBe(
      'income_payday',
    )
    // A chosen income no longer in force: it follows the primary's payday.
    expect(occurrenceKindOf({ schedule: 'pay_date', income_id: 'inc-gone' }, incomes)).toBe(
      'payday',
    )
  })
})

describe('the checklist and the planned transfers are history entries [R-APP-480]', () => {
  it('Back returns to the other view instead of leaving the page', async () => {
    mock.current = createSupabaseMock(fakeSession(), checklistDb())
    const { router } = renderRoutes(routes, '/transfers')
    await screen.findByTestId('checklist')
    await userEvent.click(screen.getByRole('link', { name: 'Planned transfers (2)' }))
    await screen.findAllByTestId('transfer-card')
    await router.navigate(-1)
    expect(await screen.findByTestId('checklist')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/transfers')
  })
})
