import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { editArgs, type TransferFormValues } from '@/features/transfers/transfer-terms'
import { formatMoney } from '@/lib/money'
import { categoriesDb, incomeRow } from '@/test/budget-fixtures'
import { rpcError } from '@/test/mock-db'
import { accountRow, previewRow, transferRow } from '@/test/mock-transfers'
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
  await warmPages('transfers')
}, 10_000)

const money = (rappen: number) => formatMoney(rappen).replace(/\s/g, ' ')

function transfersDb() {
  return categoriesDb({
    income_overview: [
      incomeRow(),
      incomeRow({ id: 'income-2', name: 'Sam’s salary', is_primary: false, pay_day: 20 }),
    ],
    account_overview: [
      accountRow(),
      accountRow({ id: 'acc-savings', name: 'Savings', kind: 'savings' }),
      accountRow({ id: 'acc-pillar', name: 'Third pillar', kind: 'third_pillar' }),
    ],
    transfer_overview: [
      transferRow(),
      transferRow({
        id: 'tr-pillar',
        name: 'Third pillar',
        to_account_id: 'acc-pillar',
        to_account_name: 'Third pillar',
        amount: 705_600,
        schedule: 'day_of_month',
        offset_days: null,
        day_of_month: 20,
        cadence: 'yearly',
        first_date: '2026-12-20',
        monthly_amount: 58_800,
        is_automatic: false,
        next_due_date: '2026-12-20',
      }),
    ],
  })
}

async function openPage(db = transfersDb()) {
  mock.current = createSupabaseMock(fakeSession(), db)
  renderRoutes(routes, '/transfers?view=planned')
  await screen.findAllByTestId('transfer-card')
  return db
}

function card(name: string) {
  const match = screen
    .getAllByTestId('transfer-card')
    .find((element) => element.textContent.includes(name))
  if (!match) throw new Error(`No card for ${name}`)
  return match
}

