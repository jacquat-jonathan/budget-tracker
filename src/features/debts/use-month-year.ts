import { useTranslation } from 'react-i18next'

import { calendarMonth } from '@/lib/date'

/** "January 2028" in the UI language, read from the calendar date's own digits (no time zone). */
export function useMonthYear() {
  const { i18n } = useTranslation()
  return (date: string) => {
    const { year, month } = calendarMonth(date)
    return new Intl.DateTimeFormat(i18n.language, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, 1)))
  }
}
