import { calendarMonth } from '@/lib/date'

/** A month a new budget may start tracking from, as the database computes it. */
export interface StartMonthOption {
  /** Any date in the month, sent as create_budget's p_start_month. */
  month: string
  /** The actual first day of the first period (that month's pay date). */
  startDate: string
}

/**
 * The months a budget with these terms may start from, earliest last, or null while the
 * database offers no call for it. The valid months depend on the database's "today" and on
 * the pay date rules, so the client never works them out (C-LOGIC-003, R-PERIOD-017): until
 * that call exists, a new budget starts from the current period (create_budget with
 * p_start_month null). See the report: contract gap, announced for the reworked contract.
 */
export function useStartMonthOptions(): StartMonthOption[] | null {
  // Will take the form's pay day and weekend rule, and query the database with them.
  return null
}

/** "November 2026" for "2026-11-…", read from the string; no time zone involved. */
export function monthLabel(value: string, language: string): string {
  const { year, month } = calendarMonth(value)
  return new Intl.DateTimeFormat(language, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(Date.UTC(year, month - 1, 1))
}
