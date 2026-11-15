/**
 * Date helpers. Calendar dates travel as ISO strings ("2026-01-25", the Postgres `date`
 * format) and are shown as dd.mm.yyyy. ISO date strings are read as calendar dates, never
 * through UTC, so a date never shifts by a day because of the time zone.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/
const SWISS_DATE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0')
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return day <= daysInMonth
}

/** Local calendar date of a Date as an ISO string, e.g. "2026-01-25". */
export function toIsoDate(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Format a date as dd.mm.yyyy. Accepts a Date (local calendar date) or an ISO date or
 * timestamp string (its date part is used as written).
 */
export function formatDate(value: Date | string): string {
  if (typeof value === 'string') {
    const match = ISO_DATE.exec(value)
    if (!match) throw new RangeError(`Not an ISO date: ${value}`)
    const [, year, month, day] = match
    return `${day}.${month}.${year}`
  }
  if (Number.isNaN(value.getTime())) throw new RangeError('Invalid Date')
  return `${pad(value.getDate())}.${pad(value.getMonth() + 1)}.${pad(value.getFullYear(), 4)}`
}

/**
 * Parse a date typed as dd.mm.yyyy (one-digit day and month allowed) into an ISO date
 * string. Returns null when the input is not a real calendar date.
 */
export function parseDate(input: string): string | null {
  const match = SWISS_DATE.exec(input.trim())
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  if (!isValidCalendarDate(year, month, day)) return null
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`
}
