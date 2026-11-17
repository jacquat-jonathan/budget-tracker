import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { categoriesDb, householdDb, incomeRow, transactionRow } from '@/test/budget-fixtures'
import { transferRow } from '@/test/mock-transfers'
import { rpcError } from '@/test/mock-db'
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
  await warmPages('periods', 'income', 'transactions')
}, 10_000)

const CURRENT = 'the period 23.10.2026 – 24.11.2026'

async function periodAction(db: ReturnType<typeof householdDb>, action: string) {
  mock.current = createSupabaseMock(fakeSession(), db)
  renderRoutes(routes, '/periods')
  const [row] = await screen.findAllByTestId('period-row')
  await userEvent.click(within(row!).getByRole('button', { name: `Actions for ${CURRENT}` }))
  await userEvent.click(await screen.findByRole('menuitem', { name: action }))
  return screen.findByRole('dialog')
}

async function typeDate(dialog: HTMLElement, label: RegExp, value: string) {
  const field = within(dialog).getByLabelText(label)
  await userEvent.clear(field)
  await userEvent.type(field, value)
}

describe('the reopen follows the step 7 contract [R-ACCOUNT-313] [R-ACCOUNT-312] [R-ACCOUNT-306]', () => {
  it('previews the reopen with the pay date chosen, and says what it does to transfers', async () => {
    const db = householdDb()
    db.rpc.preview_reopen.mockImplementation((args) =>
      args.p_pay_date
        ? [
            {
              record_kind: 'transfer',
              record_id: 'tr-1',
              record_name: 'Savings',
              change: 'transaction_removed',
              replaces_previous: false,
            },
            {
              record_kind: 'transfer',
              record_id: 'tr-2',
              record_name: 'Joint',
              change: 'mark_unplanned',
              replaces_previous: false,
            },
            {
              record_kind: 'transfer',
              record_id: 'tr-2',
              record_name: 'Joint',
              change: 'mark_unplanned',
              replaces_previous: false,
            },
            {
              record_kind: 'transfer',
              record_id: 'tr-3',
              record_name: 'Gift',
              change: 'ended',
              replaces_previous: false,
            },
          ]
        : [],
    )
    const dialog = await periodAction(db, 'This period’s salary has not arrived yet')
    await typeDate(dialog, /Salary now expected on/, '20.11.2026')
    await waitFor(() => {
      expect(db.rpc.preview_reopen).toHaveBeenLastCalledWith({
        p_budget_id: 'bbbbbbbb-0000-0000-0000-000000000001',
        p_pay_date: '2026-11-20',
      })
    })
    const preview = await within(dialog).findByTestId('reopen-preview')
    expect(preview).toHaveTextContent(
      'Planned transfer “Savings”: the transaction the app recorded for its payday goes',
    )
    // One row per occurrence: both of Joint's ticks are listed.
    expect(
      within(preview).getAllByText(/Planned transfer “Joint”: a tick made by a member/),
    ).toHaveLength(2)
    // A transfer kept for its ticks is said to end, not to be removed.
    expect(preview).toHaveTextContent('Planned transfer “Gift”: its end will apply')
  })
})

