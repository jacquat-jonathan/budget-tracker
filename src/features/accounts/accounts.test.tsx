import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { householdDb, incomeRow, memberRow, OTHER_USER_ID } from '@/test/budget-fixtures'
import { accountRow, transferRow } from '@/test/mock-transfers'
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
  await warmPages('accounts', 'income')
}, 10_000)

function accountsDb() {
  return householdDb(undefined, {
    budget_member_list: [
      memberRow(),
      memberRow({ user_id: OTHER_USER_ID, role: 'member', display_name: 'Sam' }),
    ],
    account_overview: [
      accountRow({
        in_use: true,
        user_id: '00000000-0000-0000-0000-000000000001',
        user_display_name: 'Alex',
        user_is_member: true,
      }),
      accountRow({ id: 'acc-savings', name: 'Savings', kind: 'savings', bank_label: 'Yuh' }),
      accountRow({
        id: 'acc-old',
        name: 'Old card',
        kind: 'credit_card',
        is_active: false,
        end_seq: 2,
      }),
    ],
  })
}

async function openPage(db = accountsDb()) {
  mock.current = createSupabaseMock(fakeSession(), db)
  renderRoutes(routes, '/accounts')
  await screen.findAllByTestId('account-card')
  return db
}

function card(name: string) {
  const match = screen
    .getAllByTestId('account-card')
    .find((element) => element.textContent.includes(name))
  if (!match) throw new Error(`No card for ${name}`)
  return match
}

async function choose(dialog: HTMLElement, label: string, option: string) {
  await userEvent.click(within(dialog).getByLabelText(label))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

describe('accounts page [R-ACCOUNT-001]', () => {
  it('lists the accounts in force with kind, bank and holder, closed ones folded away', async () => {
    await openPage()
    expect(card('Salary account')).toHaveTextContent('Current or salary account · Alex')
    expect(card('Salary account')).toHaveTextContent('In use')
    expect(card('Savings')).toHaveTextContent('Savings · Yuh · Shared')
    expect(screen.queryByText('Old card')).not.toBeInTheDocument()
    await userEvent.click(screen.getByTestId('closed-accounts-toggle'))
    expect(await screen.findByTestId('closed-account')).toHaveTextContent('Old card')
  })

  it('without accounts says they are optional and offers a first one [D-501]', async () => {
    mock.current = createSupabaseMock(fakeSession(), householdDb())
    renderRoutes(routes, '/accounts')
    expect(await screen.findByText('No accounts yet')).toBeInTheDocument()
    expect(screen.getByText(/the rest of the app works without them/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add your first account' }))
    // No kind is chosen for the user, not even for the first account [R-ACCOUNT-530].
    expect(within(await screen.findByRole('dialog')).getByLabelText('Kind')).toHaveTextContent(
      'Choose a kind',
    )
  })

  it('starts the kind empty and requires it, saying what the kind changes [R-ACCOUNT-530]', async () => {
    const db = await openPage()
    // A second account: once it silently started as "Savings".
    await userEvent.click(screen.getByRole('button', { name: 'Add account' }))
    const dialog = await screen.findByRole('dialog')
    const kind = within(dialog).getByLabelText('Kind')
    expect(kind).toHaveTextContent('Choose a kind')
    expect(kind).toHaveAccessibleDescription(
      /everyday account .* is spendable; .* savings, third pillar, tax reserve or investment account is set aside/,
    )
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Joint account')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(
      await within(dialog).findByText('Choose what kind of account it is.'),
    ).toBeInTheDocument()
    expect(db.rpc.create_account).not.toHaveBeenCalled()
    await choose(dialog, 'Kind', 'Current or salary account')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.create_account).toHaveBeenCalledWith(
        expect.objectContaining({ p_name: 'Joint account', p_kind: 'current' }),
      )
    })
  })

  it('creates an account with its kind, bank and holder, once per action', async () => {
    const db = await openPage()
    await userEvent.click(screen.getByRole('button', { name: 'Add account' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Third pillar')
    await choose(dialog, 'Kind', 'Third pillar')
    await userEvent.type(within(dialog).getByLabelText('Bank (optional)'), 'VIAC')
    await choose(dialog, 'Whose account', 'Sam')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.create_account).toHaveBeenCalledWith({
        p_budget_id: expect.any(String) as string,
        p_name: 'Third pillar',
        p_kind: 'third_pillar',
        p_bank_label: 'VIAC',
        p_user_id: OTHER_USER_ID,
        p_client_id: expect.any(String) as string,
      })
    })
    expect(await screen.findByText('Account “Third pillar” added.')).toBeInTheDocument()
  })

  it('an edit sends only what changed; a cleared bank and holder are said as such', async () => {
    const db = await openPage()
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Salary account' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    await choose(dialog, 'Whose account', 'Shared')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.update_account).toHaveBeenCalledWith({
        p_account_id: 'acc-salary',
        p_expected_revision: 1,
        p_clear_user: true,
      })
    })

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Savings' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const second = await screen.findByRole('dialog')
    await userEvent.clear(within(second).getByLabelText('Bank (optional)'))
    await userEvent.click(within(second).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.update_account).toHaveBeenLastCalledWith({
        p_account_id: 'acc-savings',
        p_expected_revision: 1,
        p_clear_bank_label: true,
      })
    })
  })
})

