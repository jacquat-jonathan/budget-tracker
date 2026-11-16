import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import i18n from '@/lib/i18n'
import { renderRoutes } from '@/test/render'
import { BUDGET_ID, categoriesDb, categoryRow, periodRow } from '@/test/budget-fixtures'
import { RpcFailure, rpcError } from '@/test/mock-db'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

afterEach(async () => {
  await i18n.changeLanguage('en')
})

async function openBudget(db = categoriesDb()) {
  mock.current = createSupabaseMock(fakeSession(), db)
  const result = renderRoutes(routes, '/budget')
  await screen.findAllByTestId('category-row')
  return { db, ...result }
}

function row(name: string): HTMLElement {
  const match = [
    ...screen.getAllByTestId('category-row'),
    ...screen.queryAllByTestId('subcategory-row'),
  ].find((element) => within(element).getAllByTestId('category-name')[0]?.textContent === name)
  if (!match) throw new Error(`No row for ${name}`)
  return match
}

async function action(name: string, item: string) {
  await userEvent.click(
    within(row(name)).getAllByRole('button', { name: `Actions for ${name}` })[0]!,
  )
  await userEvent.click(await screen.findByRole('menuitem', { name: item }))
}

describe('budget page [R-CATEGORY-050]', () => {
  it('lists the categories in force with the amounts the database gives, and the period totals', async () => {
    const db = categoriesDb({
      period_summaries: [
        periodRow({ income_total: 650_000, expected_total: 700_000, left_to_assign: -50_000 }),
      ],
    })
    await openBudget(db)

    expect(
      screen
        .getAllByTestId('category-row')
        .map((r) => within(r).getAllByTestId('category-name')[0]?.textContent),
    ).toEqual(['Rent', 'Groceries', 'Insurance'])
    const insurance = row('Insurance')
    expect(within(insurance).getByText('Group')).toBeInTheDocument()
    expect(within(insurance).getAllByTestId('category-amount')[0]).toHaveTextContent('CHF 560.00')
    // A yearly amount: its monthly share as the database rounds it, and the amount entered.
    const car = row('Car')
    expect(within(car).getByTestId('category-amount')).toHaveTextContent('CHF 80.00')
    expect(car).toHaveTextContent('CHF 960.00 a year')
    // Ended categories are kept for the record, apart.
    expect(screen.getByRole('heading', { name: 'Removed categories' })).toBeInTheDocument()
    expect(screen.getByText('Old hobby')).toBeInTheDocument()

    // R-CATEGORY-071: over-assigning shows a negative amount, never a refusal.
    const totals = screen.getByTestId('budget-totals')
    expect(within(totals).getByTestId('total-income')).toHaveTextContent("CHF 6'500.00")
    expect(within(totals).getByTestId('total-expected')).toHaveTextContent("CHF 7'000.00")
    expect(within(totals).getByTestId('total-left')).toHaveTextContent('Assigned beyond the income')
    expect(within(totals).getByTestId('total-left')).toHaveTextContent('CHF -500.00')
  })

  it('creates a category with a yearly amount, from the current period', async () => {
    const { db } = await openBudget()

    await userEvent.click(screen.getByRole('button', { name: 'Add category' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add a category' })
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Car tax')
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Per year' }))
    await userEvent.type(within(dialog).getByLabelText('Amount per year'), '480')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(db.rpc.create_category).toHaveBeenCalledWith({
        p_budget_id: BUDGET_ID,
        p_name: 'Car tax',
        p_amount: 48_000,
        p_cadence: 'yearly',
      })
    })
  })

  it('says before the first subcategory what moves to “Other”, and always sends that name [R-CATEGORY-051]', async () => {
    const { db } = await openBudget()

    await action('Groceries', 'Add a subcategory')
    const dialog = await screen.findByRole('dialog', { name: 'Add a subcategory to “Groceries”' })
    expect(within(dialog).getByTestId('first-subcategory')).toHaveTextContent(
      'What it holds now (its amount, CHF 900.00 a month, and its transactions) moves to a new subcategory “Other”',
    )
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Organic')
    await userEvent.type(within(dialog).getByLabelText('Amount per month'), '100')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(db.rpc.create_category).toHaveBeenCalledWith(
        expect.objectContaining({
          p_name: 'Organic',
          p_parent_id: 'cat-groceries',
          p_other_name: 'Other',
        }),
      )
    })
  })

  it('sends the French “Other” in French', async () => {
    await i18n.changeLanguage('fr')
    const { db } = await openBudget()
    await userEvent.click(
      within(row('Groceries')).getByRole('button', { name: 'Actions pour Groceries' }),
    )
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Ajouter une sous-catégorie' }),
    )
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Nom'), 'Bio')
    await userEvent.type(within(dialog).getByLabelText('Montant par mois'), '100')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => {
      expect(db.rpc.create_category).toHaveBeenCalledWith(
        expect.objectContaining({ p_other_name: 'Autres' }),
      )
    })
  })

  it('changes an amount from the current period with the revision it was opened on; a correction is explicit [R-CATEGORY-053] [R-VERSION-140]', async () => {
    const db = categoriesDb()
    // In period 1 Groceries expected CHF 800.00 a month (CHF 900.00 now), as the database says.
    db.rpc.get_category_terms.mockImplementation((args) => [
      {
        period_id: args.p_period_id,
        in_force: true,
        amount: 80_000,
        cadence: 'monthly',
        terms_from_period_id: 'period-1',
        until_period_id: 'period-2',
      },
    ])
    await openBudget(db)

    await action('Groceries', 'Edit')
    const dialog = await screen.findByRole('dialog', { name: 'Edit category' })
    expect(dialog).toHaveTextContent('A new amount applies from the current period')
    await userEvent.click(within(dialog).getByLabelText('Correct an earlier period'))
    expect(within(dialog).getByText(/This changes past periods/)).toBeInTheDocument()
    // The form starts from that period's expectation, read from the database.
    const amount = within(dialog).getByLabelText('Amount per month')
    await waitFor(() => {
      expect(amount).toHaveValue('800.00')
    })
    await userEvent.clear(amount)
    await userEvent.type(amount, '950')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(db.rpc.update_category).toHaveBeenCalledWith({
        p_category_id: 'cat-groceries',
        p_expected_revision: 1,
        p_amount: 95_000,
        p_cadence: 'monthly',
        p_from_period_id: 'period-1',
      })
    })
  })

  it('a group has no amount to edit', async () => {
    await openBudget()
    await action('Insurance', 'Edit')
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByLabelText('Amount per month')).not.toBeInTheDocument()
    expect(dialog).toHaveTextContent('its amount is the total of theirs')
  })

  it('says before removing whether the category is deleted or ends, and what happens to the rest [R-CATEGORY-052]', async () => {
    const db = categoriesDb()
    const { db: same } = await openBudget(db)

    await action('Insurance', 'Remove')
    let confirm = await screen.findByRole('alertdialog')
    expect(confirm).toHaveTextContent('Remove “Insurance” from now on?')
    expect(confirm).toHaveTextContent(
      'It is no longer planned from the current period (which started on 23.10.2026)',
    )
    expect(confirm).toHaveTextContent('Its transactions are never deleted')
    expect(confirm).toHaveTextContent('Its 2 subcategories go with it: Health, Car.')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))

    same.tables.category_overview = same.tables.category_overview.map((category) =>
      category.id === 'cat-car' ? { ...category, removal_deletes: true } : category,
    )
    await act(() => Promise.resolve())
    await action('Car', 'Remove')
    confirm = await screen.findByRole('alertdialog')
    // The outcome is the database's answer for the row read, here before the refetch.
    await userEvent.click(
      within(confirm).getByRole('button', { name: /Remove from now on|Delete/ }),
    )
    await waitFor(() => {
      expect(same.rpc.end_category).toHaveBeenCalledWith({
        p_category_id: 'cat-car',
        p_expected_revision: 1,
      })
    })
  })

  it('a category that never counted and has no transactions is deleted, and says so', async () => {
    const db = categoriesDb({
      category_overview: [
        categoryRow({ id: 'cat-new', name: 'New', removal_deletes: true, has_transactions: false }),
      ],
    })
    await openBudget(db)
    await action('New', 'Remove')
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete “New”?' })
    expect(confirm).toHaveTextContent('so it is deleted completely')
    expect(within(confirm).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('a category added this period with transactions is said to be kept without an amount [R-CATEGORY-052]', async () => {
    const db = categoriesDb({
      category_overview: [categoryRow({ id: 'cat-new', name: 'New', first_seq: 2 })],
    })
    await openBudget(db)
    await action('New', 'Remove')
    const confirm = await screen.findByRole('alertdialog')
    expect(confirm).toHaveTextContent('It was added in this period')
    expect(confirm).toHaveTextContent('it is kept without an amount')
    expect(confirm).not.toHaveTextContent('Past periods keep it')
  })

  it('reorders by sending the siblings in their new order [R-CATEGORY-096]', async () => {
    const { db } = await openBudget()
    await action('Groceries', 'Move up')
    await waitFor(() => {
      expect(db.rpc.reorder_categories).toHaveBeenCalledWith({
        p_budget_id: BUDGET_ID,
        p_category_ids: ['cat-groceries', 'cat-rent', 'cat-insurance'],
      })
    })
  })

  it('without categories, invites to add the first one', async () => {
    await openBudget(categoriesDb({ category_overview: [] })).catch(() => undefined)
    expect(await screen.findByText('No categories yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add your first category' })).toBeInTheDocument()
  })
})

