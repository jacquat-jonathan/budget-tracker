import { useSearchParams } from 'react-router'

import { usePeriodById, type PeriodSummary } from '@/features/budgets/budget-queries'
import { isUuid } from '@/lib/uuid'

/**
 * The period a page shows, named in the address (`?period=<id>`), so a link opens it and the
 * back button returns: the current period (the latest once the budget has ended) when none is
 * named, or when the named one is not a period of this budget (`unknown` says so). An id from
 * the address is checked to be a uuid before any request (R-PERIOD-281).
 */
export function usePeriodParam(
  budgetId: string,
  periods: readonly PeriodSummary[] | undefined,
  current: PeriodSummary | null | undefined,
) {
  const [params, setParams] = useSearchParams()
  const named = params.get('period')
  const loaded = periods?.find((item) => item.id === named)
  const id = named !== null && isUuid(named) ? named : null
  const byId = usePeriodById(budgetId, loaded ? null : id, periods)
  const fallback = current ?? periods?.[0] ?? null
  const period =
    named === null
      ? fallback
      : loaded
        ? loaded
        : id === null
          ? fallback
          : byId === undefined
            ? undefined
            : (byId ?? fallback)
  return {
    /** undefined while a named period is being read. */
    period,
    /** A period was named that this budget does not have: the page says so. */
    unknown: named !== null && !loaded && (id === null || byId === null),
    setPeriod: (next: string) => {
      setParams(
        (before) => {
          const after = new URLSearchParams(before)
          if (current && next === current.id) after.delete('period')
          else after.set('period', next)
          return after
        },
        { replace: true },
      )
    },
  }
}
