import { chartPoints, timeTicks, valueTicks } from '@/features/debts/debt-chart-data'
import type { HistoryEntry } from '@/features/debts/debt-queries'
import { calendarDayNumber, fromCalendarDayNumber } from '@/lib/date'

function entry(kind: HistoryEntry['kind'], date: string, amount: number, balance: number) {
  return {
    entry_id: `${kind}-${date}-${balance}`,
    kind,
    date,
    amount,
    balance,
    period_id: 'p',
    description: null,
    created_at: `${date}T10:00:00+00:00`,
  }
}

describe('debt chart geometry [R-DEBT-122]', () => {
  it('draws one point per date, the balance after its last event, with every event of it', () => {
    const points = chartPoints(
      [
        entry('opened', '2026-10-23', 100_000, 100_000),
        entry('payment', '2026-10-23', -10_000, 90_000),
        entry('interest', '2026-11-25', 500, 90_500),
        entry('adjustment', '2026-11-25', -500, 90_000),
        entry('payment', '2026-11-25', -20_000, 70_000),
      ],
      null,
    )
    expect(points.map((point) => [point.date, point.balance, point.events.length])).toEqual([
      ['2026-10-23', 90_000, 2],
      ['2026-11-25', 70_000, 3],
    ])
    // The tooltip lists each event with its own resulting balance, in the database's order.
    expect(points[1]?.events.map((event) => [event.kind, event.amount, event.balance])).toEqual([
      ['interest', 500, 90_500],
      ['adjustment', -500, 90_000],
      ['payment', -20_000, 70_000],
    ])
  })

  it('draws the line on to today with the last balance', () => {
    const points = chartPoints([entry('opened', '2026-10-23', 100_000, 100_000)], '2027-01-10')
    expect(points.at(-1)).toMatchObject({ date: '2027-01-10', balance: 100_000, events: [] })
    expect(chartPoints([entry('opened', '2026-10-23', 1, 1)], '2026-10-23')).toHaveLength(1)
  })

  it('labels the value axis with round, distinct ticks for any range', () => {
    // A CHF 0.50 debt: rappen are needed, no repeated label.
    const small = valueTicks([50, 25, 0])
    expect(small.decimals).toBe(true)
    expect(new Set(small.ticks).size).toBe(small.ticks.length)
    expect(small.ticks[0]).toBeLessThanOrEqual(0)
    expect(small.ticks.at(-1)).toBeGreaterThanOrEqual(50)
    // Millions: whole francs, a few ticks.
    const big = valueTicks([123_456_789, 98_000_000])
    expect(big.decimals).toBe(false)
    expect(big.ticks.length).toBeLessThanOrEqual(7)
    expect(big.ticks.every((tick) => tick % 100 === 0)).toBe(true)
    // An overpaid debt: the range crosses zero, and zero is a tick.
    const negative = valueTicks([20_000, -10_000])
    expect(negative.ticks).toContain(0)
    expect(negative.ticks[0]).toBeLessThan(0)
    // A flat line still gets a band.
    expect(valueTicks([5_000, 5_000]).ticks.length).toBeGreaterThan(1)
  })

  it('puts the time ticks on month or year starts for long spans', () => {
    const months = timeTicks('2026-10-23', '2027-09-30')
    expect(months.unit).toBe('month')
    expect(months.ticks.map((day) => fromCalendarDayNumber(day).slice(8))).toEqual(
      months.ticks.map(() => '01'),
    )
    expect(months.ticks.length).toBeLessThanOrEqual(6)
    const years = timeTicks('2016-10-23', '2026-10-23')
    expect(years.unit).toBe('year')
    expect(years.ticks.map((day) => fromCalendarDayNumber(day).slice(5))).toEqual(
      years.ticks.map(() => '01-01'),
    )
    expect(years.ticks.length).toBeLessThanOrEqual(6)
    const days = timeTicks('2026-11-01', '2026-11-20')
    expect(days.unit).toBe('day')
    expect(days.ticks[0]).toBe(calendarDayNumber('2026-11-01'))
  })
})
