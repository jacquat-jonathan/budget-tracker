import { CalendarOffIcon } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'

import { PageHeader } from '@/components/states'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useBudgetEnded } from '@/features/budgets/budget-ended'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'
import { compareHref, type CompareView } from '@/features/compare/compare-format'
import { COUNTS, readCount, type Count } from '@/features/compare/compare-queries'
import { CategoriesView, type UpdateParam } from '@/features/compare/components/categories-view'
import { SideBySideView } from '@/features/compare/components/side-by-side-view'
import { TrendView } from '@/features/compare/components/trend-view'
import { formatCalendarDate } from '@/lib/date'
import { cn } from '@/lib/utils'

const VIEWS = ['trend', 'categories', 'side'] as const

/** The budget and address this page last showed (it is mounted again for each budget). */
let lastShown: { budgetId: string; search: string } | null = null

/** The address's choices that name periods or lines of one budget. */
const BUDGET_CHOICES = ['period', 'a', 'b', 'lines', 'open', 'unknown'] as const

/**
 * Period comparison (F-COMPARE): the trend, the categories over time, two periods side by
 * side. Every figure is the database's (get_period_trend, get_category_trend,
 * get_period_comparison); the page only draws, sorts and picks what to draw. The view and its
 * choices are in the address, so a link opens the same view in the viewer's current budget;
 * switching budget drops the choices that named the other budget's periods and lines (D-404).
 */
// R-COMPARE-190: three views, each with its choices in the address.
export function ComparePage() {
  const { t } = useTranslation()
  const { budgetId, budget } = useCurrentBudget()
  // R-COMPARE-195: an ended budget is said; whether it has ended is the database's answer.
  const ended = useBudgetEnded(budgetId)
  const [params, setParams] = useSearchParams()
  const rawView = params.get('view')
  const view: CompareView = (VIEWS as readonly string[]).includes(rawView ?? '')
    ? (rawView as CompareView)
    : 'trend'
  const count = readCount(params.get('count'))
  // Changes not yet in the address: two clicks before it is read again both count.
  const pending = useRef<URLSearchParams | null>(null)
  useEffect(() => {
    pending.current = null
  }, [params])
  const apply = (change: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(pending.current ?? params)
    change(next)
    pending.current = next
    setParams(next, { replace: true })
  }
  const set = (changes: Record<string, string | null>) =>
    apply((next) => {
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) next.delete(key)
        else next.set(key, value)
      }
    })
  const update: UpdateParam = (key, change) =>
    apply((next) => {
      const value = change(next.get(key))
      if (value === null) next.delete(key)
      else next.set(key, value)
    })
  // Another budget chosen in the sidebar while this page was shown (the page is mounted
  // again for it, on the same address): the choices named the other budget's periods and lines,
  // so they are dropped, and never read against this budget meanwhile.
  const [stale, setStale] = useState(
    () =>
      lastShown !== null &&
      lastShown.budgetId !== budgetId &&
      lastShown.search === params.toString(),
  )
  useEffect(() => {
    lastShown = { budgetId, search: params.toString() }
  })
  useEffect(() => {
    if (!stale) return
    setParams(
      (before) => {
        const next = new URLSearchParams(before)
        for (const key of BUDGET_CHOICES) next.delete(key)
        return next
      },
      { replace: true },
    )
    // The address and the budget it belongs to change together.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStale(false)
  }, [stale, setParams])
  const choice = (key: (typeof BUDGET_CHOICES)[number]) => (stale ? null : params.get(key))
  const linkTo = (target: CompareView) => {
    // The range carries over between the two views that use it.
    const keep: Record<string, string | null> = {
      count: target !== 'side' && count !== 12 ? String(count) : null,
      planned: target !== 'trend' ? params.get('planned') : null,
    }
    return compareHref(target, keep)
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title={t('nav.compare')} description={t('compare.description')} />
      {ended && (
        <Alert data-testid="compare-ended">
          <CalendarOffIcon aria-hidden />
          <AlertTitle>{t('budgetEnded.title')}</AlertTitle>
          <AlertDescription>
            {budget.end_date
              ? t('compare.ended', { date: formatCalendarDate(budget.end_date) })
              : t('compare.endedNoDate')}
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={t('compare.views.label')}>
          <ul className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
            {VIEWS.map((item) => (
              <li key={item}>
                <Link
                  to={linkTo(item)}
                  aria-current={item === view ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-8 items-center rounded-md px-3 text-sm font-medium text-foreground/80 transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                    item === view && 'bg-background text-foreground shadow-sm',
                  )}
                  data-testid={`view-${item}`}
                >
                  {t(`compare.views.${item}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {view !== 'side' && (
          <CountChoice
            value={count}
            onChange={(next) => set({ count: next === 12 ? null : String(next) })}
          />
        )}
      </div>
      {view === 'trend' && (
        <TrendView
          budgetId={budgetId}
          count={count}
          selected={choice('period')}
          onSelect={(id) => set({ period: id })}
        />
      )}
      {view === 'categories' && (
        <CategoriesView
          budgetId={budgetId}
          count={count}
          picked={choice('lines')}
          opened={choice('open')}
          showPlanned={params.get('planned') === '1'}
          update={update}
        />
      )}
      {view === 'side' && (
        <SideBySideView
          budgetId={budgetId}
          a={choice('a')}
          b={choice('b')}
          unknown={choice('unknown') === '1'}
          sort={params.get('sort') === 'change' ? 'change' : 'budget'}
          showPlanned={params.get('planned') === '1'}
          opened={choice('open')}
          onChange={set}
          update={update}
        />
      )}
    </div>
  )
}

/**
 * 6, 12 or 24 periods (more than 24 is not offered, R-COMPARE-171): a radio group, one stop in
 * the tab order (the chosen option), the arrow keys moving the choice.
 */
function CountChoice({ value, onChange }: { value: Count; onChange: (count: Count) => void }) {
  const { t } = useTranslation()
  const group = useRef<HTMLDivElement>(null)
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0
    const edge = event.key === 'Home' ? 0 : event.key === 'End' ? COUNTS.length - 1 : null
    if (step === 0 && edge === null) return
    event.preventDefault()
    const target = edge ?? (index + step + COUNTS.length) % COUNTS.length
    const next = COUNTS[target]
    if (next === undefined) return
    onChange(next)
    group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[target]?.focus()
  }
  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={t('compare.count.label')}
      className="inline-flex flex-wrap gap-1 rounded-lg border p-1"
    >
      {COUNTS.map((count, index) => (
        <button
          key={count}
          type="button"
          role="radio"
          aria-checked={count === value}
          tabIndex={count === value ? 0 : -1}
          onClick={() => onChange(count)}
          onKeyDown={(event) => move(event, index)}
          className={cn(
            'h-7 rounded-md px-2.5 text-sm whitespace-nowrap text-foreground/80 tabular-nums hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
            count === value && 'bg-primary text-primary-foreground hover:text-primary-foreground',
          )}
        >
          {t('compare.count.option', { count })}
        </button>
      ))}
    </div>
  )
}
