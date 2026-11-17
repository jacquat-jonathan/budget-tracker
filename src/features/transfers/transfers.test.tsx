import type { ParseKeys } from 'i18next'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import i18n from '@/lib/i18n'
import { editArgs, type TransferFormValues } from '@/features/transfers/transfer-terms'
import { formatMoney } from '@/lib/money'
import { categoriesDb, incomeRow } from '@/test/budget-fixtures'
import { rpcError } from '@/test/mock-db'
import { accountRow, checklistRow, previewRow, transferRow } from '@/test/mock-transfers'
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

const radio = (dialog: HTMLElement, name: RegExp) => within(dialog).getByRole('radio', { name })

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

  it('[R-ACCOUNT-559] says its next due date as the next one not yet recorded, never as the next occurrence', async () => {
    await openPage()
    const savings = card('Savings')
    const label = within(savings).getByTestId('next-due').previousElementSibling
    expect(label).toHaveTextContent('Next due, not yet recorded')
    expect(savings).toHaveTextContent('On payday (main income)')
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
    await userEvent.click(
      within(dialog).getByRole('radio', { name: /^On a named income’s payday/ }),
    )
    await choose(dialog, 'Day', '2 days after payday')
    await choose(dialog, 'Which income', 'Sam’s salary')
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
    await userEvent.click(
      within(dialog).getByRole('radio', { name: /^On a fixed day of the month/ }),
    )
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
          p_weekend_rule: 'none',
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

describe('the transfer form’s wording [R-ACCOUNT-315] [R-ACCOUNT-550]', () => {
  it('asks for an account in the From and To selects before one is chosen', async () => {
    await openPage()
    await userEvent.click(screen.getByRole('button', { name: 'Plan a transfer' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('From')).toHaveTextContent('Choose an account')
    expect(within(dialog).getByLabelText('To')).toHaveTextContent('Choose an account')
    await choose(dialog, 'From', 'Salary account')
    expect(within(dialog).getByLabelText('From')).toHaveTextContent('Salary account')
    expect(within(dialog).getByLabelText('To')).toHaveTextContent('Choose an account')
  })

  it('says once that nothing dated before today is recorded', async () => {
    await openPage()
    const dialog = await openAdd()
    await within(within(dialog).getByTestId('transfer-preview')).findByText('25.11.2026')
    const text = dialog.textContent
    expect(text.split('before today').length - 1).toBe(1)
    expect(dialog).toHaveTextContent('It plans from today.')
  })

  it('explains the weekend rule that is chosen, and only that one', async () => {
    await openPage()
    await userEvent.click(screen.getByRole('button', { name: 'Plan a transfer' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(
      within(dialog).getByRole('radio', { name: /^On a fixed day of the month/ }),
    )
    expect(dialog).toHaveTextContent('It is due on that day, even when it falls on a Saturday')
    expect(dialog).not.toHaveTextContent('Nearest:')
    await choose(dialog, 'On a Saturday or Sunday', 'The working day before')
    expect(dialog).toHaveTextContent('A Saturday or a Sunday goes to the Friday before.')
    expect(dialog).toHaveTextContent(
      'The checklist still shows the scheduled date; only the due date moves.',
    )
    expect(dialog).not.toHaveTextContent('even when it falls on a Saturday')
    await choose(dialog, 'On a Saturday or Sunday', 'The nearest working day')
    expect(dialog).toHaveTextContent('A Saturday goes to the Friday, a Sunday to the Monday.')
    expect(dialog).not.toHaveTextContent('Friday before')
  })
})

describe('the same wording in French [R-ACCOUNT-552] [R-ACCOUNT-562]', () => {
  const fr = (key: ParseKeys, options: Record<string, unknown> = {}) =>
    i18n.t(key, { lng: 'fr', ...options })
  it('says a payday, days after it, and an income no longer followed', () => {
    expect(fr('transfers.occurrence.incomePaydayOn', { income: 'Ben' })).toBe(
      'au jour de paie de «\u202fBen\u202f»',
    )
    expect(
      fr('transfers.occurrence.incomePaydayAfter', { income: 'Ben', count: 2, date: '10.11.2026' }),
    ).toBe('2 jours après le jour de paie de «\u202fBen\u202f» (10.11.2026)')
    expect(
      fr('transfers.occurrence.incomePaydayDroppedAfter', { count: 1, date: '10.11.2026' }),
    ).toBe('1 jour après un jour de paie d’un revenu que ce virement ne suit plus (10.11.2026)')
    expect(fr('transfers.occurrence.incomePaydayDropped', { date: '10.11.2026' })).toBe(
      'à un jour de paie d’un revenu que ce virement ne suit plus, le 10.11.2026',
    )
  })
  it('says the weekend rule chosen, the dropped to-dos and the “up to” figure', () => {
    expect(fr('transfers.weekendRule.help.nearest')).toContain('Un samedi passe au vendredi')
    expect(fr('transfers.weekendRule.help.nearest')).not.toContain('Le plus proche')
    expect(fr('transfers.preview.oldToDosDropped', { count: 2 })).toBe(
      '2 échéances à faire de cette période selon l’ancien calendrier ne sont pas cochées\u202f: elles disparaissent, seules celles du nouveau calendrier restent.',
    )
    expect(fr('progress.plannedIncludesTransfersUpTo', { amount: 'CHF 10' })).toBe(
      'Dont jusqu’à CHF 10 pour des virements planifiés',
    )
    expect(fr('transfers.fields.accountPlaceholder')).toBe('Choisir un compte')
  })
})

describe('an edit that leaves a schedule drops its to-dos of this period [R-ACCOUNT-562] [D-655]', () => {
  async function editPillar(checklist: ReturnType<typeof checklistRow>[]) {
    const db = transfersDb()
    db.checklist = checklist
    await openPage(db)
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Third pillar' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    return screen.findByRole('dialog')
  }
  const todo = (overrides: Parameters<typeof checklistRow>[0] = {}) =>
    checklistRow({
      transfer_id: 'tr-pillar',
      name: 'Third pillar',
      cadence: 'yearly',
      occurrence_date: '2026-11-12',
      due_date: '2026-11-12',
      ...overrides,
    })

  it('says it, with the number, only once the kind is changed', async () => {
    const dialog = await editPillar([
      todo(),
      todo({ occurrence_date: '2026-11-15', due_date: '2026-11-15' }),
    ])
    expect(within(dialog).queryByTestId('old-todos-dropped')).not.toBeInTheDocument()
    await userEvent.click(radio(dialog, /^On the main income’s payday/))
    expect(await within(dialog).findByTestId('old-todos-dropped')).toHaveTextContent(
      '2 to-dos of this period under the old schedule are not ticked off: they are dropped',
    )
    await userEvent.click(radio(dialog, /^On a fixed day of the month/))
    await waitFor(() => {
      expect(within(dialog).queryByTestId('old-todos-dropped')).not.toBeInTheDocument()
    })
  })

  it('says nothing for a to-do somebody ticked off, one recorded, another transfer’s or another kind', async () => {
    const dialog = await editPillar([
      todo({ status: 'done', mark_revision: 2, done_on: '2026-11-12' }),
      todo({ occurrence_date: '2026-11-13', due_date: '2026-11-13', transaction_id: 'tx-1' }),
      checklistRow({ transfer_id: 'tr-savings', due_date: '2026-11-12' }),
      todo({ occurrence_kind: 'period', occurrence_date: null }),
    ])
    await userEvent.click(radio(dialog, /^On the main income’s payday/))
    await within(dialog).findByTestId('transfer-preview')
    expect(within(dialog).queryByTestId('old-todos-dropped')).not.toBeInTheDocument()
  })

  it('says one in the singular', async () => {
    const dialog = await editPillar([todo()])
    await userEvent.click(radio(dialog, /^On a named income’s payday/))
    expect(await within(dialog).findByTestId('old-todos-dropped')).toHaveTextContent(
      '1 to-do of this period under the old schedule is not ticked off: it is dropped',
    )
  })
})

describe('editing and ending a transfer [R-VERSION-071] [R-ACCOUNT-303]', () => {
  it('previews exactly what the save sends, with what it does to recorded occurrences [R-ACCOUNT-555]', async () => {
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
    // R-ACCOUNT-555: “from now” is said as the start of the current period (Q-357).
    expect(dialog).toHaveTextContent(
      '“From now” means from the start of the current period, 23.10.2026, not from today',
    )
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

  it('[R-ACCOUNT-501] an occurrence already recorded says so on its row and that it stays as it is', async () => {
    const db = transfersDb()
    // This period's Savings occurrence was recorded (the catch-up's transaction, its mark).
    db.checklist = [
      checklistRow({
        transfer_id: 'tr-savings',
        name: 'Savings',
        is_automatic: true,
        due_date: '2026-11-25',
        status: 'done',
        assumed: true,
        mark_revision: 1,
      }),
    ]
    await openPage(db)
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Savings' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    const amount = within(dialog).getByLabelText('Amount each time')
    await userEvent.clear(amount)
    await userEvent.type(amount, '1200')
    const preview = within(dialog).getByTestId('transfer-preview')
    await waitFor(() => {
      expect(db.rpc.preview_update_transfer).toHaveBeenLastCalledWith(
        expect.objectContaining({ p_amount: 120_000 }),
      )
    })
    const recorded = await within(preview).findByTestId('preview-recorded')
    expect(recorded).toHaveTextContent('already recorded, stays as it is')
    expect(recorded.closest('[data-testid="preview-occurrence"]')).toHaveTextContent('25.11.2026')
  })

  it('[R-ACCOUNT-501] a row the database answers not recorded says nothing of the kind', async () => {
    const db = await openPage()
    db.rpc.preview_update_transfer.mockImplementation(() => [
      previewRow({ already_recorded: false }),
      previewRow({
        projected: true,
        period_id: null as unknown as string,
        due_date: '2026-12-25',
        occurrence_date: '2026-12-25',
      }),
    ])
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Savings' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    const amount = within(dialog).getByLabelText('Amount each time')
    await userEvent.clear(amount)
    await userEvent.type(amount, '1200')
    const preview = within(dialog).getByTestId('transfer-preview')
    await waitFor(() => {
      expect(within(preview).getAllByTestId('preview-occurrence')).toHaveLength(2)
    })
    expect(within(preview).queryByTestId('preview-recorded')).not.toBeInTheDocument()
  })

  it('[R-ACCOUNT-554] a transaction only moved is said once, as a move, not as removed and recorded', async () => {
    const db = await openPage()
    db.rpc.preview_update_transfer.mockImplementation((args) => {
      const moves = args.p_offset_days !== undefined ? 1 : 0
      return [
        previewRow({
          created_at_once: moves > 0,
          created_at_once_count: moves,
          transactions_removed_count: moves,
          transactions_moved_count: moves,
        }),
      ]
    })
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Savings' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    const preview = within(dialog).getByTestId('transfer-preview')
    await waitFor(() => {
      expect(within(preview).getAllByTestId('preview-occurrence')).toHaveLength(1)
    })
    expect(within(preview).queryByTestId('transactions-moved')).not.toBeInTheDocument()
    await choose(dialog, 'Day', '3 days after payday')
    expect(await within(preview).findByTestId('transactions-moved')).toHaveTextContent(
      'It moves 1 transaction the app recorded by itself to its new due date: removed on the old date, recorded again on the new one.',
    )
    // One move, never "1 removed, 1 recorded, 1 moved".
    expect(within(preview).queryByTestId('transactions-removed')).not.toBeInTheDocument()
    expect(within(preview).queryByTestId('created-at-once')).not.toBeInTheDocument()
  })

  it('[R-ACCOUNT-554] removals and moves together: the removals, then how many of them are moves', async () => {
    const db = await openPage()
    db.rpc.preview_update_transfer.mockImplementation(() => [
      previewRow({
        created_at_once: true,
        created_at_once_count: 1,
        transactions_removed_count: 2,
        transactions_moved_count: 1,
      }),
    ])
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Savings' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    const preview = within(dialog).getByTestId('transfer-preview')
    expect(await within(preview).findByTestId('transactions-removed')).toHaveTextContent(
      'It removes 2 transactions the app recorded by itself',
    )
    expect(within(preview).getByTestId('created-at-once')).toHaveTextContent(
      'Saving records 1 transaction at once',
    )
    expect(within(preview).getByTestId('transactions-moved')).toHaveTextContent(
      'Of these, 1 is one transaction moved to its new due date: it counts once as removed and once as recorded.',
    )
    // Q-356, said where a removal is: a member's edit goes with its occurrence.
    expect(within(preview).getByTestId('edited-goes')).toHaveTextContent(
      'A transaction a member edited goes too when its occurrence itself goes',
    )
  })

  it('[R-ACCOUNT-462] removed with nothing recorded at once: the removal is said, no move', async () => {
    const db = await openPage()
    // As my stack answered a new offset in the current period: the app's transaction goes and
    // comes back on its new due date once due, so nothing is recorded at once.
    db.rpc.preview_update_transfer.mockImplementation(() => [
      previewRow({ due_date: '2026-11-28', transactions_removed_count: 1 }),
    ])
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Savings' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    const preview = within(dialog).getByTestId('transfer-preview')
    expect(await within(preview).findByTestId('transactions-removed')).toHaveTextContent(
      'or its due date moves',
    )
    expect(within(preview).queryByTestId('transactions-moved')).not.toBeInTheDocument()
  })

  it('[R-ACCOUNT-552] every previewed occurrence says what it is for, twins on one due date included', async () => {
    const db = await openPage()
    db.rpc.preview_update_transfer.mockImplementation(() => [
      previewRow({ due_date: '2026-11-25', occurrence_kind: 'period' }),
      previewRow({
        due_date: '2026-11-25',
        occurrence_kind: 'income_payday',
        occurrence_date: '2026-11-25',
      }),
      previewRow({
        due_date: '2026-11-30',
        occurrence_kind: 'fixed_day',
        occurrence_date: '2026-11-29',
      }),
    ])
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Savings' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    const preview = within(dialog).getByTestId('transfer-preview')
    await waitFor(() => {
      expect(within(preview).getAllByTestId('preview-occurrence')).toHaveLength(3)
    })
    const rows = within(preview).getAllByTestId('preview-occurrence')
    expect(rows[0]).toHaveTextContent('25.11.2026 · for the period 23.10.2026 to 24.11.2026')
    expect(rows[1]).toHaveTextContent(
      '25.11.2026 · on a payday of an income this transfer no longer follows',
    )
    expect(rows[2]).toHaveTextContent('30.11.2026 · fixed day 29.11.2026, moved off the weekend')
  })

  it('[R-ACCOUNT-552] a previewed payday due later says how many days after it, and does not repeat the date', async () => {
    const db = await openPage()
    db.rpc.preview_update_transfer.mockImplementation(() => [
      previewRow({
        due_date: '2026-11-12',
        occurrence_kind: 'income_payday',
        occurrence_date: '2026-11-10',
      }),
      previewRow({
        due_date: '2026-12-11',
        occurrence_kind: 'income_payday',
        occurrence_date: '2026-12-10',
      }),
    ])
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Savings' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    const preview = within(dialog).getByTestId('transfer-preview')
    await waitFor(() => {
      expect(within(preview).getAllByTestId('preview-occurrence')).toHaveLength(2)
    })
    const rows = within(preview).getAllByTestId('preview-occurrence')
    expect(rows[0]).toHaveTextContent(
      '12.11.2026 · 2 days after a payday of an income this transfer no longer follows (10.11.2026)',
    )
    expect(rows[1]).toHaveTextContent('1 day after a payday')
  })

  it('[R-ACCOUNT-551] the mock previews the kind the terms give, its date or number, and whether a mark is kept', () => {
    const db = transfersDb()
    db.checklist = [
      checklistRow({ transfer_id: 'tr-savings', due_date: '2026-11-25', mark_revision: 1 }),
    ]
    const [kept] = db.rpc.preview_update_transfer({
      p_transfer_id: 'tr-savings',
      p_amount: 120_000,
    }) as { occurrence_kind: string; already_recorded: boolean }[]
    expect(kept).toMatchObject({
      occurrence_kind: 'period',
      occurrence_date: null,
      occurrence_seq: 2,
      already_recorded: true,
    })
    // As my stack answered (probe2.cjs): a new offset re-dates the catch-up's own transaction
    // (D-563), so its occurrence is not "kept"; a member's tick is.
    db.checklist[0]!.assumed = true
    const [redated] = db.rpc.preview_update_transfer({
      p_transfer_id: 'tr-savings',
      p_schedule: 'pay_date',
      p_offset_days: 3,
    }) as { already_recorded: boolean }[]
    expect(redated?.already_recorded).toBe(false)
    db.checklist[0]!.assumed = false
    const [member] = db.rpc.preview_update_transfer({
      p_transfer_id: 'tr-savings',
      p_schedule: 'pay_date',
      p_offset_days: 3,
    }) as { already_recorded: boolean }[]
    expect(member?.already_recorded).toBe(true)
    // Moved to Sam's payday (not the primary): another kind, so not the occurrence recorded.
    const [moved] = db.rpc.preview_update_transfer({
      p_transfer_id: 'tr-savings',
      p_schedule: 'pay_date',
      p_income_id: 'income-2',
    }) as { occurrence_kind: string; already_recorded: boolean }[]
    expect(moved).toMatchObject({ occurrence_kind: 'income_payday', already_recorded: false })
    const [fixed] = db.rpc.preview_create_transfer({
      p_schedule: 'day_of_month',
      p_day_of_month: 5,
    }) as { occurrence_kind: string; already_recorded: boolean }[]
    expect(fixed).toMatchObject({ occurrence_kind: 'fixed_day', already_recorded: false })
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

describe('three kinds a household understands [R-ACCOUNT-550] [R-ACCOUNT-553]', () => {
  it('offers three plain choices with the main-versus-named paragraph and its example; a weekend rule only for a fixed day', async () => {
    const db = await openPage()
    const dialog = await openAdd()
    expect(radio(dialog, /^On the main income’s payday/)).toBeChecked()
    expect(radio(dialog, /^On a named income’s payday/)).not.toBeChecked()
    expect(radio(dialog, /^On a fixed day of the month/)).not.toBeChecked()
    expect(within(dialog).getByTestId('transfer-kind-explain')).toHaveTextContent(
      'On the main income’s payday it runs once per period, so a period stretched by a later salary can skip a calendar month',
    )
    expect(within(dialog).queryByTestId('transfer-kind-example')).not.toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'An example' }))
    expect(within(dialog).getByTestId('transfer-kind-example')).toHaveTextContent(
      'On the main income’s payday: 25 Nov, 10 Jan, 10 Feb, none in December. On Ann’s payday: 25 Nov, 25 Dec, 25 Jan. On Ben’s payday: 10 Nov, 10 Dec, 10 Jan, 10 Feb.',
    )
    expect(within(dialog).queryByLabelText('Which income')).not.toBeInTheDocument()
    expect(within(dialog).queryByLabelText('On a Saturday or Sunday')).not.toBeInTheDocument()

    // A named income's payday: its income must be chosen before anything is previewed.
    await userEvent.click(radio(dialog, /^On a named income’s payday/))
    expect(within(dialog).getByTestId('transfer-preview')).toHaveTextContent(
      'Choose the accounts and an amount to see the due dates.',
    )
    await choose(dialog, 'Which income', 'Sam’s salary')
    await waitFor(() => {
      expect(db.rpc.preview_create_transfer).toHaveBeenLastCalledWith(
        expect.objectContaining({ p_schedule: 'pay_date', p_income_id: 'income-2' }),
      )
    })
    expect(db.rpc.preview_create_transfer.mock.lastCall?.[0]).not.toHaveProperty('p_weekend_rule')

    // A fixed day: the weekend rule appears, and goes with it; no income, no offset.
    await userEvent.click(radio(dialog, /^On a fixed day of the month/))
    expect(within(dialog).queryByLabelText('Which income')).not.toBeInTheDocument()
    await choose(dialog, 'On a Saturday or Sunday', 'The working day before')
    await waitFor(() => {
      expect(db.rpc.preview_create_transfer).toHaveBeenLastCalledWith(
        expect.objectContaining({
          p_schedule: 'day_of_month',
          p_cadence: 'monthly',
          p_day_of_month: 1,
          p_weekend_rule: 'previous',
        }),
      )
    })
    const sent = db.rpc.preview_create_transfer.mock.lastCall?.[0]
    expect(sent).not.toHaveProperty('p_income_id')
    expect(sent).not.toHaveProperty('p_offset_days')
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled()
    })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.create_transfer).toHaveBeenCalledWith(
        expect.objectContaining({ p_schedule: 'day_of_month', p_weekend_rule: 'previous' }),
      )
    })
  })

  it('an edit from one kind to another shows its preview before Save, and Save waits for it [R-APP-440]', async () => {
    const db = await openPage()
    let answer: (rows: unknown) => void = () => undefined
    db.rpc.preview_update_transfer.mockImplementation((args) =>
      args.p_income_id === 'income-2'
        ? new Promise((resolve) => (answer = resolve))
        : [previewRow()],
    )
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Savings' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    expect(radio(dialog, /^On the main income’s payday/)).toBeChecked()
    await userEvent.click(radio(dialog, /^On a named income’s payday/))
    await choose(dialog, 'Which income', 'Sam’s salary')
    await waitFor(() => {
      expect(db.rpc.preview_update_transfer).toHaveBeenLastCalledWith({
        p_transfer_id: 'tr-savings',
        p_schedule: 'pay_date',
        p_offset_days: 0,
        p_income_id: 'income-2',
        p_count: 6,
      })
    })
    const save = within(dialog).getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    answer([
      previewRow({
        occurrence_kind: 'income_payday',
        occurrence_date: '2026-11-20',
        due_date: '2026-11-20',
      }),
    ])
    const occurrence = await within(dialog).findByTestId('preview-occurrence')
    expect(occurrence).toHaveTextContent('20.11.2026 · on the payday of “Sam’s salary”')
    await waitFor(() => {
      expect(save).toBeEnabled()
    })
    await userEvent.click(save)
    await waitFor(() => {
      expect(db.rpc.update_transfer).toHaveBeenCalledWith({
        p_transfer_id: 'tr-savings',
        p_expected_revision: 1,
        p_schedule: 'pay_date',
        p_offset_days: 0,
        p_income_id: 'income-2',
      })
    })
  })

  it('a fixed day says its weekend rule on its card', async () => {
    const db = transfersDb()
    db.tables.transfer_overview = [
      transferRow({
        name: 'Rent share',
        schedule: 'day_of_month',
        offset_days: null,
        day_of_month: 1,
        cadence: 'monthly',
        weekend_rule: 'previous',
      }),
    ]
    await openPage(db)
    expect(card('Rent share')).toHaveTextContent(
      /Every month .*1.*, the working day before at weekends/,
    )
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
    weekend_rule: null,
  }
  const values: TransferFormValues = {
    name: 'x',
    fromAccountId: 'a',
    toAccountId: 'b',
    amount: 100,
    mode: 'automatic',
    kind: 'income_payday',
    incomeId: 'income-2',
    offsetDays: 2,
    cadence: 'monthly',
    dayOfMonth: 1,
    firstDate: '',
    weekendRule: 'none',
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
    expect(editArgs(base, { ...values, kind: 'period' }, 'period-1')).toEqual({
      p_schedule: 'pay_date',
      p_offset_days: 2,
      p_clear_income: true,
      p_from_period_id: 'period-1',
    })
  })

  it('unlinking clears the category; a fixed day sends its cadence and day or date', () => {
    expect(editArgs(base, { ...values, linked: false }, null)).toEqual({ p_clear_category: true })
    expect(
      editArgs(base, { ...values, kind: 'fixed_day', cadence: 'monthly', dayOfMonth: 5 }, null),
    ).toEqual({
      p_schedule: 'day_of_month',
      p_cadence: 'monthly',
      p_day_of_month: 5,
      p_weekend_rule: 'none',
    })
    expect(
      editArgs(
        base,
        { ...values, kind: 'fixed_day', cadence: 'yearly', firstDate: '2027-03-01' },
        null,
      ),
    ).toEqual({
      p_schedule: 'day_of_month',
      p_cadence: 'yearly',
      p_first_date: '2027-03-01',
      p_weekend_rule: 'none',
    })
  })

  it('[R-ACCOUNT-550] a weekend rule goes with a fixed day only; a new rule alone sends the schedule', () => {
    const fixedBase = {
      ...base,
      schedule: 'day_of_month' as const,
      offset_days: null,
      income_id: null,
      day_of_month: 1,
      cadence: 'monthly' as const,
      weekend_rule: 'none' as const,
    }
    const fixed = { ...values, kind: 'fixed_day' as const, incomeId: '', dayOfMonth: 1 }
    expect(editArgs(fixedBase, fixed, null)).toEqual({})
    expect(editArgs(fixedBase, { ...fixed, weekendRule: 'previous' }, null)).toEqual({
      p_schedule: 'day_of_month',
      p_cadence: 'monthly',
      p_day_of_month: 1,
      p_weekend_rule: 'previous',
    })
    // Back to a payday: no weekend rule is sent (a pay date given one is invalid_schedule).
    const back = editArgs(fixedBase, { ...fixed, kind: 'period', weekendRule: 'next' }, null)
    expect(back).toEqual({ p_schedule: 'pay_date', p_offset_days: 2 })
    // The main income's payday sends no income even when one is still chosen in the form.
    expect(editArgs(base, { ...values, kind: 'period', incomeId: 'income-2' }, null)).toEqual({
      p_schedule: 'pay_date',
      p_offset_days: 2,
      p_clear_income: true,
    })
  })
})
