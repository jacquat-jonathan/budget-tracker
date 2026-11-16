import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import i18n from '@/lib/i18n'
import { renderRoutes } from '@/test/render'
import {
  BUDGET_ID,
  DEFAULT_USER_ID,
  OTHER_USER_ID,
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

afterEach(async () => {
  await i18n.changeLanguage('en')
})

/** Alex (me, owner, primary salary) and Sam (member, a second income). */
function sharedBudget() {
  return householdDb(DEFAULT_USER_ID, {
    income_overview: [
      incomeRow(),
      incomeRow({
        id: 'income-2',
        user_id: OTHER_USER_ID,
        name: 'Part-time job',
        is_primary: false,
        amount: 210_000,
        pay_day: 31,
        weekend_rule: 'next',
        next_pay_date: '2026-11-30',
      }),
      incomeRow({
        id: 'income-4',
        user_id: 'former-member',
        user_display_name: 'Robin',
        name: 'Lodger rent',
        is_primary: false,
        is_active: false,
        end_seq: 2,
        next_pay_date: null,
      }),
      incomeRow({
        id: 'income-3',
        user_id: null,
        name: 'Old side job',
        is_primary: false,
        is_active: false,
        end_seq: 2,
        next_pay_date: null,
      }),
    ],
    budget_member_list: [
      memberRow(),
      memberRow({
        user_id: OTHER_USER_ID,
        role: 'member',
        display_name: 'Sam',
        email: 'sam@example.com',
      }),
    ],
  })
}

async function openIncomePage() {
  const db = sharedBudget()
  mock.current = createSupabaseMock(fakeSession(), db)
  renderRoutes(routes, '/income')
  await screen.findAllByTestId('income-card')
  return db
}

function card(name: string): HTMLElement {
  const match = screen
    .getAllByTestId('income-card')
    .find((element) => within(element).queryByRole('heading', { name }))
  if (!match) throw new Error(`No income card for ${name}`)
  return match
}

describe('income page', () => {
  it('lists incomes with their owner, terms, next pay date and the monthly total', async () => {
    await openIncomePage()

    const salary = card('Salary')
    expect(within(salary).getByText('Primary')).toBeInTheDocument()
    expect(within(salary).getByText('Alex (you)')).toBeInTheDocument()
    expect(within(salary).getByText("CHF 6'500.00")).toBeInTheDocument()
    expect(within(salary).getByText('Day 25, nearest working day')).toBeInTheDocument()
    expect(within(salary).getByText('25.11.2026')).toBeInTheDocument()

    const partTime = card('Part-time job')
    expect(within(partTime).getByText('Sam')).toBeInTheDocument()
    expect(within(partTime).getByText('Day 31, Monday after')).toBeInTheDocument()

    // The monthly total is the current period's income total, read from the database.
    expect(screen.getByTestId('monthly-total')).toHaveTextContent("CHF 6'500.00")
    expect(screen.getByRole('heading', { name: 'Ended incomes' })).toBeInTheDocument()
    expect(screen.getByText('Deleted account')).toBeInTheDocument()
    expect(screen.getByText('Robin (former member)')).toBeInTheDocument()
    expect(screen.getAllByText('Last counted in the period ending 22.10.2026')).toHaveLength(2)
  })

  it('a new income is mine by default, and any member’s if I choose them [R-INCOME-002]', async () => {
    const db = await openIncomePage()

    await userEvent.click(screen.getByRole('button', { name: 'Add income' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('combobox', { name: 'Whose income' })).toHaveTextContent(
      'Alex (you)',
    )
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Bonus')
    await userEvent.type(within(dialog).getByLabelText('Amount per month'), '1 000,50')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(db.rpc.add_income).toHaveBeenCalledWith({
        p_budget_id: BUDGET_ID,
        p_name: 'Bonus',
        p_amount: 100_050,
        p_pay_day: 25,
        p_weekend_rule: 'nearest',
      })
    })
    expect(await screen.findByText('Income “Bonus” added.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Add income' }))
    const second = await screen.findByRole('dialog')
    await userEvent.click(within(second).getByRole('combobox', { name: 'Whose income' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Sam' }))
    await userEvent.type(within(second).getByLabelText('Name'), 'Sam’s salary')
    await userEvent.type(within(second).getByLabelText('Amount per month'), '3200')
    await userEvent.click(within(second).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(db.rpc.add_income).toHaveBeenLastCalledWith(
        expect.objectContaining({ p_user_id: OTHER_USER_ID, p_amount: 320_000 }),
      )
    })
  })

  it('also lets me edit another member’s income [R-INCOME-002]', async () => {
    const db = await openIncomePage()

    await userEvent.click(
      within(card('Part-time job')).getByRole('button', { name: 'Actions for Part-time job' }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText(
        'New terms apply from the current period, which started on 23.10.2026. Past periods keep the terms they had.',
      ),
    ).toBeInTheDocument()
    const amount = within(dialog).getByLabelText('Amount per month')
    expect(amount).toHaveValue("2'100.00")
    await userEvent.clear(amount)
    await userEvent.type(amount, '2250')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(db.rpc.update_income_terms).toHaveBeenCalledWith({
        p_income_id: 'income-2',
        p_amount: 225_000,
        p_pay_day: 31,
        p_weekend_rule: 'next',
      })
    })
  })

  it('corrects the terms from an earlier period only when asked, with a warning [R-INCOME-051] [R-VERSION-012]', async () => {
    const db = await openIncomePage()

    await userEvent.click(
      within(card('Part-time job')).getByRole('button', { name: 'Actions for Part-time job' }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByLabelText('Correct an earlier period'))
    expect(within(dialog).getByText(/This changes past periods/)).toBeInTheDocument()
    expect(within(dialog).getByRole('combobox', { name: 'Apply from' })).toHaveTextContent(
      '25.09.2026 – 22.10.2026',
    )
    // It applies until the next change already recorded, not to every later period.
    expect(dialog).toHaveTextContent('until the next change already recorded')
    // Same terms: a correction is still sent, to apply them to the earlier periods too.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(db.rpc.update_income_terms).toHaveBeenCalledWith({
        p_income_id: 'income-2',
        p_amount: 210_000,
        p_pay_day: 31,
        p_weekend_rule: 'next',
        p_from_period_id: 'period-1',
      })
    })
  })

  it('renaming only updates the name, without a new version of the terms', async () => {
    const db = await openIncomePage()
    db.tables.incomes = [
      {
        id: 'income-2',
        budget_id: BUDGET_ID,
        user_id: OTHER_USER_ID,
        name: 'Part-time job',
        first_seq: 1,
        end_seq: null,
        ended_after_last: false,
        created_at: '2026-10-01T10:00:00+00:00',
        updated_at: '2026-10-01T10:00:00+00:00',
      },
    ]
    await userEvent.click(
      within(card('Part-time job')).getByRole('button', { name: 'Actions for Part-time job' }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const name = within(await screen.findByRole('dialog')).getByLabelText('Name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Evening job')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(db.tables.incomes[0]?.name).toBe('Evening job')
    })
    expect(db.rpc.update_income_terms).not.toHaveBeenCalled()
  })

  it('makes another income primary, and does not offer to remove the primary one', async () => {
    const db = await openIncomePage()

    await userEvent.click(
      within(card('Salary')).getByRole('button', { name: 'Actions for Salary' }),
    )
    expect(await screen.findByRole('menuitem', { name: 'Remove' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(
      screen.getByText('The primary income cannot be removed. Make another income primary first.'),
    ).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')

    await userEvent.click(
      within(card('Part-time job')).getByRole('button', { name: 'Actions for Part-time job' }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Make primary' }))
    await waitFor(() => {
      expect(db.rpc.set_primary_income).toHaveBeenCalledWith({ p_income_id: 'income-2' })
    })
    // The next pay date the database now expects, read back: never computed here.
    expect(
      await screen.findByText(
        '“Part-time job” is now the primary income. The next salary is now expected on 25.11.2026.',
      ),
    ).toBeInTheDocument()
  })

  it('after the primary income’s pay day changes, says when the next salary is now expected [R-INCOME-054]', async () => {
    const db = await openIncomePage()
    db.rpc.update_income_terms.mockImplementation(() => {
      db.tables.period_summaries = db.tables.period_summaries.map((period) =>
        period.is_current ? { ...period, end_date: '2026-11-27' } : period,
      )
      return null
    })

    await userEvent.click(
      within(card('Salary')).getByRole('button', { name: 'Actions for Salary' }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('no period that has started moves')
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Pay day' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Day 28' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText(
        'Income “Salary” saved. The next salary is now expected on 28.11.2026.',
      ),
    ).toBeInTheDocument()
    expect(db.rpc.get_current_period).toHaveBeenCalled()
  })

  it('removes an income after confirmation and says whether it ended or was deleted', async () => {
    const db = await openIncomePage()
    db.rpc.remove_income.mockImplementation(() => 'ended')

    await userEvent.click(
      within(card('Part-time job')).getByRole('button', { name: 'Actions for Part-time job' }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove' }))
    const confirm = await screen.findByRole('alertdialog')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Remove' }))

    expect(
      await screen.findByText('“Part-time job” ended. Past periods still count it.'),
    ).toBeInTheDocument()
    expect(db.rpc.remove_income).toHaveBeenCalledWith({ p_income_id: 'income-2' })
  })

  it('removes an income from an earlier period only when asked, with a warning [R-INCOME-051] [R-INCOME-015]', async () => {
    const db = await openIncomePage()

    await userEvent.click(
      within(card('Part-time job')).getByRole('button', { name: 'Actions for Part-time job' }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove' }))
    const confirm = await screen.findByRole('alertdialog')
    expect(within(confirm).queryByText(/This changes past periods/)).not.toBeInTheDocument()
    await userEvent.click(within(confirm).getByLabelText('Remove it from an earlier period'))
    expect(within(confirm).getByText(/This changes past periods/)).toBeInTheDocument()
    expect(within(confirm).getByRole('combobox', { name: 'Remove from' })).toHaveTextContent(
      '25.09.2026 – 22.10.2026',
    )
    await userEvent.click(within(confirm).getByRole('button', { name: 'Remove' }))

    await waitFor(() => {
      expect(db.rpc.remove_income).toHaveBeenCalledWith({
        p_income_id: 'income-2',
        p_from_period_id: 'period-1',
      })
    })
  })

  it('shows a refused action as a translated message, in French too [R-APP-004]', async () => {
    await i18n.changeLanguage('fr')
    const db = await openIncomePage()
    db.rpc.set_primary_income.mockImplementation(() => rpcError('income_ended'))

    await userEvent.click(
      within(card('Part-time job')).getByRole('button', { name: 'Actions pour Part-time job' }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Définir comme principal' }))

    expect(
      await screen.findByText('Ce revenu a pris fin et ne peut plus être modifié.'),
    ).toBeInTheDocument()
  })

  it('in an ended budget, explains why incomes can no longer be added or changed', async () => {
    const db = sharedBudget()
    db.tables.period_summaries = db.tables.period_summaries.map((period) => ({
      ...period,
      is_current: false,
    }))
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/income')

    expect(await screen.findByText('This budget has ended')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add income' })).toBeDisabled()
  })
})
