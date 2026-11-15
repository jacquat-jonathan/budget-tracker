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

async function openPeriods(db = householdDb()) {
  mock.current = createSupabaseMock(fakeSession(), db)
  renderRoutes(routes, '/periods')
  const rows = await screen.findAllByTestId('period-row')
  return { db, rows }
}

describe('periods page', () => {
  it('lists the periods newest first, with dates, total, the current one and manual ends', async () => {
    const { rows } = await openPeriods()

    expect(rows).toHaveLength(2)
    const [current, past] = rows as [HTMLElement, HTMLElement]
    expect(current).toHaveTextContent('23.10.2026 – 24.11.2026')
    expect(within(current).getByText('Current')).toBeInTheDocument()
    expect(current).toHaveTextContent("CHF 6'500.00")
    expect(past).toHaveTextContent('25.09.2026 – 22.10.2026')
    expect(within(past).getByText('End set by hand')).toBeInTheDocument()
    expect(within(past).queryByText('Current')).not.toBeInTheDocument()
  })

  it('moves a boundary to a date typed as dd.mm.yyyy, unchanged by time zones', async () => {
    const { db, rows } = await openPeriods()

    await userEvent.click(
      within(rows[1]!).getByRole('button', { name: 'Actions for the period starting 25.09.2026' }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Move the end date' }))
    const dialog = await screen.findByRole('dialog')
    const field = within(dialog).getByLabelText('Last day of the period')
    expect(field).toHaveValue('22.10.2026')
    await userEvent.clear(field)
    await userEvent.type(field, '26.10.2026')
    expect(within(dialog).getByText('The next period starts on 27.10.2026.')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(db.rpc.move_period_boundary).toHaveBeenCalledWith({
        p_period_id: 'period-1',
        p_new_end: '2026-10-26',
      })
    })
  })

  it('shows a refused boundary as a translated message in the dialog [R-APP-004]', async () => {
    const { db, rows } = await openPeriods()
    db.rpc.move_period_boundary.mockImplementation(() => rpcError('invalid_boundary'))

    await userEvent.click(within(rows[0]!).getByRole('button', { name: /Actions for the period/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Change the projected end' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(
      await within(dialog).findByText(/a period cannot be empty, longer than 70 days/),
    ).toBeInTheDocument()
  })

  it('resets a manual end of the current period to the projection', async () => {
    const db = householdDb()
    db.tables.period_summaries = [periodRow({ end_is_manual: true })]
    const { rows } = await openPeriods(db)

    expect(within(rows[0]!).getByText('End set by hand')).toBeInTheDocument()
    await userEvent.click(within(rows[0]!).getByRole('button', { name: /Actions for the period/ }))
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Reset to the projected end' }),
    )
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Reset to the projected end',
      }),
    )

    await waitFor(() => {
      expect(db.rpc.move_period_boundary).toHaveBeenCalledWith({
        p_period_id: 'period-2',
        p_new_end: null,
      })
    })
  })

  it('in an ended budget, says so and leaves the budget’s end to the settings', async () => {
    const db = householdDb(undefined, {
      my_budgets: [budgetRow({ end_date: '2026-10-22' })],
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
    const { rows } = await openPeriods(db)

    expect(screen.getByText('This budget has ended')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('Budget end')).toBeInTheDocument()
    await userEvent.click(within(rows[0]!).getByRole('button', { name: /Actions for the period/ }))
    expect(await screen.findByRole('menuitem', { name: 'Move the end date' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })
})
