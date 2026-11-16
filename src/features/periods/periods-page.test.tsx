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
        p_period_id: 'period-2',
        p_expected_revision: 1,
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
        p_period_id: 'period-2',
        p_expected_revision: 1,
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
        p_period_id: 'period-2',
        p_expected_revision: 1,
        p_pay_date: '2026-11-14',
      })
    })
  })

  it('"this period’s salary has not arrived yet" reopens the previous period and says what moves', async () => {
    const { db, rows } = await openPeriods()

    const dialog = await choose(rows[0]!, CURRENT, 'This period’s salary has not arrived yet')
    expect(await within(dialog).findByTestId('reopen-preview')).toHaveTextContent(
      'Nothing was recorded in this period: only the dates change.',
    )
    const preview = within(dialog).getByTestId('boundary-preview')
    expect(preview).toHaveTextContent(
      'The previous period (from 25.09.2026) is current again until its projected end',
    )
    expect(preview).toHaveTextContent(
      'To undo the dates: use “The salary arrived early” with 23.10.2026.',
    )
    // Without a date: the projection.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(db.rpc.reopen_previous_period).toHaveBeenCalledWith({
        p_budget_id: 'bbbbbbbb-0000-0000-0000-000000000001',
        p_period_id: 'period-2',
        p_expected_revision: 1,
      })
    })
  })

  it('lists what the reopen would move before it is confirmed [R-PERIOD-053]', async () => {
    const { db, rows } = await openPeriods()
    db.rpc.preview_reopen.mockImplementation(() => [
      {
        record_kind: 'income',
        record_id: 'i1',
        record_name: 'Salary',
        change: 'terms_changed',
        replaces_previous: true,
      },
      {
        record_kind: 'income',
        record_id: 'i2',
        record_name: 'Bonus',
        change: 'added',
        replaces_previous: false,
      },
      {
        record_kind: 'income',
        record_id: 'i3',
        record_name: 'Side job',
        change: 'removed',
        replaces_previous: false,
      },
      {
        record_kind: 'income',
        record_id: 'i4',
        record_name: 'Part-time',
        change: 'made_primary',
        replaces_previous: false,
      },
      // Kinds and changes added by later steps are still shown.
      {
        record_kind: 'category',
        record_id: 'c1',
        record_name: 'Groceries',
        change: 'renamed',
        replaces_previous: true,
      },
    ])

    const dialog = await choose(rows[0]!, CURRENT, 'This period’s salary has not arrived yet')
    const preview = await within(dialog).findByTestId('reopen-preview')
    expect(preview).toHaveTextContent(
      'Income “Salary”: its new terms will apply to the reopened period. It replaces what the reopened period had for it.',
    )
    expect(preview).toHaveTextContent(
      'Income “Bonus”: added in this period, it will count from the reopened period.',
    )
    expect(preview).toHaveTextContent(
      'Income “Side job”: it will disappear: it would never be in force.',
    )
    expect(preview).toHaveTextContent(
      'Income “Part-time”: it becomes the primary income from the reopened period.',
    )
    expect(preview).toHaveTextContent('“Groceries”: this change will move to the reopened period.')
    expect(preview).toHaveTextContent('restores the dates only, not these changes')
    expect(db.rpc.preview_reopen).toHaveBeenCalledWith({
      p_budget_id: 'bbbbbbbb-0000-0000-0000-000000000001',
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
        p_period_id: 'period-2',
        p_expected_revision: 1,
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
        p_expected_revision: 1,
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
    await typeDate(dialog, /Day the salary arrived/, '14.11.2026')
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

  it('a reopen cannot be confirmed without its list; the list can be retried [R-PERIOD-053]', async () => {
    const { db, rows } = await openPeriods()
    db.rpc.preview_reopen.mockImplementation(() => rpcError('budget_not_found_x'))

    const dialog = await choose(rows[0]!, CURRENT, 'This period’s salary has not arrived yet')
    const failed = await within(dialog).findByTestId('reopen-preview-failed')
    expect(failed).toHaveTextContent('Could not list what this period holds')
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()

    db.rpc.preview_reopen.mockImplementation(() => [])
    await userEvent.click(within(failed).getByRole('button', { name: 'Try again' }))
    expect(await within(dialog).findByTestId('reopen-preview')).toHaveTextContent(
      'Nothing was recorded in this period',
    )
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('does not offer "arrived early" when the budget’s end date leaves no room, and says why [R-PERIOD-054]', async () => {
    // End date 31.03.2027, today 20.04.2027, last period 25.03 – 24.04.
    const db = householdDb(undefined, {
      my_budgets: [budgetRow({ end_date_entered: '2027-03-31', end_date: '2027-04-24' })],
      period_summaries: [
        periodRow({
          id: 'period-1',
          seq: 1,
          start_date: '2027-02-25',
          end_date: '2027-03-24',
          is_current: false,
          today: '2027-04-20',
        }),
        periodRow({ start_date: '2027-03-25', end_date: '2027-04-24', today: '2027-04-20' }),
      ],
    })
    const { rows } = await openPeriods(db)

    await userEvent.click(
      within(rows[0]!).getByRole('button', {
        name: 'Actions for the period 25.03.2027 – 24.04.2027',
      }),
    )
    expect(
      await screen.findByRole('menuitem', { name: 'The salary arrived early' }),
    ).toHaveAttribute('aria-disabled', 'true')
    expect(
      screen.getByText(
        'Not available: the budget’s end date (31.03.2027) leaves no day on which a new period could start.',
      ),
    ).toBeInTheDocument()
  })

  it('"arrived early" refuses a date outside what can be saved before calling the database [R-PERIOD-054]', async () => {
    const { db, rows } = await openPeriods()

    const dialog = await choose(rows[0]!, CURRENT, 'The salary arrived early')
    expect(within(dialog).getByText('From 30.10.2026 to 15.11.2026.')).toBeInTheDocument()
    await typeDate(dialog, /Day the salary arrived/, '25.10.2026')
    expect(within(dialog).getByTestId('boundary-outside')).toHaveTextContent(
      'choose a day from 30.10.2026 to 15.11.2026',
    )
    expect(within(dialog).queryByTestId('boundary-preview')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(db.rpc.record_early_pay_date).not.toHaveBeenCalled()
  })

  it('a period action raced by someone else is refused, closed and explained, never retried [R-PERIOD-055] [R-CONCURRENCY-100]', async () => {
    const { db, rows } = await openPeriods()
    db.rpc.reopen_previous_period.mockImplementation(() => rpcError('record_changed'))

    const dialog = await choose(rows[0]!, CURRENT, 'This period’s salary has not arrived yet')
    await within(dialog).findByTestId('reopen-preview')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await screen.findByTestId('periods-changed')).toHaveTextContent(
      'The periods changed while you had this open',
    )
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(db.rpc.reopen_previous_period).toHaveBeenCalledTimes(1)
    expect(db.rpc.reopen_previous_period).toHaveBeenCalledWith({
      p_budget_id: 'bbbbbbbb-0000-0000-0000-000000000001',
      p_period_id: 'period-2',
      p_expected_revision: 1,
    })
  })

  it('moves a start set by hand back to the schedule, which clears the mark [R-PERIOD-055] [R-PERIOD-100]', async () => {
    const { db, rows } = await openPeriods()
    const dialog = await choose(rows[0]!, CURRENT, 'Move this period’s start back to the schedule')
    expect(within(dialog).getByTestId('boundary-preview')).toHaveTextContent(
      'its “set by hand” mark is cleared',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move back' }))
    await waitFor(() => {
      expect(db.rpc.move_period_start).toHaveBeenCalledWith({
        p_period_id: 'period-2',
        p_expected_revision: 1,
      })
    })
  })
})
