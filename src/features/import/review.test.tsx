import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { ExternalText } from '@/components/external-text'
import {
  BUDGET_ID,
  budgetRow,
  categoriesDb,
  categoryRow,
  DEFAULT_USER_ID,
  transactionRow,
} from '@/test/budget-fixtures'
import { rpcError, type MockDb } from '@/test/mock-db'
import { renderRoutes } from '@/test/render'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

// The pages are lazy chunks: loaded once here, not inside the first tests' time.
beforeAll(async () => {
  await Promise.all([
    import('@/features/dashboard/dashboard-page'),
    import('@/features/transactions/transactions-page'),
    import('@/features/budget/budget-page'),
  ])
})

const BATCH = 'aaaaaaaa-0000-4000-8000-000000000001'
const TO_CATEGORISE = 'cat-to-categorise'

/** The household with "to categorise" and three imports to review, one still waiting in it. */
function reviewDb(): MockDb {
  const db = categoriesDb()
  db.tables.my_budgets = [budgetRow({ to_review: 3, to_categorise_category_id: TO_CATEGORISE })]
  db.tables.category_overview.push(
    categoryRow({
      id: TO_CATEGORISE,
      name: 'To categorise',
      sort_order: 9,
      amount: 0,
      monthly_amount: 0,
      is_to_categorise: true,
      has_transactions: true,
    }),
  )
  const imported = {
    review_state: 'to_review' as const,
    import_batch_id: BATCH,
    import_source: 'migros_account',
  }
  db.tables.transaction_list = [
    transactionRow({
      id: 'imp-1',
      description: 'Coop Pronto',
      merchant: 'Coop Pronto',
      merchant_key: 'coop pronto',
      ...imported,
      details: { booking_date: '2026-11-09', card: 'XXXX 1234' },
    }),
    transactionRow({
      id: 'imp-2',
      date: '2026-11-07',
      created_at: '2026-11-07T10:00:00+00:00',
      description: 'COOP PRONTO 12',
      merchant_key: 'coop pronto 12',
      category_id: TO_CATEGORISE,
      category_name: 'To categorise',
      in_to_categorise: true,
      ...imported,
    }),
    transactionRow({
      id: 'imp-3',
      date: '2026-11-06',
      created_at: '2026-11-06T10:00:00+00:00',
      description: 'Shell',
      merchant_key: 'shell',
      category_id: TO_CATEGORISE,
      category_name: 'To categorise',
      in_to_categorise: true,
      ...imported,
    }),
    transactionRow({
      id: 'typed',
      date: '2026-11-05',
      created_at: '2026-11-05T10:00:00+00:00',
      description: 'Typed',
    }),
  ]
  return db
}

function open(db: MockDb, path: string) {
  mock.current = createSupabaseMock(fakeSession(), db)
  return renderRoutes(routes, path)
}

