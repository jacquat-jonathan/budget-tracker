import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { BUDGET_ID, categoriesDb, DEFAULT_USER_ID } from '@/test/budget-fixtures'
import { rpcError, type MockDb } from '@/test/mock-db'
import { renderRoutes } from '@/test/render'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

// The settings page is a lazy chunk: loaded once here, not inside the first test's time.
beforeAll(async () => {
  await import('@/features/settings/settings-page')
})

const SECRET = `bti_${'0123456789abcdef'.repeat(4)}`

function settingsDb(): MockDb {
  const db = categoriesDb()
  db.tables.import_token_list = [
    {
      id: 'tok-1',
      budget_id: BUDGET_ID,
      name: 'Claude session',
      created_by: DEFAULT_USER_ID,
      created_by_name: 'Alex',
      created_at: '2026-11-01T10:00:00+00:00',
      expires_at: '2099-12-01T10:00:00+00:00',
      last_used_at: null,
      revoked_at: null,
      is_active: true,
    },
    {
      id: 'tok-2',
      budget_id: BUDGET_ID,
      name: 'Old one',
      created_by: DEFAULT_USER_ID,
      created_by_name: 'Alex',
      created_at: '2026-10-01T10:00:00+00:00',
      expires_at: '2026-10-31T10:00:00+00:00',
      last_used_at: '2026-10-02T10:00:00+00:00',
      revoked_at: '2026-10-03T10:00:00+00:00',
      is_active: false,
    },
  ]
  db.tables.merchant_rule_list = [
    {
      id: 'rule-1',
      budget_id: BUDGET_ID,
      fragment: 'coop',
      category_id: 'cat-groceries',
      category_name: 'Groceries',
      parent_category_id: null,
      parent_category_name: null,
      category_in_force: true,
      created_by: DEFAULT_USER_ID,
      revision: 3,
      created_at: '2026-11-01T10:00:00+00:00',
      updated_at: '2026-11-01T10:00:00+00:00',
    },
    {
      id: 'rule-2',
      budget_id: BUDGET_ID,
      fragment: 'hobby shop',
      category_id: 'cat-hobby',
      category_name: 'Old hobby',
      parent_category_id: null,
      parent_category_name: null,
      category_in_force: false,
      created_by: DEFAULT_USER_ID,
      revision: 1,
      created_at: '2026-11-01T10:00:00+00:00',
      updated_at: '2026-11-01T10:00:00+00:00',
    },
  ]
  db.tables.import_choices = [
    {
      budget_id: BUDGET_ID,
      flag: 'own_transfer',
      counterparty_key: 'mustermann jonas',
      choice: 'skip',
      updated_at: '2026-11-02T10:00:00+00:00',
      updated_by: DEFAULT_USER_ID,
    },
  ]
  return db
}

function open(db: MockDb) {
  mock.current = createSupabaseMock(fakeSession(), db)
  return renderRoutes(routes, '/settings')
}

