import { screen, within } from '@testing-library/react'

import { routes } from '@/app/routes'
import { periodProgress } from '@/features/dashboard/period-progress'
import { renderRoutes } from '@/test/render'
import { budgetRow, householdDb } from '@/test/budget-fixtures'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

afterEach(() => {
  vi.useRealTimers()
})

describe('dashboard', () => {
  it('shows the current period: dates, day N of M, income total and next pay day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-15T12:00:00+01:00'))
    mock.current = createSupabaseMock(fakeSession(), householdDb())
    renderRoutes(routes, '/')

    const card = await screen.findByTestId('current-period-card')
    expect(card).toHaveTextContent('23.10.2026 – 24.11.2026')
    expect(within(card).getAllByText('Day 24 of 33').length).toBeGreaterThan(0)
    expect(within(card).getByText('9 days left')).toBeInTheDocument()
    expect(within(card).getByText("CHF 6'500.00")).toBeInTheDocument()
    expect(await within(card).findByText('25.11.2026')).toBeInTheDocument()
  })

  it('handles a budget that has ended: no current period, a clear message', async () => {
    const db = householdDb(undefined, { my_budgets: [budgetRow({ end_date: '2026-10-22' })] })
    db.tables.period_summaries = db.tables.period_summaries.map((period) => ({
      ...period,
      is_current: false,
    }))
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/')

    const card = await screen.findByTestId('budget-ended-card')
    expect(card).toHaveTextContent('Its last period ended on 22.10.2026.')
    expect(screen.queryByTestId('current-period-card')).not.toBeInTheDocument()
  })
})

describe('period progress [C-DATE-002]', () => {
  const period = { start_date: '2026-03-25', end_date: '2026-04-23' }

  it('counts calendar days without a time zone, across the change to summer time', () => {
    expect(periodProgress(period, '2026-03-25')).toEqual({ day: 1, total: 30, percent: 3 })
    expect(periodProgress(period, '2026-03-30')).toEqual({ day: 6, total: 30, percent: 20 })
    expect(periodProgress(period, '2026-04-23')).toEqual({ day: 30, total: 30, percent: 100 })
  })

  it('stays within the period when the browser’s date is outside it', () => {
    expect(periodProgress(period, '2026-03-20').day).toBe(1)
    expect(periodProgress(period, '2026-05-01').day).toBe(30)
  })
})
