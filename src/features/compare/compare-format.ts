import { paths } from '@/app/paths'
import type { CategoryLine } from '@/features/compare/compare-queries'
import { formatCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'

export type CompareView = 'trend' | 'categories' | 'side'

/** The address of a view, with its choices (the tab and every choice live in the address). */
export function compareHref(view: CompareView, params: Record<string, string | null> = {}) {
  const next = new URLSearchParams()
  if (view !== 'trend') next.set('view', view)
  for (const [key, value] of Object.entries(params)) if (value) next.set(key, value)
  const query = next.toString()
  return query ? `${paths.compare}?${query}` : paths.compare
}

/** "25.10" from a calendar date: a short axis label (the full dates are in the tooltip). */
export function dayMonth(date: string): string {
  return formatCalendarDate(date).slice(0, 5)
}

/** The year of a calendar date, as written ("2026"). */
function yearOf(date: string): string {
  return date.slice(0, 4)
}

/**
 * Short labels for periods in order: day and month, and the year on the first one and on
 * every one whose year differs from the one before (so "25.11" never stands for two years).
 */
// R-COMPARE-280: the year is shown where it changes, on axes and column headers.
export function periodLabels(
  periods: readonly { start_date: string }[],
): { dayMonth: string; year: string | null }[] {
  return periods.map((period, index) => {
    const before = index > 0 ? periods[index - 1] : undefined
    const year = yearOf(period.start_date)
    return {
      dayMonth: dayMonth(period.start_date),
      year: !before || yearOf(before.start_date) !== year ? year : null,
    }
  })
}

/**
 * A difference with its sign before the currency in both directions: "+CHF 12.00",
 * "−CHF 3.50" (a minus sign), "CHF 0.00". Other amounts keep the money formatter's form.
 */
// R-COMPARE-281: a difference's sign stands before the currency, both ways.
export function signedMoney(rappen: number): string {
  if (rappen > 0) return `+${formatMoney(rappen)}`
  if (rappen < 0) return `−${formatMoney(-rappen)}`
  return formatMoney(0)
}

/** What a result is: a surplus, a deficit, or balanced (exactly 0). */
export function resultWord(result: number): 'surplus' | 'deficit' | 'balanced' {
  return result > 0 ? 'surplus' : result < 0 ? 'deficit' : 'balanced'
}

/** Axis labels: whole francs (no currency, the axis says CHF), grouped like amounts. */
export function axisMoney(rappen: number, decimals: boolean): string {
  const text = formatMoney(rappen, { currency: false })
  return decimals ? text : text.replace(/\.00$/, '')
}

/** The palette's five hues, in fixed order: a slot keeps its hue (colour follows the line). */
export const SLOT_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const
export const MAX_LINES = SLOT_COLORS.length

/**
 * Each slot's own mark and dash, so a line is told by its shape and pattern too, never by
 * its colour alone (the legend and the tooltip show the same mark).
 */
export const SLOT_MARKS = ['circle', 'square', 'triangle', 'diamond', 'cross'] as const
export type SlotMark = (typeof SLOT_MARKS)[number]
export const SLOT_DASHES = ['', '6 3', '2 3', '8 3 2 3', '1 2'] as const

/** Lines drawn by default: the top-level ones with the highest average spent. */
const DEFAULT_LINES = 3

/**
 * The chosen lines in their slots, from the address ("a,,c": the second slot empty, so each
 * line keeps its hue); by default the top-level lines with the highest average spent. "-" is
 * an explicit empty choice.
 */
export function readSlots(param: string | null, lines: CategoryLine[]): (string | null)[] {
  if (param === '-') return []
  if (param !== null) {
    const known = new Set(lines.map((line) => line.category_id))
    return param
      .split(',')
      .slice(0, MAX_LINES)
      .map((id) => (id && known.has(id) ? id : null))
  }
  return lines
    .filter(
      (line) => line.parent_id === null && line.average_spent !== null && line.average_spent > 0,
    )
    .sort((x, y) => (y.average_spent ?? 0) - (x.average_spent ?? 0))
    .slice(0, DEFAULT_LINES)
    .map((line) => line.category_id)
}

export function writeSlots(slots: (string | null)[]): string {
  const trimmed = [...slots]
  while (trimmed.length > 0 && trimmed.at(-1) === null) trimmed.pop()
  return trimmed.length === 0 ? '-' : trimmed.map((id) => id ?? '').join(',')
}

/**
 * The lines parameter after ticking or unticking one line, computed from the parameter as it
 * is at that moment (two ticks in quick succession both count). Null: nothing changes (all
 * five slots are taken).
 */
export function toggleSlot(param: string | null, lines: CategoryLine[], id: string) {
  const next = [...readSlots(param, lines)]
  const at = next.indexOf(id)
  if (at >= 0) next[at] = null
  else {
    const free = next.indexOf(null)
    if (free >= 0) next[free] = id
    else if (next.length < MAX_LINES) next.push(id)
    else return null
  }
  return writeSlots(next)
}

/** The groups opened in a table, kept in the address ("open=a,b"). */
export function readOpen(param: string | null): ReadonlySet<string> {
  return new Set((param ?? '').split(',').filter(Boolean))
}

export function toggleOpen(param: string | null, id: string): string | null {
  const next = new Set(readOpen(param))
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next.size === 0 ? null : [...next].join(',')
}

/** Lengths that differ by more than this share are said not to be adjusted (D-296). */
export const LENGTHS_NOTE_RATIO = 1.1

/** The shortest and longest period of a range, when they differ enough to say so. */
export function lengthsToMention(periods: readonly { days: number }[]) {
  if (periods.length === 0) return null
  const days = periods.map((period) => period.days)
  const min = Math.min(...days)
  const max = Math.max(...days)
  return max > min * LENGTHS_NOTE_RATIO ? { min, max } : null
}