describe('a change by another member is never lost silently [R-CONCURRENCY-091] [R-CONCURRENCY-070]', () => {
  it('keeps what I typed, says someone else changed it, and lets me take theirs or keep mine', async () => {
    const { db } = await openBudget()
    db.rpc.update_category.mockImplementationOnce(() => {
      // Sam saved first: the row is now at revision 2, and mine is refused.
      db.tables.category_overview = db.tables.category_overview.map((category) =>
        category.id === 'cat-groceries'
          ? { ...category, name: 'Food', amount: 80_000, monthly_amount: 80_000, revision: 2 }
          : category,
      )
      rpcError('record_changed')
    })

    await action('Groceries', 'Edit')
    const dialog = await screen.findByRole('dialog')
    const amount = within(dialog).getByLabelText('Amount per month')
    await userEvent.clear(amount)
    await userEvent.type(amount, '950')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    const notice = await within(dialog).findByTestId('changed-elsewhere')
    expect(notice).toHaveTextContent('Someone else changed this while you had it open')
    // What they changed, field by field, with their values.
    expect(notice).toHaveTextContent('NameFood')
    expect(notice).toHaveTextContent('AmountCHF 800.00 per month')
    expect(within(dialog).getByLabelText('Amount per month')).toHaveValue('950.00')
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()

    // Keep mine: only what I edited (the amount) is sent; their new name stays.
    await userEvent.click(within(notice).getByRole('button', { name: 'Keep mine' }))
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Food')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.update_category).toHaveBeenLastCalledWith({
        p_category_id: 'cat-groceries',
        p_expected_revision: 2,
        p_amount: 95_000,
        p_cadence: 'monthly',
      })
    })
  })

  it('“load their version” refills the form from the other member’s save', async () => {
    const { db } = await openBudget()
    await action('Groceries', 'Edit')
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Name'), ' and drinks')

    // Sam's save arrives while the form is open (read again on a refetch).
    db.tables.category_overview = db.tables.category_overview.map((category) =>
      category.id === 'cat-groceries' ? { ...category, name: 'Food', revision: 2 } : category,
    )
    db.rpc.update_category.mockImplementationOnce(() => rpcError('record_changed'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    const notice = await within(dialog).findByTestId('changed-elsewhere')
    await userEvent.click(within(notice).getByRole('button', { name: 'Load their version' }))
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Food')
    expect(within(dialog).queryByTestId('changed-elsewhere')).not.toBeInTheDocument()
  })

  it('with nothing typed, the form takes their version and says what changed', async () => {
    const { db, queryClient } = await openBudget()
    await action('Groceries', 'Edit')
    const dialog = await screen.findByRole('dialog')
    db.tables.category_overview = db.tables.category_overview.map((category) =>
      category.id === 'cat-groceries' ? { ...category, name: 'Food', revision: 2 } : category,
    )
    await act(() => queryClient.invalidateQueries({ queryKey: ['budget'] }))
    const updated = await within(dialog).findByTestId('updated-elsewhere')
    expect(updated).toHaveTextContent('NameFood')
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Food')
    expect(within(dialog).queryByTestId('changed-elsewhere')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('a category deleted by someone else while open cannot be saved, and says so', async () => {
    const { db, queryClient } = await openBudget()
    await action('Groceries', 'Edit')
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Name'), ' and drinks')
    db.tables.category_overview = db.tables.category_overview.filter(
      (category) => category.id !== 'cat-groceries',
    )
    await act(() => queryClient.invalidateQueries({ queryKey: ['budget'] }))
    expect(await within(dialog).findByTestId('gone-elsewhere')).toHaveTextContent(
      'Someone else deleted this',
    )
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Groceries and drinks')
  })

  it('a category ended by someone else while open says so once and offers no save [R-CONCURRENCY-091]', async () => {
    const { db, queryClient } = await openBudget()
    await action('Groceries', 'Edit')
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Name'), ' and drinks')
    db.tables.category_overview = db.tables.category_overview.map((category) =>
      category.id === 'cat-groceries'
        ? { ...category, is_active: false, end_seq: 2, revision: 2 }
        : category,
    )
    await act(() => queryClient.invalidateQueries({ queryKey: ['budget'] }))
    expect(await within(dialog).findByTestId('gone-elsewhere')).toHaveTextContent(
      'Someone else removed this',
    )
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(within(dialog).queryByTestId('changed-elsewhere')).not.toBeInTheDocument()
  })

  it('a category turned into a group while open says the typed amount cannot be saved, and keeps the rename [R-CONCURRENCY-091]', async () => {
    const { db, queryClient } = await openBudget()
    await action('Groceries', 'Edit')
    const dialog = await screen.findByRole('dialog')
    const amount = within(dialog).getByLabelText('Amount per month')
    await userEvent.clear(amount)
    await userEvent.type(amount, '950')
    db.tables.category_overview = db.tables.category_overview.map((category) =>
      category.id === 'cat-groceries'
        ? { ...category, is_group: true, amount: null, cadence: null, revision: 2 }
        : category,
    )
    await act(() => queryClient.invalidateQueries({ queryKey: ['budget'] }))
    expect(await within(dialog).findByTestId('became-group')).toHaveTextContent(
      'The amount you typed (CHF 950.00) cannot be saved here',
    )
    expect(within(dialog).queryByLabelText('Amount per month')).not.toBeInTheDocument()
    await userEvent.type(within(dialog).getByLabelText('Name'), ' and drinks')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.update_category).toHaveBeenCalledWith({
        p_category_id: 'cat-groceries',
        p_expected_revision: 2,
        p_name: 'Groceries and drinks',
      })
    })
  })

  it('a category someone else restored first says there is nothing left to restore [R-CONCURRENCY-091]', async () => {
    const { db, queryClient } = await openBudget()
    await userEvent.click(screen.getByRole('button', { name: 'Restore Old hobby' }))
    const dialog = await screen.findByRole('dialog')
    db.tables.category_overview = db.tables.category_overview.map((category) =>
      category.id === 'cat-hobby'
        ? { ...category, is_active: true, end_seq: null, revision: 2 }
        : category,
    )
    await act(() => queryClient.invalidateQueries({ queryKey: ['budget'] }))
    expect(await within(dialog).findByTestId('restored-elsewhere')).toHaveTextContent(
      'Someone else has already restored “Old hobby”',
    )
    expect(within(dialog).getByRole('button', { name: 'Restore' })).toBeDisabled()
  })

  it('restores an ended category from now on, or as if it had never ended [R-CATEGORY-054] [R-CATEGORY-101]', async () => {
    // Three periods: Old hobby counted in the first and ended from the second (past).
    const db = categoriesDb({
      period_summaries: [
        periodRow({
          id: 'period-1',
          seq: 1,
          start_date: '2026-08-25',
          end_date: '2026-09-24',
          is_current: false,
        }),
        periodRow({
          id: 'period-2',
          seq: 2,
          start_date: '2026-09-25',
          end_date: '2026-10-22',
          is_current: false,
        }),
        periodRow({ id: 'period-3', seq: 3 }),
      ],
    })
    const { db: same } = await openBudget(db)
    await userEvent.click(screen.getByRole('button', { name: 'Restore Old hobby' }))
    const dialog = await screen.findByRole('dialog', { name: 'Restore “Old hobby”?' })
    expect(within(dialog).getByTestId('history-outcome')).toHaveTextContent(
      'The periods between its end and now expect nothing for it: their totals do not change.',
    )
    await userEvent.click(within(dialog).getByLabelText('Restore it as if it had never ended'))
    expect(within(dialog).getByTestId('history-outcome')).toHaveTextContent(
      'as if it had never ended, so the plans and results of every period since change',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Restore' }))
    await waitFor(() => {
      expect(same.rpc.restore_category).toHaveBeenCalledWith({
        p_category_id: 'cat-hobby',
        p_expected_revision: 1,
        p_from_period_id: 'period-2',
        p_amount: 90_000,
        p_cadence: 'monthly',
      })
    })
  })

  it('a category removed in the current period, even one never in force but with transactions, is listed and restored from this period [R-CATEGORY-054]', async () => {
    const db = categoriesDb({
      category_overview: [
        categoryRow({ id: 'cat-rent', name: 'Rent', sort_order: 0 }),
        // Void: removed in the period it was added (2), kept for its transactions.
        categoryRow({
          id: 'cat-courses',
          name: 'Courses',
          sort_order: 1,
          first_seq: 2,
          end_seq: 2,
          is_active: false,
        }),
      ],
    })
    const { db: same } = await openBudget(db)
    const removed = screen.getByTestId('ended-category-row')
    expect(removed).toHaveTextContent(
      'Removed in the period it was added; its transactions still count',
    )
    await userEvent.click(within(removed).getByRole('button', { name: 'Restore Courses' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByTestId('history-outcome')).toHaveTextContent(
      'It was removed from the current period (which started on 23.10.2026): it is planned again from that period',
    )
    expect(
      within(dialog).queryByLabelText('Restore it as if it had never ended'),
    ).not.toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Restore' }))
    await waitFor(() => {
      expect(same.rpc.restore_category).toHaveBeenCalledWith(
        expect.objectContaining({ p_category_id: 'cat-courses', p_expected_revision: 1 }),
      )
    })
  })

  it('the removed list keeps each group before its subcategories [R-CATEGORY-054]', async () => {
    const ended = { is_active: false, end_seq: 2 }
    const db = categoriesDb({
      category_overview: [
        categoryRow({
          id: 'g',
          name: 'Insurance',
          is_group: true,
          amount: null,
          cadence: null,
          sort_order: 0,
          ...ended,
        }),
        categoryRow({ id: 's1', parent_id: 'g', name: 'Health', sort_order: 0, ...ended }),
        categoryRow({ id: 'x', name: 'Hobby', sort_order: 1, ...ended }),
        categoryRow({ id: 's2', parent_id: 'g', name: 'Car', sort_order: 1, ...ended }),
        categoryRow({ id: 'r', name: 'Rent', sort_order: 2 }),
      ],
    })
    await openBudget(db)
    expect(
      screen.getAllByTestId('ended-category-row').map((row) => row.querySelector('p')?.textContent),
    ).toEqual(['Insurance', 'Insurance › Health', 'Insurance › Car', 'Hobby'])
  })

  it('counts a category from an earlier period, as an explicit correction [R-CATEGORY-100]', async () => {
    const db = categoriesDb({
      category_overview: [categoryRow({ id: 'cat-new', name: 'New', first_seq: 2 })],
    })
    await openBudget(db)
    await action('New', 'Count from an earlier period')
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByTestId('history-outcome')).toHaveTextContent(
      'This changes past periods: from 25.09.2026 on',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Count from that period' }))
    await waitFor(() => {
      expect(db.rpc.extend_category).toHaveBeenCalledWith({
        p_category_id: 'cat-new',
        p_expected_revision: 1,
        p_from_period_id: 'period-1',
        p_amount: 90_000,
        p_cadence: 'monthly',
      })
    })
  })

  it('an amount and its cadence are one field: “Keep mine” keeps or gives up both together [R-CONCURRENCY-091]', async () => {
    const db = categoriesDb({
      category_overview: [
        categoryRow({ id: 'cat-leisure', name: 'Leisure', amount: 20_000, monthly_amount: 20_000 }),
      ],
    })
    const { db: same } = await openBudget(db)
    // Sam sets 50.00 per month first; Ann only switches to per year.
    same.rpc.update_category.mockImplementationOnce(() => {
      same.tables.category_overview = [
        categoryRow({
          id: 'cat-leisure',
          name: 'Leisure',
          amount: 5_000,
          monthly_amount: 5_000,
          revision: 2,
        }),
      ]
      rpcError('record_changed')
    })
    await action('Leisure', 'Edit')
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Per year' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    const notice = await within(dialog).findByTestId('changed-elsewhere')
    expect(notice).toHaveTextContent('AmountCHF 50.00 per month')
    await userEvent.click(within(notice).getByRole('button', { name: 'Keep mine' }))
    // Mine is the whole value as the form shows it: 200.00 per year, never 50.00 per year.
    expect(within(dialog).getByLabelText('Amount per year')).toHaveValue('200.00')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(same.rpc.update_category).toHaveBeenLastCalledWith({
        p_category_id: 'cat-leisure',
        p_expected_revision: 2,
        p_amount: 20_000,
        p_cadence: 'yearly',
      })
    })
  })

  it('a group I did not edit takes the other member’s value whole [R-CONCURRENCY-091]', async () => {
    const db = categoriesDb({
      category_overview: [
        categoryRow({ id: 'cat-leisure', name: 'Leisure', amount: 20_000, monthly_amount: 20_000 }),
      ],
    })
    const { db: same } = await openBudget(db)
    same.rpc.update_category.mockImplementationOnce(() => {
      same.tables.category_overview = [
        categoryRow({
          id: 'cat-leisure',
          name: 'Leisure',
          amount: 60_000,
          cadence: 'yearly',
          monthly_amount: 5_000,
          revision: 2,
        }),
      ]
      rpcError('record_changed')
    })
    await action('Leisure', 'Edit')
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Name'), ' and sport')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    const notice = await within(dialog).findByTestId('changed-elsewhere')
    await userEvent.click(within(notice).getByRole('button', { name: 'Keep mine' }))
    expect(within(dialog).getByLabelText('Amount per year')).toHaveValue('600.00')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(same.rpc.update_category).toHaveBeenLastCalledWith({
        p_category_id: 'cat-leisure',
        p_expected_revision: 2,
        p_name: 'Leisure and sport',
      })
    })
  })
})

describe('a category the database will not end [R-CATEGORY-150]', () => {
  it('lists what uses it from the refusal itself', async () => {
    const db = categoriesDb()
    db.rpc.end_category.mockImplementation(() => {
      throw new RpcFailure({
        code: 'P0001',
        message: 'category_in_use',
        details: JSON.stringify([
          { kind: 'subscription', id: 'sub-netflix', name: 'Netflix' },
          { kind: 'debt', id: 'debt-car', name: 'Car loan' },
        ]),
        hint: null,
      })
    })
    await openBudget(db)
    await action('Car', 'Remove')
    const confirm = await screen.findByRole('alertdialog')
    await userEvent.click(
      within(confirm).getByRole('button', { name: /Remove from now on|Delete/ }),
    )
    const users = await within(confirm).findByTestId('category-in-use')
    expect(users).toHaveTextContent('Subscription “Netflix”')
    expect(within(users).getByRole('link', { name: 'Debt “Car loan”' })).toHaveAttribute(
      'href',
      '/debts/debt-car',
    )
  })
})
