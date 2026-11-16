/**
 * Regressions found in the step 2 review: data and page state never outlive the user or
 * the budget they belong to, period reads wait for ensure_periods, and a refused write
 * never leaves a stale row on screen.
 */
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { CURRENT_BUDGET_KEY_PREFIX } from '@/features/budgets/current-budget-storage'
import { renderRoutes } from '@/test/render'
import {
  BUDGET_ID,
  DEFAULT_USER_ID,
  budgetRow,
  householdDb,
  incomeRow,
  memberRow,
  periodRow,
} from '@/test/budget-fixtures'
import { rpcError } from '@/test/mock-db'
import { createSupabaseMock, fakeSession, sessionFor, userX, userY } from '@/test/supabase-mock'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

const OTHER_BUDGET = 'bbbbbbbb-0000-0000-0000-000000000002'

describe('another user taking over the tab [R-AUTH-025]', () => {
  it('shows only the new user’s budgets, never the previous user’s', async () => {
    const db = householdDb(userX.id, {
      my_budgets: [budgetRow({ name: 'Xavier’s budget', owner_id: userX.id })],
    })
    mock.current = createSupabaseMock(sessionFor(userX, 'x-1'), db)
    renderRoutes(routes, '/')
    expect(await screen.findByTestId('current-budget-name')).toHaveTextContent('Xavier’s budget')

    // Y's session takes over this tab (an email link, another tab), with no sign-out.
    db.tables.my_budgets = [
      budgetRow({ id: OTHER_BUDGET, name: 'Yasmine’s budget', owner_id: userY.id }),
    ]
    db.tables.period_summaries.push(periodRow({ id: 'y-period', budget_id: OTHER_BUDGET }))
    act(() => mock.current?.emit('SIGNED_IN', sessionFor(userY, 'y-1')))

    await waitFor(() => {
      expect(screen.getByTestId('current-budget-name')).toHaveTextContent('Yasmine’s budget')
    })
    expect(screen.queryByText('Xavier’s budget')).not.toBeInTheDocument()
    expect(screen.queryByText('This could not be loaded')).not.toBeInTheDocument()
  })
})

