/**
 * Date helpers. Displayed as dd.mm.yyyy. Two kinds of value, with one formatter each, so
 * they cannot be mixed up at the call site:
 *
 * - Calendar dates, "YYYY-MM-DD" (Postgres `date`, periods, pay dates): a day, not an
 *   instant. `formatCalendarDate` prints it as written, with no time-zone conversion.
 * - Instants (Postgres `timestamptz`, e.g. created_at, or a Date): `formatTimestamp` prints
 *   the user's local calendar date of that instant.
 *
 * Each formatter rejects the other kind and any invalid input with a RangeError, rather than
 * printing a plausible-looking wrong date.
 */

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
// A timestamp needs a time part and an explicit zone (Z or ±hh:mm), as Postgres timestamptz
// and Date.toISOString() produce; without a zone, browsers disagree on how to read it.
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)$/i
const SWISS_DATE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0')
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return day <= daysInMonth
}

function formatLocal(date: Date): string {
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${pad(date.getFullYear(), 4)}`
}

/** True for a real calendar date written "YYYY-MM-DD". */
export function isCalendarDate(value: string): boolean {
  const match = CALENDAR_DATE.exec(value)
  return match !== null && isValidCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))
}

/**
 * Format a calendar date "YYYY-MM-DD" as dd.mm.yyyy, exactly as written: no time-zone shift.
 * Throws a RangeError for anything else, including timestamps.
 */
export function formatCalendarDate(value: string): string {
  const match = CALENDAR_DATE.exec(value)
  if (!match || !isCalendarDate(value)) {
    throw new RangeError(`Not a calendar date (YYYY-MM-DD): ${value}`)
  }
  const [, year, month, day] = match
  return `${day ?? ''}.${month ?? ''}.${year ?? ''}`
}

/**
 * Format an instant as the user's local calendar date, dd.mm.yyyy. Accepts a Date or an ISO
 * timestamp with a time and a zone ("2026-03-01T23:30:00+00:00"). Throws a RangeError for
 * invalid input and for a bare "YYYY-MM-DD" (use formatCalendarDate for those).
 */
export function formatTimestamp(value: Date | string): string {
  let date: Date
  if (typeof value === 'string') {
    if (!TIMESTAMP.test(value)) {
      throw new RangeError(`Not a timestamp with time and zone: ${value}`)
    }
    // Reject impossible dates that Date would otherwise roll over (2026-02-30 -> 02.03).
    const [year, month, day] = value.slice(0, 10).split('-').map(Number)
    if (!isValidCalendarDate(year ?? 0, month ?? 0, day ?? 0)) {
      throw new RangeError(`Invalid date: ${value}`)
    }
    date = new Date(value)
  } else {
    date = value
  }
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date: ${String(value)}`)
  return formatLocal(date)
}

/** The local calendar date of a Date as "YYYY-MM-DD", e.g. today's date for a new record. */
export function toCalendarDate(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new RangeError('Invalid Date')
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Parse a date typed as dd.mm.yyyy (one-digit day and month allowed) into a calendar date
 * "YYYY-MM-DD". Returns null when the input is not a real calendar date.
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

function calendarParts(value: string): [number, number, number] {
  const match = CALENDAR_DATE.exec(value)
  if (!match || !isCalendarDate(value)) {
    throw new RangeError(`Not a calendar date (YYYY-MM-DD): ${value}`)
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/** Day number of a calendar date on a time-zone-free axis (days since 1970-01-01). */
function dayNumber(value: string): number {
  const [year, month, day] = calendarParts(value)
  return Date.UTC(year, month - 1, day) / 86_400_000
}

/**
 * Calendar date arithmetic, with no time zone involved: "2026-03-28" + 2 -> "2026-03-30",
 * also across a change to summer time.
 */
export function addDays(value: string, days: number): string {
  if (!Number.isSafeInteger(days)) throw new RangeError(`Not a whole number of days: ${days}`)
  const date = new Date((dayNumber(value) + days) * 86_400_000)
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** Days from `start` to `end`, counting both: the same day is 1, the next day is 2. */
export function daysInclusive(start: string, end: string): number {
  return dayNumber(end) - dayNumber(start) + 1
}

/** Year and month (1-12) of a calendar date, read from the string. */
export function calendarMonth(value: string): { year: number; month: number } {
  const [year, month] = calendarParts(value)
  return { year, month }
}

/** The first day of the month `months` after the month of `value` ("2026-12-15", 1 -> "2027-01-01"). */
export function addMonths(value: string, months: number): string {
  const { year, month } = calendarMonth(value)
  const index = year * 12 + (month - 1) + months
  return `${pad(Math.floor(index / 12), 4)}-${pad((index % 12) + 1)}-01`
}