describe('moving a period’s start follows the step 7 contract [R-ACCOUNT-309]', () => {
  it('shows the transfer counts, and keeps Save disabled while the preview refuses', async () => {
    const db = householdDb()
    db.rpc.preview_move_period_start.mockImplementation((args) => [
      args.p_start_date === '2026-10-20'
        ? {
            period_id: 'period-2',
            scheduled_start: '2026-10-23',
            accepted: false,
            refusal: 'interest_before_opening',
            interest_removed: 0,
            transfer_transactions_removed: 0,
            transfer_transactions_created: 0,
            transfer_marks_unplanned: 0,
          }
        : {
            period_id: 'period-2',
            scheduled_start: '2026-10-23',
            accepted: true,
            refusal: null,
            interest_removed: 0,
            transfer_transactions_removed: 1,
            transfer_transactions_created: 1,
            transfer_marks_unplanned: 0,
          },
    ])
    const dialog = await periodAction(db, 'This period’s salary actually arrived on another day')
    await typeDate(dialog, /Day the salary arrived/, '27.10.2026')
    const counts = await within(dialog).findByTestId('transfer-counts')
    expect(counts).toHaveTextContent('1 transaction the app recorded for a transfer is removed.')
    expect(counts).toHaveTextContent('1 transaction of a standing order is recorded.')
    expect(counts).toHaveTextContent('counts once in each')
    // R-ACCOUNT-425: what a member touched stays.
    expect(within(counts).getByTestId('moved-keeps')).toHaveTextContent(
      'Only what the app recorded by itself, and nobody changed since, moves to its new due date. A tick, a transfer made manual and a transaction a member edited stay exactly as they are.',
    )
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled()

    await typeDate(dialog, /Day the salary arrived/, '20.10.2026')
    await within(dialog).findByTestId('move-refused')
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('[R-ACCOUNT-426] a move to the start the period already has says it changes nothing', async () => {
    const db = householdDb()
    const dialog = await periodAction(db, 'This period’s salary actually arrived on another day')
    await typeDate(dialog, /Day the salary arrived/, '23.10.2026')
    expect(await within(dialog).findByTestId('move-no-change')).toHaveTextContent(
      'This period already starts on 23.10.2026: moving it there changes nothing.',
    )
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(within(dialog).queryByTestId('move-refused')).not.toBeInTheDocument()
    // Nothing changes, so there is nothing to undo.
    expect(within(dialog).getByTestId('boundary-preview')).not.toHaveTextContent('To undo')
  })

  it('[R-APP-440] a named error of the move’s preview is said, not a silently disabled Save', async () => {
    const db = householdDb()
    db.rpc.preview_move_period_start.mockImplementation(() => rpcError('period_not_found'))
    const dialog = await periodAction(db, 'This period’s salary actually arrived on another day')
    await typeDate(dialog, /Day the salary arrived/, '27.10.2026')
    expect(await within(dialog).findByTestId('move-preview-error')).toHaveTextContent(
      'This period no longer exists.',
    )
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(within(dialog).queryByTestId('preview-failed')).not.toBeInTheDocument()
  })

  it('Save waits while the preview loads, and when it failed offers to try again [R-APP-440]', async () => {
    const db = householdDb()
    const accepted = {
      period_id: 'period-2',
      scheduled_start: '2026-10-23',
      accepted: true,
      refusal: null,
      interest_removed: 0,
      transfer_transactions_removed: 0,
      transfer_transactions_created: 0,
      transfer_marks_unplanned: 0,
    }
    let answer: (rows: unknown) => void = () => undefined
    db.rpc.preview_move_period_start.mockImplementation((args) =>
      args.p_start_date === '2026-10-27'
        ? new Promise((resolve) => (answer = resolve))
        : args.p_start_date === '2026-10-26'
          ? rpcError('TypeError: Failed to fetch', '')
          : [accepted],
    )
    const dialog = await periodAction(db, 'This period’s salary actually arrived on another day')
    await typeDate(dialog, /Day the salary arrived/, '27.10.2026')
    await waitFor(() => {
      expect(db.rpc.preview_move_period_start).toHaveBeenCalledWith(
        expect.objectContaining({ p_start_date: '2026-10-27' }),
      )
    })
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
    answer([accepted])
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled()
    })

    await typeDate(dialog, /Day the salary arrived/, '26.10.2026')
    const failed = await within(dialog).findByTestId('preview-failed', {}, { timeout: 4000 })
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
    db.rpc.preview_move_period_start.mockImplementation(() => [accepted])
    await userEvent.click(within(failed).getByRole('button', { name: 'Try again' }))
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled()
    })
  })
})