describe('imported transactions to review [R-IMPORT-081] [R-IMPORT-209]', () => {
  it('the dashboard says how many wait and leads to them', async () => {
    open(reviewDb(), '/')
    const card = await screen.findByTestId('to-review-card')
    expect(card).toHaveTextContent('3 imported transactions wait for your review.')
    expect(within(card).getByRole('link', { name: 'Review them' })).toHaveAttribute(
      'href',
      '/transactions?period=all&review=1',
    )
  })

  it('the list shows only those to review, in a removable filter kept in the address', async () => {
    const db = reviewDb()
    const { router } = open(db, `/transactions?period=all&review=1&batch=${BATCH}`)
    await screen.findAllByTestId('transaction-row')
    expect(db.rpc.list_transactions).toHaveBeenCalledWith(
      expect.objectContaining({ p_to_review_only: true, p_import_batch_id: BATCH }),
    )
    expect(screen.getAllByTestId('transaction-row')).toHaveLength(3)
    const chips = screen.getByTestId('link-filters')
    expect(chips).toHaveTextContent('To review')
    await userEvent.click(
      within(chips).getByRole('button', { name: 'Remove the filter “To review”' }),
    )
    await waitFor(() => expect(router.state.location.search).not.toContain('review=1'))
  })

  it('[R-IMPORT-365] "show only the N to review" shows those N, in every period, whatever else was filtered', async () => {
    const db = reviewDb()
    const { router } = open(db, '/transactions?category=cat-groceries')
    const button = await screen.findByRole('button', { name: 'Show only the 3 to review' })
    await userEvent.click(button)
    await waitFor(() => expect(router.state.location.search).toBe('?period=all&review=1'))
    await waitFor(() => expect(screen.getAllByTestId('transaction-row')).toHaveLength(3))
    const last = db.rpc.list_transactions.mock.calls.at(-1)?.[0]
    expect(last).toMatchObject({ p_to_review_only: true })
    expect(last?.p_period_id ?? null).toBeNull()
    expect(last?.p_category_id ?? null).toBeNull()
  })

  it('confirms one, and a transaction still in "to categorise" says why it cannot be', async () => {
    const db = reviewDb()
    open(db, '/transactions?period=all&review=1')
    const rows = await screen.findAllByTestId('transaction-row')
    expect(within(rows[1]!).getByText('Needs a category')).toBeInTheDocument()
    expect(
      within(rows[1]!).getByText('Choose a category first, then confirm it.'),
    ).toBeInTheDocument()
    expect(within(rows[1]!).queryByRole('button', { name: /^Confirm/ })).not.toBeInTheDocument()
    await userEvent.click(within(rows[0]!).getByRole('button', { name: /^Confirm Coop Pronto/ }))
    await waitFor(() =>
      expect(db.rpc.confirm_import).toHaveBeenCalledWith({
        p_transaction_id: 'imp-1',
        p_expected_revision: 1,
      }),
    )
  })

  it('confirms all of a batch and says what it did', async () => {
    const db = reviewDb()
    open(db, `/transactions?period=all&review=1&batch=${BATCH}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm all of this import' }))
    await waitFor(() =>
      expect(db.rpc.confirm_imports).toHaveBeenCalledWith({
        p_budget_id: BUDGET_ID,
        p_batch_id: BATCH,
      }),
    )
    expect(
      await screen.findByText('1 confirmed. 2 still need a category and stay to review.'),
    ).toBeInTheDocument()
  })

  it('shows the statement’s extra data on a row [R-IMPORT-102]', async () => {
    open(reviewDb(), '/transactions?period=all&review=1')
    const rows = await screen.findAllByTestId('transaction-row')
    await userEvent.click(within(rows[0]!).getByText('Imported from Migros Bank account statement'))
    expect(within(rows[0]!).getByText('XXXX 1234')).toBeVisible()
    expect(within(rows[0]!).getByText('09.11.2026')).toBeVisible()
  })
})

describe('one click to always put a merchant in a category [R-IMPORT-007] [R-IMPORT-365]', () => {
  it('is offered after categorising, with the database’s key and the others waiting, and moves them', async () => {
    const db = reviewDb()
    db.rpc.update_transaction.mockImplementation(() => [
      {
        ...db.tables.transaction_list[1],
        category_id: 'cat-groceries',
        category_name: 'Groceries',
        in_to_categorise: false,
        revision: 2,
      },
    ])
    db.rpc.create_merchant_rule.mockImplementation(() => [
      { rule_id: 'r1', fragment: 'coop pronto 12', revision: 1, moved: 0 },
    ])
    open(db, '/transactions?period=all&review=1')
    const rows = await screen.findAllByTestId('transaction-row')
    await userEvent.click(
      within(rows[1]!).getByRole('button', { name: /Actions for COOP PRONTO 12/ }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit transaction' })
    // Waiting in "to categorise": no category chosen yet, and it is not offered.
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Category' }))
    expect(screen.queryByRole('option', { name: 'To categorise' })).not.toBeInTheDocument()
    await userEvent.click(await screen.findByRole('option', { name: 'Groceries' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    const offer = await screen.findByTestId('rule-offer')
    expect(offer).toHaveTextContent('Next imports put “\u2068coop pronto 12\u2069” in Groceries.')
    // In view wherever the row is (fixed in the window), and it takes no focus by itself: a
    // stray Enter must not create a rule.
    expect(offer.className).toContain('fixed')
    expect(within(offer).getByRole('button', { name: 'Always' })).not.toHaveFocus()
    expect(offer).not.toContainElement(document.activeElement as HTMLElement | null)
    await userEvent.click(within(offer).getByRole('button', { name: 'Always' }))
    await waitFor(() =>
      expect(db.rpc.create_merchant_rule).toHaveBeenCalledWith({
        p_budget_id: BUDGET_ID,
        p_fragment: 'coop pronto 12',
        p_category_id: 'cat-groceries',
        p_apply: true,
      }),
    )
  })

  it('[R-IMPORT-444] a rule the database refuses as invalid_fragment is said in words, not as an error code', async () => {
    const db = reviewDb()
    db.rpc.update_transaction.mockImplementation(() => [
      {
        ...db.tables.transaction_list[1],
        category_id: 'cat-groceries',
        category_name: 'Groceries',
        in_to_categorise: false,
        revision: 2,
      },
    ])
    db.rpc.create_merchant_rule.mockImplementation(() => rpcError('invalid_fragment'))
    open(db, '/transactions?period=all&review=1')
    const rows = await screen.findAllByTestId('transaction-row')
    await userEvent.click(
      within(rows[1]!).getByRole('button', { name: /Actions for COOP PRONTO 12/ }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit transaction' })
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Category' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Groceries' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    const offer = await screen.findByTestId('rule-offer')
    await userEvent.click(within(offer).getByRole('button', { name: 'Always' }))
    expect(
      await screen.findByText(
        'This merchant’s text is too long to become a rule (100 characters at most once tidied). Nothing was created.',
      ),
    ).toBeInTheDocument()
  })

  it('counts the others waiting for the same merchant', async () => {
    const db = reviewDb()
    db.tables.transaction_list[2] = {
      ...db.tables.transaction_list[2]!,
      merchant_key: 'shell station 4',
    }
    db.tables.transaction_list[0] = {
      ...db.tables.transaction_list[0]!,
      category_id: TO_CATEGORISE,
      in_to_categorise: true,
      merchant_key: 'shell',
    }
    db.rpc.update_transaction.mockImplementation(() => {
      db.tables.transaction_list[0] = {
        ...db.tables.transaction_list[0]!,
        category_id: 'cat-groceries',
        category_name: 'Groceries',
        in_to_categorise: false,
      }
      return [db.tables.transaction_list[0]]
    })
    open(db, '/transactions?period=all&review=1')
    const rows = await screen.findAllByTestId('transaction-row')
    await userEvent.click(within(rows[0]!).getByRole('button', { name: /Actions for/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit transaction' })
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Category' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Groceries' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await screen.findByTestId('rule-offer')).toHaveTextContent(
      'Also move the 1 other transaction waiting in “To categorise” for it.',
    )
    // The database counts them (D-457), all of them, not a page of the newest.
    expect(db.rpc.preview_merchant_rule).toHaveBeenCalledWith({
      p_budget_id: BUDGET_ID,
      p_fragment: 'shell',
      p_category_id: 'cat-groceries',
    })
  })

  it('says the real number that moves when thousands wait [R-IMPORT-202]', async () => {
    const db = reviewDb()
    db.rpc.update_transaction.mockImplementation(() => [
      {
        ...db.tables.transaction_list[1],
        category_id: 'cat-groceries',
        category_name: 'Groceries',
        in_to_categorise: false,
        revision: 2,
      },
    ])
    db.rpc.preview_merchant_rule.mockImplementation(() => [
      {
        fragment: 'coop pronto 12',
        covered_by_rule_id: null,
        covered_by_fragment: null,
        rule_exists: false,
        would_move: 5_097,
      },
    ])
    open(db, '/transactions?period=all&review=1')
    const rows = await screen.findAllByTestId('transaction-row')
    await userEvent.click(within(rows[1]!).getByRole('button', { name: /Actions for/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit transaction' })
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Category' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Groceries' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await screen.findByTestId('rule-offer')).toHaveTextContent(
      "Also move the 5'097 other transactions waiting in “To categorise” for it.",
    )
  })

  it('is not offered when a rule already covers the merchant', async () => {
    const db = reviewDb()
    db.tables.merchant_rule_list = [
      {
        id: 'r0',
        budget_id: BUDGET_ID,
        fragment: 'coop',
        category_id: 'cat-groceries',
        category_name: 'Groceries',
        parent_category_id: null,
        parent_category_name: null,
        category_in_force: true,
        created_by: DEFAULT_USER_ID,
        revision: 1,
        created_at: '2026-11-01T10:00:00+00:00',
        updated_at: '2026-11-01T10:00:00+00:00',
      },
    ]
    db.rpc.update_transaction.mockImplementation(() => [
      {
        ...db.tables.transaction_list[1],
        category_id: 'cat-groceries',
        category_name: 'Groceries',
        in_to_categorise: false,
      },
    ])
    open(db, '/transactions?period=all&review=1')
    const rows = await screen.findAllByTestId('transaction-row')
    await userEvent.click(within(rows[1]!).getByRole('button', { name: /Actions for/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit transaction' })
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Category' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Groceries' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(db.rpc.update_transaction).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(screen.queryByTestId('rule-offer')).not.toBeInTheDocument()
  })
})

describe('"to categorise" in the screens [R-CATEGORY-250] [R-CATEGORY-200] [R-CATEGORY-320]', () => {
  it('is marked on the budget page, has no plan, takes no subcategory and cannot be removed while it holds transactions', async () => {
    open(reviewDb(), '/budget')
    const name = await screen.findByText('To categorise', {
      selector: '[data-testid=category-name]',
    })
    const row = name.closest('div.px-4') as HTMLElement
    expect(within(row).getByTestId('to-categorise-badge')).toHaveTextContent('Import')
    expect(within(row).getByTestId('to-categorise-note')).toHaveTextContent(
      'takes no plan and no subcategory',
    )
    expect(within(row).getByText('No plan')).toBeInTheDocument()
    await userEvent.click(within(row).getByRole('button', { name: /Actions for To categorise/ }))
    expect(screen.queryByRole('menuitem', { name: /subcategory/i })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Remove/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(
      screen.getByText('Not while it holds transactions: give them a category first.'),
    ).toBeInTheDocument()
  })

  it('a refusal for it is worded for what was tried', async () => {
    const db = reviewDb()
    db.rpc.add_transaction.mockImplementation(() => rpcError('category_to_categorise'))
    open(db, '/transactions')
    await userEvent.click(await screen.findByRole('button', { name: 'Add transaction' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add a transaction' })
    await userEvent.type(within(dialog).getByLabelText('Amount'), '5.00')
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Category' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Groceries' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(
      await within(dialog).findByText(
        'A transaction you enter cannot go in “To categorise”: choose a category.',
      ),
    ).toBeInTheDocument()
  })

  it('is never offered as a category when a transaction is typed', async () => {
    open(reviewDb(), '/transactions')
    await userEvent.click(await screen.findByRole('button', { name: 'Add transaction' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add a transaction' })
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Category' }))
    await screen.findByRole('option', { name: 'Groceries' })
    expect(screen.queryByRole('option', { name: 'To categorise' })).not.toBeInTheDocument()
  })
})

describe('text from outside the app [R-SECURITY-250] [R-IMPORT-325]', () => {
  it('stays text, is isolated from the words around it, and wraps', () => {
    render(
      <p data-testid="sentence">
        Before <ExternalText>{'<b>bold</b> =HYPERLINK("x") \u202eevil'}</ExternalText> after
      </p>,
    )
    const sentence = screen.getByTestId('sentence')
    expect(sentence.querySelector('b')).toBeNull()
    expect(sentence).toHaveTextContent('<b>bold</b> =HYPERLINK("x")')
    const isolated = sentence.querySelector('bdi')
    expect(isolated).toHaveAttribute('dir', 'auto')
    expect(isolated?.className).toContain('[overflow-wrap:anywhere]')
    expect(sentence.querySelector('a')).toBeNull()
  })
})
