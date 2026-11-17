import type { HistoryEntry } from '@/features/debts/debt-queries'
import { addMonths, calendarDayNumber, calendarMonth } from '@/lib/date'

/**
 * The debt chart's geometry, from the database's history: grouping and axis ticks only. Every
 * balance is the database's (get_debt_history.balance); nothing here computes money.
 */

export interface ChartPoint {
  /** Day number of the date (days since 1970-01-01): the time axis, no time zone. */
  day: number
  date: string
  /** The balance after the day's last event (the database's). */
  balance: number
  /** Every event of that date, in the database's order; none for the "today" point. */
  events: HistoryEntry[]
}

/**
 * One point per date, the balance after that date's last event; and, when today is later
 * than the last event, a point today with the same balance so the line reaches today.
 */
export function chartPoints(entries: readonly HistoryEntry[], today: string | null): ChartPoint[] {
  const points: ChartPoint[] = []
  for (const entry of entries) {
    const last = points.at(-1)
    if (last?.date === entry.date) {
      last.events.push(entry)
      last.balance = entry.balance
    } else {
      points.push({
        day: calendarDayNumber(entry.date),
        date: entry.date,
        balance: entry.balance,
        events: [entry],
      })
    }
  }
  const last = points.at(-1)
  if (last && today && today > last.date) {
    points.push({ day: calendarDayNumber(today), date: today, balance: last.balance, events: [] })
  }
  return points
}

const STEPS = [1, 2, 2.5, 5, 10]

/**
 * Round ticks for the value axis, in rappen, at most about five: a step of 1, 2, 2.5 or 5
 * times a power of ten, never below one rappen, the range always included (zero too when
 * the balances cross it). `decimals` says whether the labels need the rappen.
 */
export function valueTicks(values: readonly number[]): { ticks: number[]; decimals: boolean } {
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (min === max) {
    // A flat line: a band around it.
    const pad = Math.max(Math.abs(min) / 10, 100)
    min -= pad
    max += pad
  }
  const raw = (max - min) / 4
  const power = 10 ** Math.floor(Math.log10(raw))
  // 2.5 only where it stays a whole number of rappen.
  const factors = power >= 10 ? STEPS : STEPS.filter((factor) => factor !== 2.5)
  const step = Math.max(1, (factors.find((factor) => factor * power >= raw) ?? 10) * power)
  const start = Math.floor(min / step) * step
  const ticks: number[] = []
  for (let tick = start; tick < max + step; tick += step) ticks.push(Math.round(tick))
  return { ticks, decimals: ticks.some((tick) => tick % 100 !== 0) }
}

/**
 * Ticks for the time axis: for spans over three months, the first day of every k-th month
 * (of every k-th year beyond three years), so labels fall on month or year starts; otherwise
 * about five days spread over the span. Day numbers, with the unit the labels should show.
 */
export function timeTicks(
  first: string,
  last: string,
): { ticks: number[]; unit: 'day' | 'month' | 'year' } {
  const from = calendarDayNumber(first)
  const to = calendarDayNumber(last)
  const span = to - from
  if (span <= 92) {
    const step = Math.max(1, Math.ceil(span / 4))
    const ticks: number[] = []
    for (let day = from; day <= to; day += step) ticks.push(day)
    return { ticks, unit: 'day' }
  }
  const { year: y1, month: m1 } = calendarMonth(first)
  const { year: y2, month: m2 } = calendarMonth(last)
  const months = (y2 - y1) * 12 + (m2 - m1)
  const unit = months > 36 ? 'year' : 'month'
  const every =
    unit === 'year'
      ? 12 * Math.max(1, Math.ceil(months / 12 / 5))
      : ([1, 2, 3, 6, 12].find((k) => months / k <= 5) ?? 12)
  const ticks: number[] = []
  // The first month (or January) start after the first date.
  let date = addMonths(first, 1)
  if (unit === 'year') date = `${String(y1 + 1).padStart(4, '0')}-01-01`
  while (calendarDayNumber(date) <= to) {
    ticks.push(calendarDayNumber(date))
    date = addMonths(date, every)
  }
  return { ticks, unit }
}
