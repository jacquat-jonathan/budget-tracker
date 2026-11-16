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
 * The household fixture: 25.09 – 22.10 (end set by hand) and 23.10 – 24.11 (current);
 * the database's today is 15.11.2026.
 */
async function openPeriods(db = householdDb()) {
  mock.current = createSupabaseMock(fakeSession(), db)
  renderRoutes(routes, '/periods')
  const rows = await screen.findAllByTestId('period-row')
  return { db, rows }
}

const CURRENT = 'the period 23.10.2026 – 24.11.2026'
const PREVIOUS = 'the period 25.09.2026 – 22.10.2026'

async function choose(row: HTMLElement, range: string, action: string) {
  await userEvent.click(within(row).getByRole('button', { name: `Actions for ${range}` }))
  await userEvent.click(await screen.findByRole('menuitem', { name: action }))
  return screen.findByRole('dialog')
}

async function typeDate(dialog: HTMLElement, label: RegExp, value: string) {
  const field = within(dialog).getByLabelText(label)
  await userEvent.clear(field)
  await userEvent.type(field, value)
}

describe('periods page [R-PERIOD-051]', () => {
  it('lists the periods newest first, by their dates, with total and what was set by hand', async () => {
    const { rows } = await openPeriods()

    expect(rows).toHaveLength(2)
    const [current, previous] = rows as [HTMLElement, HTMLElement]
    expect(
      within(current).getByRole('heading', { name: '23.10.2026 – 24.11.2026' }),
    ).toBeInTheDocument()
    expect(within(current).getByText('Current')).toBeInTheDocument()
    expect(within(current).getByText('Start set by hand')).toBeInTheDocument()
    expect(current).toHaveTextContent('Next salary expected on 25.11.2026 (projected).')
    expect(current).toHaveTextContent("CHF 6'500.00")
    expect(within(previous).getByText('End set by hand')).toBeInTheDocument()
    expect(screen.queryByText(/October|September/)).not.toBeInTheDocument()
  })

  it('"the next salary is expected on …" sets the expected date, with a preview and the undo', async () => {
    const { db, rows } = await openPeriods()

    const dialog = await choose(rows[0]!, CURRENT, 'The next salary is expected on another day')
    expect(within(dialog).getByText('After today (15.11.2026).')).toBeInTheDocument()
    await typeDate(dialog, /Next salary expected on/, '27.11.2026')
    const preview = within(dialog).getByTestId('boundary-preview')
    expect(preview).toHaveTextContent(
      'This period will end on 26.11.2026; the next one starts when the salary arrives on 27.11.2026.',
    )
    expect(preview).toHaveTextContent('To undo: set another date, or reset it to the projection.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(db.rpc.set_expected_pay_date).toHaveBeenCalledWith({
        p_budget_id: 'bbbbbbbb-0000-0000-0000-000000000001',
        p_pay_date: '2026-11-27',
      })
    })
  })

  it('resets an expected date set by hand, by omitting the date [R-PERIOD-033]', async () => {
    const db = householdDb()
    db.tables.period_summaries = db.tables.period_summaries.map((period) =>
      period.is_current ? { ...period, end_is_manual: true } : period,
    )
    const { rows } = await openPeriods(db)

    expect(rows[0]).toHaveTextContent('Next salary expected on 25.11.2026 (set by hand).')
    const dialog = await choose(rows[0]!, CURRENT, 'Reset the expected date to the projection')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reset' }))

    await waitFor(() => {
      expect(db.rpc.set_expected_pay_date).toHaveBeenCalledWith({
        p_budget_id: 'bbbbbbbb-0000-0000-0000-000000000001',
      })
    })
  })

  it('"the salary arrived early" closes the current period on the day before', async () => {
    const { db, rows } = await openPeriods()

    const dialog = await choose(rows[0]!, CURRENT, 'The salary arrived early')
    expect(within(dialog).getByLabelText('Day the salary arrived')).toHaveValue('15.11.2026')
    await typeDate(dialog, /Day the salary arrived/, '14.11.2026')
    expect(within(dialog).getByTestId('boundary-preview')).toHaveTextContent(
      'This period will end on 13.11.2026, and a new period starts on 14.11.2026.',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(db.rpc.record_early_pay_date).toHaveBeenCalledWith({
        p_budget_id: 'bbbbbbbb-0000-0000-0000-000000000001',
        p_pay_date: '2026-11-14',
      })
    })
  })

  it('"this period’s salary has not arrived yet" reopens the previous period and says what moves', async () => {
    const { db, rows } = await openPeriods()

    const dialog = await choose(rows[0]!, CURRENT, 'This period’s salary has not arrived yet')
    expect(dialog).toHaveTextContent(
      'What was recorded in this period (income changes, incomes added or ended, a primary switch) moves to the reopened period.',
    )
    const preview = within(dialog).getByTestId('boundary-preview')
    expect(preview).toHaveTextContent(
      'The previous period (from 25.09.2026) is current again until its projected end',
    )
    expect(preview).toHaveTextContent('To undo: use “The salary arrived early” with 23.10.2026.')
    // Without a date: the projection.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.reopen_previous_period).toHaveBeenCalledWith({
        p_budget_id: 'bbbbbbbb-0000-0000-0000-000000000001',
      })
    })
  })

  it('reopens with an expected date when one is given', async () => {
    const { db, rows } = await openPeriods()

    const dialog = await choose(rows[0]!, CURRENT, 'This period’s salary has not arrived yet')
    await typeDate(dialog, /Salary now expected on/, '20.11.2026')
    expect(within(dialog).getByTestId('boundary-preview')).toHaveTextContent(
      'The previous period (from 25.09.2026) is current again and will end on 19.11.2026',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.reopen_previous_period).toHaveBeenCalledWith({
        p_budget_id: 'bbbbbbbb-0000-0000-0000-000000000001',
        p_pay_date: '2026-11-20',
      })
    })
  })

  it('"this period’s salary actually arrived on …" moves the period’s start', async () => {
    const { db, rows } = await openPeriods()

    const dialog = await choose(
      rows[0]!,
      CURRENT,
      'This period’s salary actually arrived on another day',
    )
    await typeDate(dialog, /Day the salary arrived/, '27,10,2026')
    const preview = within(dialog).getByTestId('boundary-preview')
    expect(preview).toHaveTextContent(
      'The previous period will end on 26.10.2026, and this one starts on 27.10.2026.',
    )
    expect(preview).toHaveTextContent('To undo: move it back to 23.10.2026.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(db.rpc.move_period_start).toHaveBeenCalledWith({
        p_period_id: 'period-2',
        p_start_date: '2026-10-27',
      })
    })
  })

  it('a past period with no period before it has no actions', async () => {
    const { rows } = await openPeriods()
    expect(
      within(rows[1]!).queryByRole('button', { name: `Actions for ${PREVIOUS}` }),
    ).not.toBeInTheDocument()
  })

  it('explains the 7-to-92-day rule when a date is refused [R-APP-004]', async () => {
    const { db, rows } = await openPeriods()
    db.rpc.record_early_pay_date.mockImplementation(() => rpcError('invalid_boundary'))

    const dialog = await choose(rows[0]!, CURRENT, 'The salary arrived early')
    await typeDate(dialog, /Day the salary arrived/, '25.10.2026')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(
      await within(dialog).findByText(/every period must be 7 to 92 days long/),
    ).toBeInTheDocument()
  })

  it('in an ended budget, says so and marks the last period', async () => {
    const db = householdDb(undefined, {
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
    const { rows } = await openPeriods(db)

    expect(await screen.findByText('This budget has ended')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('Last period')).toBeInTheDocument()
  })
})
