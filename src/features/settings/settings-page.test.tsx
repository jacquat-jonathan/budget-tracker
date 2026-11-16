import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { renderRoutes } from '@/test/render'
import {
  BUDGET_ID,
  DEFAULT_USER_ID,
  OTHER_USER_ID,
  budgetRow,
  householdDb,
  incomeRow,
  memberRow,
} from '@/test/budget-fixtures'
import { rpcError } from '@/test/mock-db'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

const budgetsTableRow = {
  id: BUDGET_ID,
  name: 'Household',
  owner_id: DEFAULT_USER_ID,
  primary_income_id: 'income-1',
  end_date: null,
  created_at: '2026-10-01T10:00:00+00:00',
  updated_at: '2026-10-01T10:00:00+00:00',
}

/** I am Alex; Sam is the other member. `asOwner` decides which of us owns the budget. */
function sharedBudget({ asOwner }: { asOwner: boolean }) {
  return householdDb(DEFAULT_USER_ID, {
    my_budgets: [
      budgetRow({ is_owner: asOwner, owner_id: asOwner ? DEFAULT_USER_ID : OTHER_USER_ID }),
    ],
    budgets: [{ ...budgetsTableRow, owner_id: asOwner ? DEFAULT_USER_ID : OTHER_USER_ID }],
    budget_member_list: [
      memberRow({ role: asOwner ? 'owner' : 'member' }),
      memberRow({
        user_id: OTHER_USER_ID,
        role: asOwner ? 'member' : 'owner',
        display_name: 'Sam',
        email: 'sam@example.com',
      }),
    ],
    income_overview: [
      // The primary income is the owner's.
      incomeRow({ user_id: asOwner ? DEFAULT_USER_ID : OTHER_USER_ID }),
    ],
    budget_invitations: asOwner
      ? [
          {
            id: 'inv-1',
            budget_id: BUDGET_ID,
            email: 'kim@example.com',
            invited_by: DEFAULT_USER_ID,
            created_at: '2026-11-12T08:00:00+00:00',
            expires_at: '2026-12-12T08:00:00+00:00',
          },
        ]
      : [],
    profiles: [
      {
        id: DEFAULT_USER_ID,
        display_name: 'Alex',
        email: 'alex@example.com',
        created_at: '2026-01-01T00:00:00+00:00',
        updated_at: '2026-01-01T00:00:00+00:00',
      },
    ],
  })
}

async function openSettings(asOwner: boolean) {
  const db = sharedBudget({ asOwner })
  mock.current = createSupabaseMock(fakeSession(), db)
  const result = renderRoutes(routes, '/settings')
  await screen.findByTestId('member-list')
  return { db, ...result }
}

describe('settings as a plain member [R-MEMBER-050]', () => {
  it('offers no owner-only action, and says why', async () => {
    await openSettings(false)

    expect(screen.queryByRole('button', { name: 'Delete budget' })).not.toBeInTheDocument()
    expect(screen.getByText('Only the owner can delete the budget.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save end date' })).not.toBeInTheDocument()
    expect(screen.getByText('Only the owner can change the end date.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Invite' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
    expect(
      screen.getByText('Only the owner can invite people and remove members.'),
    ).toBeInTheDocument()
    // Renaming is for every member.
    expect(screen.getByRole('button', { name: 'Rename' })).toBeEnabled()
  })

  it('can leave the budget, after confirming', async () => {
    const { db } = await openSettings(false)

    const me = within(screen.getByTestId('member-list')).getByText('Alex (you)').closest('li')!
    await userEvent.click(within(me).getByRole('button', { name: 'Leave budget' }))
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Leave budget' }),
    )
    await waitFor(() => {
      expect(db.rpc.leave_budget).toHaveBeenCalledWith({ p_budget_id: BUDGET_ID })
    })
  })

  it('cannot leave while their income is the primary one', async () => {
    const db = sharedBudget({ asOwner: false })
    db.tables.income_overview = [incomeRow({ user_id: DEFAULT_USER_ID })]
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/settings')

    expect(
      await screen.findByText(
        'Your income is the primary income: make another income primary first.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Leave budget' })).toBeDisabled()
  })

  it('renames the budget', async () => {
    const { db } = await openSettings(false)

    const name = screen.getByLabelText('Budget name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Our flat')
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))

    await waitFor(() => {
      expect(db.tables.budgets[0]?.name).toBe('Our flat')
    })
    expect(await screen.findByText('Budget renamed.')).toBeInTheDocument()
  })
})

