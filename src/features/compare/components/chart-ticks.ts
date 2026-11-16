import { createContext } from 'react'

/** The width each period gets in the chart now (set by ChartFrame once it is measured). */
export const BandContext = createContext<number | null>(null)

/** A day-and-month label needs about this much room, a year below it included. */
const LABEL_PX = 38

/**
 * Which period labels are written, oldest first: every year change always (a year must never
 * be missing), and the others from the newest backwards, as many as fit without touching a
 * label already written.
 */
export function tickIndexes(years: readonly boolean[], band: number | null): ReadonlySet<number> {
  const step = band && band > 0 ? Math.max(1, Math.ceil(LABEL_PX / band)) : 1
  const shown = new Set<number>()
  years.forEach((year, index) => {
    if (year) shown.add(index)
  })
  const clear = (index: number) => [...shown].every((other) => Math.abs(other - index) >= step)
  // A year label may crowd a neighbour out; the year stays.
  for (let index = years.length - 1; index >= 0; index -= 1) {
    if (!shown.has(index) && clear(index)) shown.add(index)
  }
  return shown
}