describe('closing an account [R-ACCOUNT-232]', () => {
  it('is refused while an income or a transfer uses it, naming them, with no way to confirm', async () => {
    const db = await openPage()
    db.tables.income_overview = [
      incomeRow({ account_id: 'acc-salary', account_name: 'Salary account' }),
    ]
    db.tables.transfer_overview = [transferRow()]
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Salary account' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Close account' }))
    const dialog = await screen.findByRole('alertdialog')
    const users = await within(dialog).findByTestId('account-used-by')
    expect(users).toHaveTextContent('Income “Salary”')
    expect(users).toHaveTextContent('Planned transfer “Savings”')
    expect(within(dialog).getByRole('button', { name: 'Close account' })).toBeDisabled()
    expect(db.rpc.close_account).not.toHaveBeenCalled()
  })

  it('a preview that failed to load keeps the confirmation disabled until it is shown [R-APP-440]', async () => {
    const db = await openPage()
    db.rpc.preview_close_account.mockImplementationOnce(() =>
      rpcError('TypeError: Failed to fetch', ''),
    )
    db.rpc.preview_close_account.mockImplementationOnce(() =>
      rpcError('TypeError: Failed to fetch', ''),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Savings' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Close account' }))
    const dialog = await screen.findByRole('alertdialog')
    const failed = await within(dialog).findByTestId('preview-failed', {}, { timeout: 4000 })
    expect(failed).toHaveTextContent('The preview could not be loaded')
    expect(within(dialog).getByRole('button', { name: 'Close account' })).toBeDisabled()
    await userEvent.click(within(failed).getByRole('button', { name: 'Try again' }))
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: 'Close account' })).toBeEnabled()
    })
    expect(db.rpc.close_account).not.toHaveBeenCalled()
  })

  it('says beforehand that an account never used is deleted, and deletes it', async () => {
    const fresh = accountsDb()
    fresh.tables.account_overview[1]!.removal_deletes = true
    const db = await openPage(fresh)
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Savings' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete account' }))
    const dialog = await screen.findByRole('alertdialog')
    await within(dialog).findByText('Nothing ever used it: it is deleted.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }))
    await waitFor(() => {
      expect(db.rpc.close_account).toHaveBeenCalledWith({
        p_account_id: 'acc-savings',
        p_expected_revision: 1,
      })
    })
    expect(await screen.findByText('Account “Savings” deleted.')).toBeInTheDocument()
  })
})

describe('the account an income is paid into [R-ACCOUNT-236]', () => {
  it('is offered only once the household has accounts, and is sent as a term', async () => {
    const db = accountsDb()
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/income')
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Salary' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    await choose(dialog, 'Paid into', 'Salary account')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.update_income).toHaveBeenCalledWith({
        p_income_id: 'income-1',
        p_expected_revision: 1,
        p_account_id: 'acc-salary',
      })
    })
  })

  it('back to none clears it; without accounts the form does not ask [D-501]', async () => {
    const db = accountsDb()
    db.tables.income_overview = [incomeRow({ account_id: 'acc-savings', account_name: 'Savings' })]
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/income')
    expect(await screen.findByTestId('income-account')).toHaveTextContent('Savings')
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Salary' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    await choose(dialog, 'Paid into', 'Not assigned')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.update_income).toHaveBeenCalledWith({
        p_income_id: 'income-1',
        p_expected_revision: 1,
        p_clear_account: true,
      })
    })

    mock.current = createSupabaseMock(fakeSession(), householdDb())
    renderRoutes(routes, '/income')
    await userEvent.click((await screen.findAllByRole('button', { name: 'Add income' }))[0]!)
    const add = await screen.findByRole('dialog')
    expect(within(add).getByLabelText('Name')).toBeInTheDocument()
    expect(within(add).queryByLabelText('Paid into')).not.toBeInTheDocument()
  })
})