describe('settings as the owner [R-MEMBER-050]', () => {
  it('invites by email, says that no email is sent, and lists pending invitations', async () => {
    const { db } = await openSettings(true)

    expect(screen.getByText('No email is sent')).toBeInTheDocument()
    expect(within(screen.getByTestId('invitation-list')).getByText('kim@example.com')).toBeVisible()

    await userEvent.type(screen.getByLabelText('Email address'), '  Lou@Example.com ')
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }))
    await waitFor(() => {
      expect(db.rpc.invite_member).toHaveBeenCalledWith({
        p_budget_id: BUDGET_ID,
        p_email: 'Lou@Example.com',
      })
    })
  })

  it('shows a refused invitation as a translated message [R-APP-004]', async () => {
    const { db } = await openSettings(true)
    db.rpc.invite_member.mockImplementation(() => rpcError('already_member'))

    await userEvent.type(screen.getByLabelText('Email address'), 'sam@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }))
    expect(
      await screen.findByText('This person is already a member of the budget.'),
    ).toBeInTheDocument()
  })

  it('shows when each invitation expires and renews it by inviting again [R-INVITE-009]', async () => {
    const { db } = await openSettings(true)

    expect(screen.getByText('Invited on 12.11.2026, valid until 12.12.2026')).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Renew the invitation for kim@example.com for 30 days' }),
    )
    await waitFor(() => {
      expect(db.rpc.invite_member).toHaveBeenCalledWith({
        p_budget_id: BUDGET_ID,
        p_email: 'kim@example.com',
      })
    })
    expect(
      await screen.findByText('The invitation for kim@example.com is valid for 30 more days.'),
    ).toBeInTheDocument()
  })

  it('cancels an invitation through the database [R-BUDGET-018]', async () => {
    const { db } = await openSettings(true)

    await userEvent.click(
      screen.getByRole('button', { name: 'Cancel the invitation for kim@example.com' }),
    )
    await waitFor(() => {
      expect(screen.queryByTestId('invitation-list')).not.toBeInTheDocument()
    })
    expect(db.rpc.cancel_invitation).toHaveBeenCalledWith({ p_invitation_id: 'inv-1' })
  })

  it('says when the invitation was already gone, and when cancelling is not allowed [R-BUDGET-018]', async () => {
    const { db } = await openSettings(true)

    db.rpc.cancel_invitation.mockImplementationOnce(() => rpcError('invitation_not_found'))
    await userEvent.click(
      screen.getByRole('button', { name: 'Cancel the invitation for kim@example.com' }),
    )
    expect(
      await screen.findByText('This invitation was already accepted, declined or cancelled.'),
    ).toBeInTheDocument()

    db.rpc.cancel_invitation.mockImplementationOnce(() => rpcError('not_owner'))
    await userEvent.click(
      screen.getByRole('button', { name: 'Cancel the invitation for kim@example.com' }),
    )
    expect(await screen.findByText('Only the owner of the budget can do this.')).toBeInTheDocument()
  })

  it('removes a member after confirming', async () => {
    const { db } = await openSettings(true)

    const sam = within(screen.getByTestId('member-list')).getByText('Sam').closest('li')!
    await userEvent.click(within(sam).getByRole('button', { name: 'Remove' }))
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }),
    )
    await waitFor(() => {
      expect(db.rpc.remove_member).toHaveBeenCalledWith({
        p_budget_id: BUDGET_ID,
        p_user_id: OTHER_USER_ID,
      })
    })
  })

  it('sets and clears the end date, showing the date entered and the last day [R-BUDGET-054]', async () => {
    const { db } = await openSettings(true)
    // 10.04.2027 lies in the period that ends on 24.04.2027: the budget's last day.
    db.rpc.set_budget_end_date.mockImplementationOnce(() => {
      db.tables.my_budgets = [budgetRow({ end_date_entered: '2027-04-10', end_date: '2027-04-24' })]
      return db.tables.my_budgets
    })

    await userEvent.type(screen.getByLabelText('End date (optional)'), '10.04.2027')
    await userEvent.click(screen.getByRole('button', { name: 'Save end date' }))
    expect(await screen.findByText('The budget now ends on 24.04.2027.')).toBeInTheDocument()
    expect(db.rpc.set_budget_end_date).toHaveBeenCalledWith({
      p_budget_id: BUDGET_ID,
      p_end_date: '2027-04-10',
    })

    db.rpc.set_budget_end_date.mockImplementationOnce(() => {
      db.tables.my_budgets = [budgetRow()]
      return db.tables.my_budgets
    })
    await waitFor(() => {
      expect(
        screen.getByText(
          'Entered: 10.04.2027. The budget ends with the period that contains this date, so its last day is 24.04.2027.',
        ),
      ).toBeInTheDocument()
    })
    await userEvent.click(screen.getByRole('button', { name: 'Run indefinitely' }))
    expect(await screen.findByText('The budget now runs indefinitely.')).toBeInTheDocument()
    // Clearing omits the argument.
    expect(db.rpc.set_budget_end_date).toHaveBeenLastCalledWith({ p_budget_id: BUDGET_ID })
  })

  it('deletes the budget only once its name is typed [R-BUDGET-052]', async () => {
    const { db } = await openSettings(true)

    await userEvent.click(screen.getByRole('button', { name: 'Delete budget' }))
    const dialog = await screen.findByRole('alertdialog')
    const confirm = within(dialog).getByRole('button', { name: 'Delete budget' })
    expect(confirm).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText('Type “Household” to confirm'), 'Househol')
    expect(confirm).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText('Type “Household” to confirm'), 'd')
    expect(confirm).toBeEnabled()

    await userEvent.click(confirm)
    await waitFor(() => {
      expect(db.rpc.delete_budget).toHaveBeenCalledWith({ p_budget_id: BUDGET_ID })
    })
  })

  it('says when the budget was already deleted [R-BUDGET-018]', async () => {
    const { db } = await openSettings(true)
    db.rpc.delete_budget.mockImplementation(() => rpcError('budget_not_found'))

    await userEvent.click(screen.getByRole('button', { name: 'Delete budget' }))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.type(within(dialog).getByLabelText('Type “Household” to confirm'), 'Household')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete budget' }))

    expect((await screen.findAllByText('This budget was already deleted.')).length).toBeGreaterThan(
      0,
    )
  })

  it('saves my display name', async () => {
    const { db } = await openSettings(true)

    const field = await screen.findByLabelText('Display name')
    await waitFor(() => {
      expect(field).toHaveValue('Alex')
    })
    await userEvent.clear(field)
    await userEvent.type(field, 'Alexandra')
    const account = field.closest('form')!
    await userEvent.click(within(account).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(db.tables.profiles[0]?.display_name).toBe('Alexandra')
    })
  })
})
