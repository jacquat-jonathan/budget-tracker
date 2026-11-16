import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { renderRoutes } from '@/test/render'
import {
  BUDGET_ID,
  DEFAULT_USER_ID,
  budgetRow,
  householdDb,
  incomeRow,
  periodRow,
} from '@/test/budget-fixtures'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

function card(name: string): HTMLElement {
  const match = screen
    .getAllByTestId('income-card')
    .find((element) => within(element).queryByRole('heading', { name }))
  if (!match) throw new Error(`No income card for ${name}`)
  return match
}

/**
 * The reviewer's case: the salary arrived early on 08.12, so the current period runs
 * 08.12.2026 – 10.01.2027, while the schedule's next pay date is 10.12.2026.
 */
function earlySalaryDb() {
  return householdDb(DEFAULT_USER_ID, {
    period_summaries: [
      periodRow({
        id: 'period-1',
        seq: 1,
        start_date: '2026-11-10',
        end_date: '2026-12-07',
        is_current: false,
        end_is_manual: true,
        today: '2026-12-08',
      }),
      periodRow({ start_date: '2026-12-08', end_date: '2027-01-10', today: '2026-12-08' }),
    ],
    income_overview: [
      incomeRow({ pay_day: 10, next_pay_date: '2026-12-10' }),
      incomeRow({
        id: 'income-2',
        name: 'Part-time job',
        is_primary: false,
        pay_day: 15,
        next_pay_date: '2026-12-15',
      }),
    ],
  })
}

describe('every place announcing the next salary agrees with the period [R-INCOME-056]', () => {
  it('the dashboard and the income card give the day after the period ends, not the schedule', async () => {
    mock.current = createSupabaseMock(fakeSession(), earlySalaryDb())
    const { router } = renderRoutes(routes, '/')

    const next = await screen.findByTestId('next-pay-day')
    await waitFor(() => {
      expect(next).toHaveTextContent('11.01.2027')
    })
    expect(next).not.toHaveTextContent('10.12.2026')

    await act(() => router.navigate('/income'))
    await screen.findAllByTestId('income-card')
    expect(within(card('Salary')).getByTestId('income-next-pay-date')).toHaveTextContent(
      '11.01.2027',
    )
    // Another income keeps its own schedule.
    expect(within(card('Part-time job')).getByTestId('income-next-pay-date')).toHaveTextContent(
      '15.12.2026',
    )

    await act(() => router.navigate('/periods'))
    expect(await screen.findByTestId('next-salary')).toHaveTextContent(
      'Next salary expected on 11.01.2027',
    )
  })

  it('the budget’s last period announces the budget’s end, not a salary after it', async () => {
    const db = householdDb(DEFAULT_USER_ID, {
      my_budgets: [budgetRow({ end_date_entered: '2026-11-20', end_date: '2026-11-24' })],
    })
    mock.current = createSupabaseMock(fakeSession(), db)
    const { router } = renderRoutes(routes, '/')

    const next = await screen.findByTestId('next-pay-day')
    expect(next).toHaveTextContent('Budget ends')
    expect(next).toHaveTextContent('24.11.2026')
    expect(next).not.toHaveTextContent('25.11.2026')

    await act(() => router.navigate('/income'))
    await screen.findAllByTestId('income-card')
    expect(within(card('Salary')).getByTestId('income-next-pay-date')).toHaveTextContent('–')

    await act(() => router.navigate('/periods'))
    expect(await screen.findByTestId('next-salary')).toHaveTextContent(
      'The budget’s last period: it ends on 24.11.2026',
    )
  })

  it('an ended budget shows no next pay date on any income', async () => {
    const db = householdDb(DEFAULT_USER_ID, {
      my_budgets: [budgetRow({ end_date_entered: '2026-10-10', end_date: '2026-10-22' })],
      period_summaries: [
        periodRow({
          id: 'period-1',
          seq: 1,
          start_date: '2026-09-25',
          end_date: '2026-10-22',
          is_current: false,
        }),
      ],
    })
    db.rpc.get_current_period.mockImplementation(() => [])
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/income')

    await screen.findAllByTestId('income-card')
    expect(within(card('Salary')).getByTestId('income-next-pay-date')).toHaveTextContent('–')
  })
})

