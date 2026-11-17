import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { categoriesDb, householdDb, incomeRow, transactionRow } from '@/test/budget-fixtures'
import { transferRow } from '@/test/mock-transfers'
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
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled()

    await typeDate(dialog, /Day the salary arrived/, '20.10.2026')
    await within(dialog).findByTestId('move-refused')
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
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