describe('the income screens say what happens to the transfers [R-ACCOUNT-311] [R-ACCOUNT-303]', () => {
  it('removing an income names the transfers that follow its payday', async () => {
    const db = householdDb(undefined, {
      income_overview: [
        incomeRow(),
        incomeRow({ id: 'income-2', name: 'Sam’s salary', is_primary: false }),
      ],
      transfer_overview: [
        transferRow({ income_id: 'income-2', income_name: 'Sam’s salary', name: 'Joint share' }),
      ],
    })
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/income')
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Sam’s salary' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /Remove/ }))
    const dialog = await screen.findByRole('alertdialog')
    expect(await within(dialog).findByTestId('income-following-transfers')).toHaveTextContent(
      'The planned transfer “Joint share” follows this payday: what was recorded for it stays, and from its next occurrence it follows the main income.',
    )
  })

  it('[R-ACCOUNT-428] [R-ACCOUNT-461] making another income primary says a transfer naming an income keeps its paydays and one on the main income follows the new primary', async () => {
    const db = householdDb(undefined, {
      income_overview: [
        incomeRow(),
        incomeRow({ id: 'income-2', name: 'Sam’s salary', is_primary: false }),
      ],
      transfer_overview: [transferRow({ name: 'Savings', schedule: 'pay_date' })],
    })
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/income')
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Sam’s salary' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Make primary' }))
    const dialog = await screen.findByRole('alertdialog')
    const note = await within(dialog).findByTestId('primary-transfers-note')
    expect(note).toHaveTextContent(
      'one that names an income keeps happening on each of that income’s paydays, whichever income is the primary',
    )
    expect(note).toHaveTextContent(
      'One on “The main income” follows the new primary income from its next payday, which starts the next period.',
    )
    expect(note).toHaveTextContent('Nothing already recorded or ticked changes.')
    // What D-562 made untrue is no longer said.
    expect(note).not.toHaveTextContent('In this period nothing about them changes')
    // Its preview answers 0 / 0 / 0, truthfully: no count is shown.
    await within(dialog).findByTestId('pay-date-preview')
    expect(within(dialog).queryByTestId('transfer-counts')).not.toBeInTheDocument()
  })

  it('without planned payday transfers, making an income primary says nothing about them', async () => {
    const db = householdDb(undefined, {
      income_overview: [
        incomeRow(),
        incomeRow({ id: 'income-2', name: 'Sam’s salary', is_primary: false }),
      ],
      transfer_overview: [transferRow({ schedule: 'day_of_month', day_of_month: 3 })],
    })
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/income')
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Sam’s salary' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Make primary' }))
    const dialog = await screen.findByRole('alertdialog')
    await within(dialog).findByTestId('pay-date-preview')
    expect(within(dialog).queryByTestId('primary-transfers-note')).not.toBeInTheDocument()
  })

  it('a new pay day for the main income says what its preview does to transfers', async () => {
    const db = householdDb()
    db.rpc.preview_update_income.mockImplementation(() => [
      {
        period_id: 'period-2',
        end_date: '2026-11-19',
        expected_pay_date: '2026-11-20',
        end_is_manual: false,
        transfer_transactions_removed: 0,
        transfer_transactions_created: 0,
        transfer_marks_unplanned: 2,
      },
    ])
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/income')
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Salary' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByLabelText('Pay day'))
    await userEvent.click(await screen.findByRole('option', { name: 'Day 20' }))
    expect(await within(dialog).findByTestId('transfer-counts')).toHaveTextContent(
      '2 ticks made by members are no longer planned',
    )
  })

  it('[R-ACCOUNT-462] an income edit that removes and records says a moved transaction counts once in each', async () => {
    const db = householdDb()
    db.rpc.preview_update_income.mockImplementation(() => [
      {
        period_id: 'period-2',
        end_date: '2026-11-19',
        expected_pay_date: '2026-11-20',
        end_is_manual: false,
        transfer_transactions_removed: 1,
        transfer_transactions_created: 1,
        transfer_marks_unplanned: 0,
      },
    ])
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/income')
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Salary' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByLabelText('Pay day'))
    await userEvent.click(await screen.findByRole('option', { name: 'Day 20' }))
    const counts = await within(dialog).findByTestId('transfer-counts')
    expect(counts).toHaveTextContent('1 transaction the app recorded for a transfer is removed.')
    expect(counts).toHaveTextContent('1 transaction of a standing order is recorded.')
    expect(counts).toHaveTextContent(
      'A transaction that moves to a new due date counts once in each: it is removed and recorded again on that date.',
    )
    // Only a moved start says what stays exactly as it is.
    expect(within(counts).queryByTestId('moved-keeps')).not.toBeInTheDocument()
  })
})

describe('a transfer’s transaction in the transactions list [R-ACCOUNT-240]', () => {
  it('is recognisable, stays an expense of its transfer, and deleting it says the transfer did not happen', async () => {
    const db = categoriesDb({
      transaction_list: [
        transactionRow({
          id: 'tx-pillar',
          description: null,
          transfer_id: 'tr-pillar',
          transfer_name: 'Third pillar',
          transfer_occurrence_date: '2026-11-01',
          recorded_by: null,
          recorded_by_name: null,
        }),
      ],
    })
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/transactions')
    const row = await screen.findByTestId('transaction-row')
    expect(row).toHaveTextContent('Planned transfer “Third pillar”')
    await userEvent.click(within(row).getByRole('button', { name: /Actions for/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const form = await screen.findByRole('dialog')
    expect(within(form).getByTestId('transfer-note')).toHaveTextContent(
      'it stays an expense of that transfer',
    )
    expect(within(form).queryByLabelText('Debt')).not.toBeInTheDocument()
    await userEvent.click(within(form).getByRole('button', { name: 'Cancel' }))

    await userEvent.click(within(row).getByRole('button', { name: /Actions for/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const confirm = await screen.findByRole('alertdialog')
    expect(within(confirm).getByTestId('delete-transfer-note')).toHaveTextContent(
      'deleting it says the transfer did not happen',
    )
  })
})