describe('import tokens [R-IMPORT-074] [R-IMPORT-326]', () => {
  it('shows the secret once, with where to put it, and keeps it nowhere after the dialog closes', async () => {
    const db = settingsDb()
    const { queryClient } = open(db)
    await userEvent.click(await screen.findByRole('button', { name: 'Create a token' }))
    const dialog = await screen.findByRole('dialog', { name: 'Create an import token' })
    expect(within(dialog).getByLabelText('Valid for (days)')).toHaveValue(30)
    expect(dialog).toHaveTextContent('1 to 365 days; 30 by default.')
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Session')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    expect(db.rpc.create_import_token).toHaveBeenCalledWith({
      p_budget_id: BUDGET_ID,
      p_name: 'Session',
      p_expires_in_days: 30,
    })
    const secret = await screen.findByTestId('token-secret')
    expect(secret).toHaveValue(SECRET)
    const shown = screen.getByRole('dialog', { name: 'Your new token' })
    expect(shown).toHaveTextContent('it is shown only this once and cannot be shown again')
    expect(shown).toHaveTextContent('BUDGET_IMPORT_TOKEN')
    expect(shown).toHaveTextContent('Never paste it into a conversation')
    await userEvent.click(within(shown).getByRole('button', { name: 'I have copied it' }))
    await waitFor(() => expect(screen.queryByTestId('token-secret')).not.toBeInTheDocument())
    expect(document.body.innerHTML).not.toContain(SECRET)
    const cached = JSON.stringify([
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data),
      queryClient
        .getMutationCache()
        .getAll()
        .map((mutation) => mutation.state.data),
    ])
    expect(cached).not.toContain(SECRET)
    const stored = (storage: Storage) =>
      Array.from({ length: storage.length }, (_, index) =>
        storage.getItem(storage.key(index) ?? ''),
      )
    expect(JSON.stringify(stored(localStorage))).not.toContain(SECRET)
    expect(JSON.stringify(stored(sessionStorage))).not.toContain(SECRET)
    expect(window.location.href).not.toContain(SECRET)
    // No mutation was made for it at all: nothing a cache keeps can reach the secret.
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
    // Two dialogs, typing and the whole page: about 1 s alone, several times that under load.
  }, 10_000)

  it('asks before an Escape or a click outside closes the secret', async () => {
    open(settingsDb())
    await userEvent.click(await screen.findByRole('button', { name: 'Create a token' }))
    const dialog = await screen.findByRole('dialog', { name: 'Create an import token' })
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Session')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    await screen.findByTestId('token-secret')
    await userEvent.keyboard('{Escape}')
    const ask = await screen.findByTestId('secret-leave')
    expect(ask).toHaveTextContent('Close without the secret? It is not shown again')
    expect(screen.getByTestId('token-secret')).toHaveValue(SECRET)
    await userEvent.click(within(ask).getByRole('button', { name: 'Back to the secret' }))
    expect(screen.getByTestId('token-secret')).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await userEvent.click(
      within(await screen.findByTestId('secret-leave')).getByRole('button', {
        name: 'I have copied it: close',
      }),
    )
    await waitFor(() => expect(screen.queryByTestId('token-secret')).not.toBeInTheDocument())
  }, 10_000)

  it('lists the tokens with their state, revokes behind a confirmation, deletes a revoked one', async () => {
    const db = settingsDb()
    open(db)
    const rows = await screen.findAllByTestId('token-row')
    expect(rows[0]).toHaveTextContent('Claude session')
    expect(rows[0]).toHaveTextContent('Active')
    expect(rows[0]).toHaveTextContent('Never used')
    expect(rows[1]).toHaveTextContent('Revoked')
    await userEvent.click(within(rows[0]!).getByRole('button', { name: 'Revoke Claude session' }))
    const confirm = await screen.findByRole('alertdialog')
    expect(confirm).toHaveTextContent('The token stops at once and for good')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Revoke' }))
    await waitFor(() =>
      expect(db.rpc.revoke_import_token).toHaveBeenCalledWith({ p_token_id: 'tok-1' }),
    )
    await userEvent.click(within(rows[1]!).getByRole('button', { name: 'Delete Old one' }))
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    )
    await waitFor(() =>
      expect(db.rpc.delete_import_token).toHaveBeenCalledWith({ p_token_id: 'tok-2' }),
    )
  })

  it('says the limit in words', async () => {
    const db = settingsDb()
    db.rpc.create_import_token.mockImplementation(() => rpcError('token_limit_reached'))
    open(db)
    await userEvent.click(await screen.findByRole('button', { name: 'Create a token' }))
    const dialog = await screen.findByRole('dialog', { name: 'Create an import token' })
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Eleventh')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    expect(
      await within(dialog).findByText(
        'This budget already has 10 import tokens that can be used, the most it can have. Revoke one first.',
      ),
    ).toBeInTheDocument()
  })
})

describe('merchant rules [R-IMPORT-078]', () => {
  it('lists the rules, flags an ended category, edits with the revision read, deletes', async () => {
    const db = settingsDb()
    open(db)
    const rows = await screen.findAllByTestId('rule-row')
    expect(rows[0]).toHaveTextContent('coop')
    expect(rows[0]).toHaveTextContent('Groceries')
    expect(within(rows[1]!).getByTestId('rule-ended')).toHaveTextContent('Its category has ended')
    await userEvent.click(within(rows[0]!).getByRole('button', { name: 'Edit the rule coop' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit the rule' })
    await userEvent.clear(within(dialog).getByLabelText('Merchant text'))
    await userEvent.type(within(dialog).getByLabelText('Merchant text'), 'coop pronto')
    await userEvent.selectOptions(within(dialog).getByLabelText('Category'), 'cat-rent')
    await userEvent.click(within(dialog).getByRole('checkbox'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(db.rpc.update_merchant_rule).toHaveBeenCalledWith({
        p_rule_id: 'rule-1',
        p_expected_revision: 3,
        p_fragment: 'coop pronto',
        p_category_id: 'cat-rent',
        p_apply: true,
      }),
    )
    await userEvent.click(
      within(rows[1]!).getByRole('button', { name: 'Delete the rule hobby shop' }),
    )
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    )
    await waitFor(() =>
      expect(db.rpc.delete_merchant_rule).toHaveBeenCalledWith({
        p_rule_id: 'rule-2',
        p_expected_revision: 1,
      }),
    )
  })

  it('offers neither "to categorise" nor a group as a rule’s category', async () => {
    const db = settingsDb()
    db.tables.category_overview[0] = {
      ...db.tables.category_overview[0]!,
      is_to_categorise: true,
      name: 'Waiting',
    }
    open(db)
    const rows = await screen.findAllByTestId('rule-row')
    await userEvent.click(within(rows[0]!).getByRole('button', { name: 'Edit the rule coop' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit the rule' })
    const options = within(within(dialog).getByLabelText('Category')).getAllByRole('option')
    expect(options.map((option) => option.textContent)).not.toContain('Waiting')
    expect(options.map((option) => option.textContent)).not.toContain('Insurance')
  })
})

describe('remembered choices [R-IMPORT-092]', () => {
  it('are listed, and the card says how to change one', async () => {
    const db = settingsDb()
    open(db)
    const list = await screen.findByTestId('choice-list')
    expect(list).toHaveTextContent('mustermann jonas')
    expect(list).toHaveTextContent('transfer between your own accounts')
    expect(list).toHaveTextContent('Skip')
    expect(screen.getByText(/does not offer to forget a choice yet/)).toBeInTheDocument()
  })
})