async function choose(dialog: HTMLElement, label: string, option: string) {
  await userEvent.click(within(dialog).getByLabelText(label))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

async function openAdd() {
  await userEvent.click(screen.getByRole('button', { name: 'Plan a transfer' }))
  const dialog = await screen.findByRole('dialog')
  await userEvent.type(within(dialog).getByLabelText('Name'), 'Joint account')
  await choose(dialog, 'From', 'Salary account')
  await choose(dialog, 'To', 'Savings')
  await userEvent.type(within(dialog).getByLabelText('Amount each time'), '1500')
  return dialog
}

describe('planned transfers [R-ACCOUNT-002] [R-ACCOUNT-003]', () => {
  it('lists each with its accounts, schedule, mode, next due date and monthly share [R-ACCOUNT-304] [R-ACCOUNT-314]', async () => {
    await openPage()
    const savings = card('Savings')
    expect(savings).toHaveTextContent('Salary account')
    expect(savings).toHaveTextContent('On payday')
    expect(savings).toHaveTextContent('Standing order')
    expect(within(savings).getByTestId('next-due')).toHaveTextContent('25.11.2026')

    // A yearly one: its real amount and cadence, and the monthly share the plan counts.
    const pillar = card('Third pillar')
    expect(pillar).toHaveTextContent(`Once a year on December 20 · ${money(705_600)} once a year`)
    expect(pillar).toHaveTextContent('Manual')
    expect(within(pillar).getByTestId('monthly-share')).toHaveTextContent(money(58_800))
    expect(within(pillar).getByTestId('next-due')).toHaveTextContent('20.12.2026')
  })

  it('without two accounts, says to add them first and asks for nothing else [D-501]', async () => {
    mock.current = createSupabaseMock(fakeSession(), categoriesDb())
    renderRoutes(routes, '/transfers')
    expect(await screen.findByText('Add your accounts first')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to accounts' })).toHaveAttribute(
      'href',
      '/accounts',
    )
    expect(screen.getByRole('button', { name: 'Plan a transfer' })).toBeDisabled()
  })
})

describe('creating a transfer [R-ACCOUNT-315] [R-ACCOUNT-233]', () => {
  it('plans from today: the preview and the save name no period and no first date [R-ACCOUNT-070] [R-ACCOUNT-071]', async () => {
    const db = await openPage()
    const dialog = await openAdd()
    const preview = within(dialog).getByTestId('transfer-preview')
    await within(preview).findByText('25.11.2026')
    expect(preview).toHaveTextContent('Nothing dated before today is recorded.')
    const expected = {
      p_from_account_id: 'acc-salary',
      p_to_account_id: 'acc-savings',
      p_amount: 150_000,
      p_schedule: 'pay_date',
      p_is_automatic: true,
      p_offset_days: 0,
    }
    expect(db.rpc.preview_create_transfer).toHaveBeenLastCalledWith({
      p_budget_id: expect.any(String) as string,
      ...expected,
      p_count: 6,
    })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.create_transfer).toHaveBeenCalledWith({
        p_budget_id: expect.any(String) as string,
        p_name: 'Joint account',
        p_client_id: expect.any(String) as string,
        ...expected,
      })
    })
  })

  it('records what already happened only when asked, and says what is created at once', async () => {
    const db = await openPage()
    db.rpc.preview_create_transfer.mockImplementation((args) =>
      args.p_from_period_id
        ? [
            previewRow({ due_date: '2026-10-23', created_at_once: true, created_at_once_count: 1 }),
            previewRow({ due_date: '2026-11-25', created_at_once_count: 1 }),
          ]
        : [previewRow()],
    )
    const dialog = await openAdd()
    await choose(dialog, 'Day', '2 days after payday')
    await choose(dialog, 'Whose payday', 'Sam’s salary')
    await userEvent.click(
      within(dialog).getByLabelText('It already ran: record what happened since…'),
    )
    const preview = within(dialog).getByTestId('transfer-preview')
    expect(await within(preview).findByTestId('created-at-once')).toHaveTextContent(
      'Saving records 1 transaction at once: its date has passed.',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.create_transfer).toHaveBeenCalledWith(
        expect.objectContaining({
          p_offset_days: 2,
          p_income_id: 'income-2',
          p_from_period_id: 'period-2',
        }),
      )
    })
  })

  it('a yearly transfer takes its next due date, today or later unless it already ran', async () => {
    const db = await openPage()
    const dialog = await openAdd()
    await userEvent.click(within(dialog).getByRole('radio', { name: 'On a fixed day' }))
    await choose(dialog, 'How often', 'Once a year')
    await userEvent.type(within(dialog).getByLabelText('Next due date'), '20.10.2026')
    // Said at the field before Save; nothing previewed that the form will not send.
    expect(
      await within(dialog).findByText(
        'Choose today or a later date, or record what already happened.',
      ),
    ).toBeInTheDocument()
    expect(within(dialog).getByTestId('preview-date-in-past')).toBeInTheDocument()
    expect(within(dialog).queryByTestId('preview-occurrence')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
    // Past the preview's debounce: still never asked.
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(db.rpc.preview_create_transfer).not.toHaveBeenCalledWith(
      expect.objectContaining({ p_first_date: '2026-10-20' }),
    )
    expect(db.rpc.create_transfer).not.toHaveBeenCalled()

    await userEvent.clear(within(dialog).getByLabelText('Next due date'))
    await userEvent.type(within(dialog).getByLabelText('Next due date'), '20.12.2026')
    await userEvent.click(within(dialog).getByRole('radio', { name: 'I do it myself' }))
    await userEvent.click(within(dialog).getByLabelText('Count it as spending in a category'))
    await choose(dialog, 'Category', 'Groceries')
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled()
    })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.create_transfer).toHaveBeenCalledWith(
        expect.objectContaining({
          p_schedule: 'day_of_month',
          p_cadence: 'yearly',
          p_first_date: '2026-12-20',
          p_is_automatic: false,
          p_category_id: 'cat-groceries',
        }),
      )
    })
    const sent = db.rpc.create_transfer.mock.calls[0]![0]
    expect(sent).not.toHaveProperty('p_from_period_id')
    expect(sent).not.toHaveProperty('p_day_of_month')
  })
})

