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
import { createMockDb, rpcError } from '@/test/mock-db'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

const SECOND_ID = 'bbbbbbbb-0000-0000-0000-000000000002'

/** Two budgets: "Household" (owned) and "Ski trip" (as a member). */
function twoBudgets() {
  return householdDb(DEFAULT_USER_ID, {
    my_budgets: [
      budgetRow(),
      budgetRow({ id: SECOND_ID, name: 'Ski trip', is_owner: false, owner_id: 'someone' }),
    ],
  })
}

describe('first-run setup [R-BUDGET-050]', () => {
  it('a signed-in user without a budget lands on the setup, not on an empty dashboard', async () => {
    mock.current = createSupabaseMock(fakeSession(), createMockDb())
    const { router } = renderRoutes(routes, '/')

    expect(await screen.findByRole('heading', { name: 'Welcome, Alex' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/welcome')
    expect(screen.getByRole('heading', { name: 'Create your budget' })).toBeInTheDocument()

    // Every app page leads here while there is no budget.
    await act(() => router.navigate('/income'))
    expect(router.state.location.pathname).toBe('/welcome')
  })

  it('creates the budget with its first income in one call, then opens it', async () => {
    const db = createMockDb()
    mock.current = createSupabaseMock(fakeSession(), db)
    db.rpc.create_budget.mockImplementation(() => {
      db.tables.my_budgets = [budgetRow({ id: 'created', name: 'Our home' })]
      db.tables.period_summaries = [periodRow({ budget_id: 'created' })]
      return 'created'
    })
    const { router } = renderRoutes(routes, '/')

    await userEvent.type(await screen.findByLabelText('Budget name'), '  Our home ')
    await userEvent.type(screen.getByLabelText('Name'), 'Salary')
    await userEvent.type(screen.getByLabelText('Amount per month'), "5'200.50")
    await userEvent.click(screen.getByRole('radio', { name: /^Friday before/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Create budget' }))

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(db.rpc.create_budget).toHaveBeenCalledWith({
      p_name: 'Our home',
      p_income_name: 'Salary',
      p_amount: 520_050,
      p_pay_day: 25,
      p_weekend_rule: 'previous',
    })
    expect(db.rpc.set_budget_end_date).not.toHaveBeenCalled()
    expect(screen.getByTestId('current-budget-name')).toHaveTextContent('Our home')
    expect(await screen.findByText('Budget “Our home” created.')).toBeInTheDocument()
  })

  it('sets the optional end date right after creating the budget', async () => {
    const db = createMockDb()
    mock.current = createSupabaseMock(fakeSession(), db)
    db.rpc.create_budget.mockImplementation(() => {
      db.tables.my_budgets = [budgetRow({ id: 'created' })]
      return 'created'
    })
    renderRoutes(routes, '/')

    await userEvent.type(await screen.findByLabelText('Budget name'), 'Trip')
    await userEvent.type(screen.getByLabelText('End date (optional)'), '31.3.2027')
    await userEvent.type(screen.getByLabelText('Name'), 'Savings')
    await userEvent.type(screen.getByLabelText('Amount per month'), '800')
    await userEvent.click(screen.getByRole('button', { name: 'Create budget' }))

    await waitFor(() => {
      expect(db.rpc.set_budget_end_date).toHaveBeenCalledWith({
        p_budget_id: 'created',
        p_end_date: '2027-03-31',
      })
    })
  })

  it('validates before calling the database, and shows a refusal as translated text [R-APP-004]', async () => {
    const db = createMockDb()
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/')

    await userEvent.click(await screen.findByRole('button', { name: 'Create budget' }))
    expect(await screen.findAllByText('Enter a name.')).toHaveLength(2)
    expect(screen.getByText('Enter an amount.')).toBeInTheDocument()
    expect(db.rpc.create_budget).not.toHaveBeenCalled()

    db.rpc.create_budget.mockImplementation(() => rpcError('budget_limit_reached'))
    await userEvent.type(screen.getByLabelText('Budget name'), 'One more')
    await userEvent.type(screen.getByLabelText('Name'), 'Salary')
    await userEvent.type(screen.getByLabelText('Amount per month'), 'abc')
    await userEvent.click(screen.getByRole('button', { name: 'Create budget' }))
    expect(await screen.findByText('Enter an amount such as 5200 or 5’200.50.')).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('Amount per month'))
    await userEvent.type(screen.getByLabelText('Amount per month'), '100')
    await userEvent.click(screen.getByRole('button', { name: 'Create budget' }))
    expect(
      await screen.findByText('You already own 20 budgets, the most you can have.'),
    ).toBeInTheDocument()
  })

  it('shows invitations addressed to me; accepting one opens that budget', async () => {
    const db = createMockDb()
    mock.current = createSupabaseMock(fakeSession(), db)
    db.rpc.list_my_invitations.mockImplementation(() => [
      {
        id: 'inv-1',
        budget_id: SECOND_ID,
        budget_name: 'Family',
        invited_by_name: 'Sam',
        created_at: '2026-11-10T09:00:00+00:00',
      },
    ])
    db.rpc.accept_invitation.mockImplementation(() => {
      db.tables.my_budgets = [budgetRow({ id: SECOND_ID, name: 'Family', is_owner: false })]
      db.rpc.list_my_invitations.mockImplementation(() => [])
      return SECOND_ID
    })
    renderRoutes(routes, '/')

    const invitations = await screen.findByTestId('my-invitations')
    expect(within(invitations).getByText('Family')).toBeInTheDocument()
    expect(within(invitations).getByText('From Sam, 10.11.2026')).toBeInTheDocument()
    await userEvent.click(within(invitations).getByRole('button', { name: 'Accept' }))

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
    expect(db.rpc.accept_invitation).toHaveBeenCalledWith({ p_invitation_id: 'inv-1' })
    expect(screen.getByTestId('current-budget-name')).toHaveTextContent('Family')
  })

  it('declining an invitation removes it from the list', async () => {
    const db = createMockDb()
    mock.current = createSupabaseMock(fakeSession(), db)
    db.rpc.list_my_invitations.mockImplementation(() => [
      {
        id: 'inv-1',
        budget_id: SECOND_ID,
        budget_name: 'Family',
        invited_by_name: 'Sam',
        created_at: '2026-11-10T09:00:00+00:00',
      },
    ])
    db.rpc.decline_invitation.mockImplementation(() => {
      db.rpc.list_my_invitations.mockImplementation(() => [])
      return null
    })
    renderRoutes(routes, '/')

    await userEvent.click(await screen.findByRole('button', { name: 'Decline' }))
    await waitFor(() => {
      expect(screen.queryByTestId('my-invitations')).not.toBeInTheDocument()
    })
    expect(db.rpc.decline_invitation).toHaveBeenCalledWith({ p_invitation_id: 'inv-1' })
  })
})

describe('the current budget [R-BUDGET-051]', () => {
  it('can be switched from the sidebar, and is remembered for this user', async () => {
    mock.current = createSupabaseMock(fakeSession(), twoBudgets())
    renderRoutes(routes, '/')

    expect(await screen.findByTestId('current-budget-name')).toHaveTextContent('Household')
    await userEvent.click(screen.getByRole('button', { name: /Current budget: Household/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Ski trip' }))

    expect(screen.getByTestId('current-budget-name')).toHaveTextContent('Ski trip')
    expect(localStorage.getItem(`${CURRENT_BUDGET_KEY_PREFIX}${DEFAULT_USER_ID}`)).toBe(SECOND_ID)
  })

  it('opens the remembered budget after a reload', async () => {
    localStorage.setItem(`${CURRENT_BUDGET_KEY_PREFIX}${DEFAULT_USER_ID}`, SECOND_ID)
    mock.current = createSupabaseMock(fakeSession(), twoBudgets())
    renderRoutes(routes, '/')

    expect(await screen.findByTestId('current-budget-name')).toHaveTextContent('Ski trip')
  })

  it('falls back to another budget when the remembered one is gone', async () => {
    localStorage.setItem(`${CURRENT_BUDGET_KEY_PREFIX}${DEFAULT_USER_ID}`, 'deleted-budget')
    mock.current = createSupabaseMock(fakeSession(), twoBudgets())
    renderRoutes(routes, '/')

    expect(await screen.findByTestId('current-budget-name')).toHaveTextContent('Household')
  })

  it('a "not found" answer refetches my budgets, so a budget I was removed from goes away', async () => {
    const db = twoBudgets()
    localStorage.setItem(`${CURRENT_BUDGET_KEY_PREFIX}${DEFAULT_USER_ID}`, SECOND_ID)
    mock.current = createSupabaseMock(fakeSession(), db)
    const { router } = renderRoutes(routes, '/settings')
    expect(await screen.findByTestId('current-budget-name')).toHaveTextContent('Ski trip')

    // Meanwhile the owner removed me; my next write is answered "not found".
    db.tables.my_budgets = db.tables.my_budgets.filter((budget) => budget.id !== SECOND_ID)
    db.tables.budgets = []
    await userEvent.clear(await screen.findByLabelText('Budget name'))
    await userEvent.type(screen.getByLabelText('Budget name'), 'Renamed')
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))

    expect(
      (
        await screen.findAllByText(
          'This budget no longer exists, or you are no longer one of its members.',
        )
      ).length,
    ).toBeGreaterThan(0)
    await waitFor(() => {
      expect(screen.getByTestId('current-budget-name')).toHaveTextContent('Household')
    })
    expect(router.state.location.pathname).toBe('/settings')
  })

  it('without any budget left, the user is sent to the setup', async () => {
    const db = householdDb()
    mock.current = createSupabaseMock(fakeSession(), db)
    const { router, queryClient } = renderRoutes(routes, '/')
    expect(await screen.findByTestId('current-budget-name')).toHaveTextContent('Household')

    db.tables.my_budgets = []
    await act(() => queryClient.invalidateQueries({ queryKey: ['budgets'] }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/welcome')
    })
  })

  it('a new budget can be created from the switcher and becomes the current one', async () => {
    const db = householdDb()
    mock.current = createSupabaseMock(fakeSession(), db)
    db.rpc.create_budget.mockImplementation(() => {
      db.tables.my_budgets.push(budgetRow({ id: 'created', name: 'Allotment' }))
      return 'created'
    })
    const { router } = renderRoutes(routes, '/')

    await userEvent.click(await screen.findByRole('button', { name: /Current budget/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Create a budget' }))
    expect(router.state.location.pathname).toBe('/budgets/new')

    await userEvent.type(await screen.findByLabelText('Budget name'), 'Allotment')
    await userEvent.type(screen.getByLabelText('Name'), 'Pocket money')
    await userEvent.type(screen.getByLabelText('Amount per month'), '50')
    await userEvent.click(screen.getByRole('button', { name: 'Create budget' }))

    await waitFor(() => {
      expect(screen.getByTestId('current-budget-name')).toHaveTextContent('Allotment')
    })
    expect(router.state.location.pathname).toBe('/')
  })
})

describe('periods are made to exist when a budget is opened [R-PERIOD-050]', () => {
  it('calls ensure_periods for the budget that is opened, and again for the next one', async () => {
    const db = twoBudgets()
    db.tables.income_overview.push(incomeRow({ budget_id: SECOND_ID, id: 'income-2' }))
    db.tables.budget_member_list.push(memberRow({ budget_id: SECOND_ID }))
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/periods')

    await waitFor(() => {
      expect(db.rpc.ensure_periods).toHaveBeenCalledWith({ p_budget_id: BUDGET_ID })
    })
    await userEvent.click(await screen.findByRole('button', { name: /Current budget/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Ski trip' }))
    await waitFor(() => {
      expect(db.rpc.ensure_periods).toHaveBeenCalledWith({ p_budget_id: SECOND_ID })
    })
  })

  it('refetches the periods when it created some', async () => {
    const db = householdDb()
    db.tables.period_summaries = []
    db.rpc.ensure_periods.mockImplementation(() => {
      db.tables.period_summaries = [periodRow()]
      return 1
    })
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/periods')

    expect(await screen.findAllByTestId('period-row')).toHaveLength(1)
  })
})