describe('a page belongs to one budget [R-BUDGET-053]', () => {
  it('an open dialog is closed when its budget disappears, so it cannot save into another', async () => {
    const db = householdDb(DEFAULT_USER_ID, {
      my_budgets: [
        budgetRow({ name: 'A shared' }),
        budgetRow({ id: OTHER_BUDGET, name: 'B mine' }),
      ],
    })
    db.tables.income_overview.push(incomeRow({ id: 'b-income', budget_id: OTHER_BUDGET }))
    db.tables.budget_member_list.push(memberRow({ budget_id: OTHER_BUDGET }))
    db.tables.period_summaries.push(periodRow({ id: 'b-period', budget_id: OTHER_BUDGET }))
    mock.current = createSupabaseMock(fakeSession(), db)
    const { queryClient } = renderRoutes(routes, '/income')

    await userEvent.click(await screen.findByRole('button', { name: 'Add income' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Typed for A')

    // I am removed from A; the next read of my budgets no longer has it.
    db.tables.my_budgets = db.tables.my_budgets.filter((budget) => budget.id !== BUDGET_ID)
    await act(() => queryClient.invalidateQueries({ queryKey: ['budgets'] }))

    await waitFor(() => {
      expect(screen.getByTestId('current-budget-name')).toHaveTextContent('B mine')
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(db.rpc.add_income).not.toHaveBeenCalled()
  })

  it('says what happened when the budget I was in disappears [R-BUDGET-055]', async () => {
    const db = householdDb(DEFAULT_USER_ID, {
      my_budgets: [
        budgetRow({ name: 'A shared' }),
        budgetRow({ id: OTHER_BUDGET, name: 'B mine' }),
      ],
    })
    db.tables.period_summaries.push(periodRow({ id: 'b-period', budget_id: OTHER_BUDGET }))
    mock.current = createSupabaseMock(fakeSession(), db)
    const { queryClient } = renderRoutes(routes, '/income')
    await userEvent.click(await screen.findByRole('button', { name: 'Add income' }))
    await userEvent.type(within(await screen.findByRole('dialog')).getByLabelText('Name'), 'Typed')

    db.tables.my_budgets = db.tables.my_budgets.filter((budget) => budget.id !== BUDGET_ID)
    await act(() => queryClient.invalidateQueries({ queryKey: ['budgets'] }))

    const notice = await screen.findByTestId('budget-lost')
    expect(notice).toHaveTextContent('You no longer have access to “A shared”')
    expect(notice).toHaveTextContent('You are now in “B mine”')
    expect(notice).toHaveTextContent('not saved was discarded')
    await userEvent.click(within(notice).getByRole('button', { name: 'Got it' }))
    expect(screen.queryByTestId('budget-lost')).not.toBeInTheDocument()
  })
})

describe('the remembered budget [R-BUDGET-051]', () => {
  it('a fallback is remembered once shown, so a rename elsewhere does not move me', async () => {
    const db = householdDb(DEFAULT_USER_ID, {
      my_budgets: [budgetRow({ name: 'Alpha' }), budgetRow({ id: OTHER_BUDGET, name: 'Beta' })],
    })
    mock.current = createSupabaseMock(fakeSession(), db)
    const { queryClient } = renderRoutes(routes, '/')

    expect(await screen.findByTestId('current-budget-name')).toHaveTextContent('Alpha')
    await waitFor(() => {
      expect(localStorage.getItem(`${CURRENT_BUDGET_KEY_PREFIX}${DEFAULT_USER_ID}`)).toBe(BUDGET_ID)
    })

    // Someone renames Alpha to Zeta: by name, Beta now comes first.
    db.tables.my_budgets = [
      budgetRow({ id: OTHER_BUDGET, name: 'Beta' }),
      budgetRow({ name: 'Zeta' }),
    ]
    await act(() => queryClient.invalidateQueries({ queryKey: ['budgets'] }))
    await waitFor(() => {
      expect(screen.getByTestId('current-budget-name')).toHaveTextContent('Zeta')
    })
  })
})

describe('period reads wait for ensure_periods [R-PERIOD-052]', () => {
  it('a failed ensure_periods is an error with a retry, never "this budget has ended"', async () => {
    const db = householdDb()
    db.rpc.ensure_periods.mockImplementation(() => rpcError('not_mocked', 'XX000'))
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/periods')

    expect(await screen.findByText('This could not be loaded')).toBeInTheDocument()
    expect(screen.queryByText('This budget has ended')).not.toBeInTheDocument()
    expect(db.rpc.get_current_period).not.toHaveBeenCalled()

    db.rpc.ensure_periods.mockImplementation(() => 0)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findAllByTestId('period-row')).toHaveLength(2)
    expect(screen.queryByText('This budget has ended')).not.toBeInTheDocument()
  })

  it('reads the list again when it missed the current period the database gave', async () => {
    const db = householdDb()
    const october = db.tables.period_summaries.find((period) => period.id === 'period-2')!
    db.tables.period_summaries = db.tables.period_summaries.filter((period) => period !== october)
    // get_current_period creates October (as on the first visit after a pay day).
    db.rpc.get_current_period.mockImplementation(() => {
      if (!db.tables.period_summaries.includes(october)) db.tables.period_summaries.push(october)
      return [october]
    })
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/periods')

    await waitFor(() => {
      expect(screen.getAllByTestId('period-row')).toHaveLength(2)
    })
    expect(screen.queryByText('This budget has ended')).not.toBeInTheDocument()
  })

  it('takes "ended" from the database’s answer', async () => {
    const db = householdDb()
    db.rpc.get_current_period.mockImplementation(() => [])
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/periods')

    expect(await screen.findByText('This budget has ended')).toBeInTheDocument()
  })
})

describe('a refused write refreshes what it acted on [R-APP-005]', () => {
  it('cancelling an invitation that was accepted meanwhile shows the new member', async () => {
    const db = householdDb(DEFAULT_USER_ID, {
      budget_invitations: [
        {
          id: 'inv-kim',
          budget_id: BUDGET_ID,
          email: 'kim@example.com',
          invited_by: DEFAULT_USER_ID,
          created_at: '2026-11-12T08:00:00+00:00',
          expires_at: '2026-12-12T08:00:00+00:00',
        },
      ],
    })
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/settings')
    await screen.findByTestId('invitation-list')

    // Kim accepted a moment ago.
    db.tables.budget_invitations = []
    db.tables.budget_member_list.push(
      memberRow({ user_id: 'kim', role: 'member', display_name: 'Kim', email: 'kim@example.com' }),
    )
    db.rpc.cancel_invitation.mockImplementation(() => rpcError('invitation_not_found'))
    await userEvent.click(
      screen.getByRole('button', { name: 'Cancel the invitation for kim@example.com' }),
    )

    await waitFor(() => {
      expect(screen.queryByTestId('invitation-list')).not.toBeInTheDocument()
    })
    expect(within(screen.getByTestId('member-list')).getByText('Kim')).toBeInTheDocument()
  })

  it('removing an income another member already deleted takes its card away', async () => {
    const db = householdDb(DEFAULT_USER_ID, {
      income_overview: [
        incomeRow(),
        incomeRow({ id: 'income-2', name: 'Side job', is_primary: false }),
      ],
    })
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/income')
    await screen.findByRole('heading', { name: 'Side job' })

    db.tables.income_overview = db.tables.income_overview.filter((row) => row.id !== 'income-2')
    db.rpc.remove_income.mockImplementation(() => rpcError('income_not_found'))
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Side job' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove' }))
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }),
    )

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Side job' })).not.toBeInTheDocument()
    })
  })

  it('a rename that fails after new terms were saved still shows the new terms', async () => {
    const db = householdDb()
    db.tables.incomes = []
    db.rpc.update_income_terms.mockImplementation(() => {
      db.tables.income_overview[0] = { ...db.tables.income_overview[0]!, amount: 700_000 }
      return null
    })
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/income')

    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Salary' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.clear(within(dialog).getByLabelText('Name'))
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Wages')
    await userEvent.clear(within(dialog).getByLabelText('Amount per month'))
    await userEvent.type(within(dialog).getByLabelText('Amount per month'), '7000')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await within(dialog).findByText('This income no longer exists.')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getAllByText("CHF 7'000.00").length).toBeGreaterThan(0)
    })
  })
})

describe('selects show their default choice', () => {
  it('"First month" shows the current period before anything is chosen', async () => {
    mock.current = createSupabaseMock(fakeSession(), householdDb())
    renderRoutes(routes, '/budgets/new')
    const trigger = await screen.findByRole('combobox', { name: 'First month' })
    await waitFor(() => {
      expect(trigger).toHaveTextContent('October 2026 (the current period)')
    })
  })

  it('"Counts from" shows the current period before anything is chosen', async () => {
    mock.current = createSupabaseMock(fakeSession(), householdDb())
    renderRoutes(routes, '/income')
    await userEvent.click(await screen.findByRole('button', { name: 'Add income' }))
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => {
      expect(within(dialog).getByRole('combobox', { name: 'Counts from' })).toHaveTextContent(
        'The current period',
      )
    })
  })
})
