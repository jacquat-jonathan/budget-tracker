import { paths } from '@/app/paths'
import type { CategoryLine, TrendPeriod } from '@/features/compare/compare-queries'
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

/** A difference with its sign always written: "+CHF 12.00", "-CHF 3.50", "CHF 0.00". */
export function signedMoney(rappen: number): string {
  return rappen > 0 ? `+${formatMoney(rappen)}` : formatMoney(rappen)
}

/** Axis labels: whole francs (no currency, the title says CHF), grouped like amounts. */
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

/** The x axis's label of a period id: its start, day and month. */
export function periodTick(periods: TrendPeriod[]) {
  const byId = new Map(periods.map((period) => [period.period_id, period]))
  return (id: string) => {
    const period = byId.get(id)
    return period ? dayMonth(period.start_date) : ''
  }
}
