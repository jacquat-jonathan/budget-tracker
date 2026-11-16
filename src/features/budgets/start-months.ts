import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { unwrap, type WeekendRule } from '@/features/budgets/budget-queries'
import { calendarMonth } from '@/lib/date'
import type { Database } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

/** A month a new budget may start from: `month` (first day), `start_date`, `is_default`. */
export type StartMonthOption =
  Database['public']['Functions']['get_start_months']['Returns'][number]

/**
 * The months a budget with these terms may start from, newest first, each with the date its
 * first period would start (get_start_months). The database decides them, with its own
 * "today" (R-PERIOD-027); the client never works them out.
 */
export function useStartMonths(payDay: number, weekendRule: WeekendRule) {
  return useQuery({
    queryKey: ['start-months', payDay, weekendRule] as const,
    staleTime: 5 * 60_000,
    // Keep the list on screen while the terms change, so the picker does not flicker.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<StartMonthOption[]> =>
      unwrap(
        await supabase.rpc('get_start_months', {
          p_pay_day: payDay,
          p_weekend_rule: weekendRule,
        }),
      ),
  })
}

function formatMonth(value: string, language: string): string {
  const { year, month } = calendarMonth(value)
  // A fixed UTC instant formatted in UTC: no time zone can move it to another month.
  return new Intl.DateTimeFormat(language, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(Date.UTC(year, month - 1, 1))
}

/** "November 2026" / "Novembre 2026" for "2026-11-…", standing on its own (capitalised). */
export function monthLabel(value: string, language: string): string {
  const label = formatMonth(value, language)
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/**
 * The month as it follows "of" in a sentence: "November 2026" in English; in French with
 * its preposition and elision, "de novembre 2026" but "d’octobre 2026", "d’août 2026".
 * French texts that take it write "le salaire {{month}}", not "le salaire de {{month}}".
 */
export function monthOf(value: string, language: string): string {
  if (language !== 'fr') return monthLabel(value, language)
  const label = formatMonth(value, 'fr')
  return /^[aeiouyàâäéèêëîïôöùûü]/i.test(label) ? `d’${label}` : `de ${label}`
}