describe('Save waits for the preview of what it sends [D-502] [R-APP-440]', () => {
  it('is disabled while the preview loads, and while it is refused (never retried)', async () => {
    const db = await openPage()
    let answer: (rows: unknown) => void = () => undefined
    db.rpc.preview_create_transfer.mockImplementation(
      () => new Promise((resolve) => (answer = resolve)),
    )
    const dialog = await openAdd()
    const save = within(dialog).getByRole('button', { name: 'Save' })
    // Just typed: the preview is not even asked yet (its debounce), and Save already waits.
    expect(db.rpc.preview_create_transfer).not.toHaveBeenCalled()
    expect(save).toBeDisabled()
    await waitFor(() => {
      expect(db.rpc.preview_create_transfer).toHaveBeenCalled()
    })
    expect(within(dialog).getByTestId('transfer-preview')).toHaveTextContent('Loading')
    expect(save).toBeDisabled()
    answer([previewRow()])
    await waitFor(() => {
      expect(save).toBeEnabled()
    })

    // A refusal is the database's answer: said at once, Save stays disabled, no retry.
    db.rpc.preview_create_transfer.mockClear()
    db.rpc.preview_create_transfer.mockImplementation(() => rpcError('transfer_limit_reached'))
    await userEvent.clear(within(dialog).getByLabelText('Amount each time'))
    await userEvent.type(within(dialog).getByLabelText('Amount each time'), '1600')
    expect(await within(dialog).findByTestId('transfer-preview-refused')).toBeInTheDocument()
    expect(save).toBeDisabled()
    expect(db.rpc.preview_create_transfer).toHaveBeenCalledTimes(1)
    await userEvent.click(save)
    expect(db.rpc.create_transfer).not.toHaveBeenCalled()
  })

  it('a preview that failed to load says so, offers to try again, and only then allows Save', async () => {
    const db = await openPage()
    db.rpc.preview_create_transfer.mockImplementation(() =>
      rpcError('TypeError: Failed to fetch', ''),
    )
    const dialog = await openAdd()
    const save = within(dialog).getByRole('button', { name: 'Save' })
    const failed = await within(dialog).findByTestId('preview-failed', {}, { timeout: 4000 })
    expect(failed).toHaveTextContent('The preview could not be loaded')
    expect(save).toBeDisabled()
    db.rpc.preview_create_transfer.mockImplementation(() => [previewRow()])
    const retry = within(failed).getByRole('button', { name: 'Try again' })
    await userEvent.click(retry)
    await within(dialog).findByTestId('preview-occurrence')
    expect(save).toBeEnabled()
  })

  it('a create sent again after a lost answer reuses its client id; the next create gets a new one', async () => {
    const db = await openPage()
    const real = db.rpc.create_transfer.getMockImplementation()!
    db.rpc.create_transfer.mockImplementationOnce(() => rpcError('TypeError: Failed to fetch', ''))
    const dialog = await openAdd()
    await within(dialog).findByTestId('preview-occurrence')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.create_transfer).toHaveBeenCalledTimes(1)
    })
    db.rpc.create_transfer.mockImplementation(real)
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled()
    })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.create_transfer).toHaveBeenCalledTimes(2)
    })
    const first = db.rpc.create_transfer.mock.calls[0]![0].p_client_id
    expect(db.rpc.create_transfer.mock.calls[1]![0].p_client_id).toBe(first)
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    const next = await openAdd()
    await within(next).findByTestId('preview-occurrence')
    await userEvent.click(within(next).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.create_transfer).toHaveBeenCalledTimes(3)
    })
    expect(db.rpc.create_transfer.mock.calls[2]![0].p_client_id).not.toBe(first)
  })
})