describe('"has this salary already arrived?" offers only what the database accepts [R-PERIOD-037]', () => {
  /** Period started 10.11 under pay day 10, today 16.11; the previous one began 10.10. */
  function correctionDb() {
    const db = householdDb(DEFAULT_USER_ID, {
      period_summaries: [
        periodRow({
          id: 'period-1',
          seq: 1,
          start_date: '2026-10-10',
          end_date: '2026-11-09',
          is_current: false,
          today: '2026-11-16',
        }),
        periodRow({ start_date: '2026-11-10', end_date: '2026-12-09', today: '2026-11-16' }),
      ],
      income_overview: [incomeRow({ pay_day: 10, next_pay_date: '2026-12-10' })],
    })
    db.rpc.pay_date.mockImplementation((args) =>
      args.p_pay_day === 13 ? '2026-11-13' : '2026-11-10',
    )
    db.rpc.preview_update_income.mockImplementation(() => [
      {
        period_id: 'period-2',
        end_date: '2026-12-12',
        expected_pay_date: '2026-12-13',
        end_is_manual: false,
      },
    ])
    return db
  }

  async function correctPayDayTo13() {
    await userEvent.click(
      within(card('Salary')).getByRole('button', { name: 'Actions for Salary' }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Pay day' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Day 13' }))
    return dialog
  }

  it('this period’s own salary, due 3 days after the start: offers to move the start', async () => {
    const db = correctionDb()
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/income')
    await screen.findAllByTestId('income-card')

    const dialog = await correctPayDayTo13()
    expect(await within(dialog).findByTestId('pay-date-preview')).toHaveTextContent(
      'this period’s own salary was due on 13.11.2026',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    const prompt = await screen.findByRole('alertdialog', {
      name: 'Did this period’s salary arrive on 13.11.2026?',
    })
    expect(
      within(prompt).queryByRole('button', { name: 'Record the pay date' }),
    ).not.toBeInTheDocument()
    await userEvent.click(within(prompt).getByRole('button', { name: 'Move the start' }))

    const move = await screen.findByRole('dialog', {
      name: 'This period’s salary arrived on another day',
    })
    expect(within(move).getByLabelText('Day the salary arrived')).toHaveValue('13.11.2026')
    expect(within(move).getByTestId('boundary-preview')).toHaveTextContent(
      'The previous period will end on 12.11.2026, and this one starts on 13.11.2026.',
    )
    await userEvent.click(within(move).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.move_period_start).toHaveBeenCalledWith({
        p_period_id: 'period-2',
        p_expected_revision: 1,
        p_start_date: '2026-11-13',
      })
    })
    expect(db.rpc.record_early_pay_date).not.toHaveBeenCalled()
  })

  it('does not ask when neither operation could be saved (no previous period)', async () => {
    const db = correctionDb()
    db.tables.period_summaries = db.tables.period_summaries.filter((period) => period.is_current)
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/income')
    await screen.findAllByTestId('income-card')

    const dialog = await correctPayDayTo13()
    const preview = await within(dialog).findByTestId('pay-date-preview')
    await waitFor(() => {
      expect(preview).toHaveTextContent('would then be expected on 13.12.2026')
    })
    expect(preview).not.toHaveTextContent('was due on')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

describe('focus returns to the row’s menu button after a dialog opened from it [R-APP-006]', () => {
  it('after Escape and after Save', async () => {
    mock.current = createSupabaseMock(fakeSession(), householdDb())
    renderRoutes(routes, '/income')
    await screen.findAllByTestId('income-card')
    const menuButton = within(card('Salary')).getByRole('button', { name: 'Actions for Salary' })

    menuButton.focus()
    await userEvent.keyboard('{Enter}')
    await screen.findByRole('menuitem', { name: 'Edit' })
    await userEvent.keyboard('{Enter}')
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(document.activeElement).toBe(menuButton)
    })

    await userEvent.keyboard('{Enter}')
    await screen.findByRole('menuitem', { name: 'Edit' })
    await userEvent.keyboard('{Enter}')
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Name'), ' 2')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(document.activeElement).toBe(menuButton)
    })
  })
})

describe('a write is sent once, however fast the form is submitted again [R-APP-007]', () => {
  it('two submits before the button is disabled create one income', async () => {
    const db = householdDb()
    let finish: (id: string) => void = () => undefined
    db.rpc.add_income.mockImplementation(() => new Promise<string>((resolve) => (finish = resolve)))
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/income')
    await userEvent.click(await screen.findByRole('button', { name: 'Add income' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Bonus')
    await userEvent.type(within(dialog).getByLabelText('Amount per month'), '100')
    const form = within(dialog).getByLabelText('Name').closest('form')
    if (!form) throw new Error('no form')

    // Both submits land before React re-renders the disabled button.
    act(() => {
      fireEvent.submit(form)
      fireEvent.submit(form)
    })
    await waitFor(() => {
      expect(db.rpc.add_income).toHaveBeenCalled()
    })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(db.rpc.add_income).toHaveBeenCalledTimes(1)
    expect(db.rpc.add_income).toHaveBeenCalledWith(
      expect.objectContaining({ p_budget_id: BUDGET_ID, p_name: 'Bonus' }),
    )
    finish('new-income')
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
