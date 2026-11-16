import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { renderRoutes } from '@/test/render'
import { budgetRow, householdDb, periodRow } from '@/test/budget-fixtures'
import { rpcError } from '@/test/mock-db'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

/**
 * The household fixture: September (25.09 – 22.10, end set by hand) and October
 * (23.10 – 24.11, current); the database's today is 15.11.2026.
 */
async function openPeriods(db = householdDb()) {
  mock.current = createSupabaseMock(fakeSession(), db)
  renderRoutes(routes, '/periods')
  const rows = await screen.findAllByTestId('period-row')
  return { db, rows }
}

async function choose(row: HTMLElement, month: string, action: string) {
  await userEvent.click(within(row).getByRole('button', { name: `Actions for ${month}` }))
  await userEvent.click(await screen.findByRole('menuitem', { name: action }))
}

async function typeDate(dialog: HTMLElement, label: RegExp, value: string) {
  const field = within(dialog).getByLabelText(label)
  await userEvent.clear(field)
  await userEvent.type(field, value)
}

describe('periods page [R-PERIOD-051]', () => {
  it('lists one period per month, newest first, with dates, total and what was set by hand', async () => {
    const { rows } = await openPeriods()

    expect(rows).toHaveLength(2)
    const [october, september] = rows as [HTMLElement, HTMLElement]
    expect(within(october).getByRole('heading', { name: 'October 2026' })).toBeInTheDocument()
    expect(october).toHaveTextContent('23.10.2026 – 24.11.2026')
    expect(within(october).getByText('Current')).toBeInTheDocument()
    expect(within(october).getByText('Start set by hand')).toBeInTheDocument()
    expect(october).toHaveTextContent("CHF 6'500.00")
    expect(within(september).getByRole('heading', { name: 'September 2026' })).toBeInTheDocument()
    expect(within(september).getByText('End set by hand')).toBeInTheDocument()
  })

  it('"the salary arrived on another day" moves the start of that month, with a preview', async () => {
    const { db, rows } = await openPeriods()

    await choose(rows[0]!, 'October 2026', 'The October 2026 salary arrived on another day')
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText('The October 2026 salary is scheduled for 23.10.2026.'),
    ).toBeVisible()
    await typeDate(dialog, /Day the October 2026 salary arrived/, '27.10.2026')
    expect(within(dialog).getByTestId('boundary-preview')).toHaveTextContent(
      'September 2026 will end on 26.10.2026, and October 2026 will start on 27.10.2026.',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(db.rpc.move_period_boundary).toHaveBeenCalledWith({
        p_period_id: 'period-1',
        p_new_end: '2026-10-26',
      })
    })
  })

  it('"the salary has not arrived yet" reopens the previous period, using the database’s today', async () => {
    const { db, rows } = await openPeriods()

    await choose(rows[0]!, 'October 2026', 'The October 2026 salary has not arrived yet')
    const dialog = await screen.findByRole('dialog')
    // Proposed: tomorrow, from the database's today (15.11.2026).
    expect(within(dialog).getByLabelText(/is now expected/)).toHaveValue('16.11.2026')
    expect(within(dialog).getByTestId('boundary-preview')).toHaveTextContent(
      'The October 2026 period will be removed for now, and September 2026 is current again until 15.11.2026.',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(db.rpc.move_period_boundary).toHaveBeenCalledWith({
        p_period_id: 'period-1',
        p_new_end: '2026-11-15',
      })
    })
  })

  it('"the next salary arrived early" closes the current period when the day has come', async () => {
    const { db, rows } = await openPeriods()

    await choose(rows[0]!, 'October 2026', 'The November 2026 salary arrived early')
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByTestId('boundary-preview')).toHaveTextContent(
      'This period will end on 24.11.2026: the November 2026 salary is expected on 25.11.2026.',
    )
    await typeDate(dialog, /Day the November 2026 salary arrived/, '14.11.2026')
    expect(within(dialog).getByTestId('boundary-preview')).toHaveTextContent(
      'This period will close on 13.11.2026, and the November 2026 period starts on 14.11.2026.',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(db.rpc.move_period_boundary).toHaveBeenCalledWith({
        p_period_id: 'period-2',
        p_new_end: '2026-11-13',
      })
    })
  })

  it('resets a boundary set by hand to the schedule, by omitting the new end', async () => {
    const { db, rows } = await openPeriods()

    await choose(rows[1]!, 'September 2026', 'Reset the end to the schedule')
    const confirm = await screen.findByRole('alertdialog')
    expect(confirm).toHaveTextContent(
      'The October 2026 period starts again on its scheduled pay date, 23.10.2026',
    )
    await userEvent.click(within(confirm).getByRole('button', { name: 'Reset to the schedule' }))

    await waitFor(() => {
      expect(db.rpc.move_period_boundary).toHaveBeenCalledWith({ p_period_id: 'period-1' })
    })
  })

  it('offers the same reset from the next period’s start, and for the current period’s end', async () => {
    const db = householdDb()
    db.tables.period_summaries = db.tables.period_summaries.map((period) =>
      period.id === 'period-2' ? { ...period, end_is_manual: true } : period,
    )
    const { rows } = await openPeriods(db)

    await userEvent.click(
      within(rows[0]!).getByRole('button', { name: 'Actions for October 2026' }),
    )
    expect(
      await screen.findByRole('menuitem', { name: 'Reset the start to the schedule' }),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Reset the end to the schedule' }))
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'The current period ends again the day before the next salary is due',
    )
  })

  it('shows a refused move as a translated message in the dialog [R-APP-004]', async () => {
    const { db, rows } = await openPeriods()
    db.rpc.move_period_boundary.mockImplementation(() => rpcError('invalid_boundary'))

    await choose(rows[0]!, 'October 2026', 'The October 2026 salary arrived on another day')
    const dialog = await screen.findByRole('dialog')
    await typeDate(dialog, /arrived/, '20.12.2026')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(
      await within(dialog).findByText(/a salary can be at most 14 days from its scheduled date/),
    ).toBeInTheDocument()
  })

  it('accepts a date typed with commas, as a phone keypad offers', async () => {
    const { db, rows } = await openPeriods()

    await choose(rows[0]!, 'October 2026', 'The October 2026 salary arrived on another day')
    const dialog = await screen.findByRole('dialog')
    await typeDate(dialog, /Day the October 2026 salary arrived/, '27,10,2026')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(db.rpc.move_period_boundary).toHaveBeenCalledWith({
        p_period_id: 'period-1',
        p_new_end: '2026-10-26',
      })
    })
  })

  it('in the final month of a budget with an end date, changes the budget’s last day [R-BUDGET-015]', async () => {
    const db = householdDb(undefined, {
      my_budgets: [budgetRow({ end_month: '2026-10-01', end_date: '2026-11-24' })],
    })
    const { rows } = await openPeriods(db)

    await userEvent.click(
      within(rows[0]!).getByRole('button', { name: 'Actions for October 2026' }),
    )
    expect(screen.queryByRole('menuitem', { name: /salary arrived early/ })).not.toBeInTheDocument()
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Change the budget’s last day' }),
    )
    const dialog = await screen.findByRole('dialog')
    await typeDate(dialog, /Last day of the budget/, '30.11.2026')
    expect(within(dialog).getByTestId('boundary-preview')).toHaveTextContent(
      'The budget will end on 30.11.2026.',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.move_period_boundary).toHaveBeenCalledWith({
        p_period_id: 'period-2',
        p_new_end: '2026-11-30',
      })
    })
  })

  it('in an ended budget, says so and marks the final month', async () => {
    const db = householdDb(undefined, {
      my_budgets: [budgetRow({ end_date: '2026-10-22', end_month: '2026-09-01' })],
      period_summaries: [
        periodRow({
          id: 'period-1',
          seq: 1,
          month: '2026-09-01',
          anchor_date: '2026-09-25',
          start_date: '2026-09-25',
          end_date: '2026-10-22',
          is_current: false,
        }),
      ],
    })
    db.rpc.get_current_period.mockImplementation(() => [])
    const { rows } = await openPeriods(db)

    expect(await screen.findByText('This budget has ended')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('Final month')).toBeInTheDocument()
  })
})