describe('editing and ending a transfer [R-VERSION-071] [R-ACCOUNT-303]', () => {
  it('previews exactly what the save sends, with what it does to recorded occurrences', async () => {
    const db = await openPage()
    db.rpc.preview_update_transfer.mockImplementation((args) => [
      previewRow({
        amount: typeof args.p_amount === 'number' ? args.p_amount : 100_000,
        transactions_removed_count: args.p_offset_days === undefined ? 0 : 1,
        marks_unplanned_count: args.p_offset_days === undefined ? 0 : 2,
      }),
    ])
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Savings' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('New terms apply from the current period (from 23.10.2026)')
    await choose(dialog, 'Day', '3 days after payday')
    const preview = within(dialog).getByTestId('transfer-preview')
    expect(await within(preview).findByTestId('transactions-removed')).toHaveTextContent(
      'It removes 1 transaction the app recorded by itself',
    )
    expect(within(preview).getByTestId('marks-unplanned')).toHaveTextContent(
      '2 ticks members made are no longer planned',
    )
    expect(db.rpc.preview_update_transfer).toHaveBeenLastCalledWith({
      p_transfer_id: 'tr-savings',
      p_schedule: 'pay_date',
      p_offset_days: 3,
      p_count: 6,
    })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.update_transfer).toHaveBeenCalledWith({
        p_transfer_id: 'tr-savings',
        p_expected_revision: 1,
        p_schedule: 'pay_date',
        p_offset_days: 3,
      })
    })
  })

  it('ending says what it removes and that every tick stays [R-ACCOUNT-234]', async () => {
    const db = await openPage()
    db.rpc.preview_end_transfer.mockImplementation(() => [
      {
        outcome: 'ended',
        refusal: null,
        occurrences_removed: 2,
        marks_kept: 1,
        transactions_kept: 1,
      },
    ])
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Savings' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'End transfer' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(await within(dialog).findByTestId('end-keeps')).toHaveTextContent(
      '1 tick (1 with its transaction) stays, listed as ended in its checklist.',
    )
    expect(dialog).toHaveTextContent('It removes 2 planned occurrences that nobody ticked off.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'End transfer' }))
    await waitFor(() => {
      expect(db.rpc.end_transfer).toHaveBeenCalledWith({
        p_transfer_id: 'tr-savings',
        p_expected_revision: 1,
      })
    })
  })

  it('a refusal to end (a held-back transaction) offers no way to confirm', async () => {
    const db = await openPage()
    db.rpc.preview_end_transfer.mockImplementation(() => [
      {
        outcome: null,
        refusal: 'transfer_held_back',
        occurrences_removed: 0,
        marks_kept: 0,
        transactions_kept: 0,
      },
    ])
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Savings' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'End transfer' }))
    const dialog = await screen.findByRole('alertdialog')
    await within(dialog).findByText(/It cannot end now/)
    expect(within(dialog).getByRole('button', { name: 'End transfer' })).toBeDisabled()
  })
})

describe('the arguments of an edit [R-VERSION-071]', () => {
  const base = {
    from_account_id: 'a',
    to_account_id: 'b',
    amount: 100,
    schedule: 'pay_date' as const,
    offset_days: 2,
    day_of_month: null,
    income_id: 'income-2',
    is_automatic: true,
    category_id: 'cat',
    cadence: null,
    first_date: null,
  }
  const values: TransferFormValues = {
    name: 'x',
    fromAccountId: 'a',
    toAccountId: 'b',
    amount: 100,
    mode: 'automatic',
    schedule: 'pay_date',
    incomeId: 'income-2',
    offsetDays: 2,
    cadence: 'monthly',
    dayOfMonth: 1,
    firstDate: '',
    linked: true,
    categoryId: 'cat',
    past: false,
    fromPeriodId: '',
  }

  it('sends nothing when nothing changed, and never the kept income again', () => {
    expect(editArgs(base, values, null)).toEqual({})
    expect(editArgs(base, { ...values, offsetDays: 3 }, null)).toEqual({
      p_schedule: 'pay_date',
      p_offset_days: 3,
    })
    expect(editArgs(base, { ...values, incomeId: '' }, 'period-1')).toEqual({
      p_schedule: 'pay_date',
      p_offset_days: 2,
      p_clear_income: true,
      p_from_period_id: 'period-1',
    })
  })

  it('unlinking clears the category; a fixed day sends its cadence and day or date', () => {
    expect(editArgs(base, { ...values, linked: false }, null)).toEqual({ p_clear_category: true })
    expect(
      editArgs(
        base,
        { ...values, schedule: 'day_of_month', cadence: 'monthly', dayOfMonth: 5 },
        null,
      ),
    ).toEqual({ p_schedule: 'day_of_month', p_cadence: 'monthly', p_day_of_month: 5 })
    expect(
      editArgs(
        base,
        { ...values, schedule: 'day_of_month', cadence: 'yearly', firstDate: '2027-03-01' },
        null,
      ),
    ).toEqual({ p_schedule: 'day_of_month', p_cadence: 'yearly', p_first_date: '2027-03-01' })
  })
})
