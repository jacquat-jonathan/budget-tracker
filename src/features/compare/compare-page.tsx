import { CalendarOffIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'

import { PageHeader } from '@/components/states'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useCurrentPeriod } from '@/features/budgets/budget-queries'
import { formatCalendarDate } from '@/lib/date'
import { CategoriesView } from '@/features/compare/components/categories-view'
import { SideBySideView } from '@/features/compare/components/side-by-side-view'
import { TrendView } from '@/features/compare/components/trend-view'
import { COUNTS, readCount, type Count } from '@/features/compare/compare-queries'
import { compareHref, type CompareView } from '@/features/compare/compare-format'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'
import { cn } from '@/lib/utils'

const VIEWS = ['trend', 'categories', 'side'] as const

/**
 * Period comparison (F-COMPARE): the trend, the categories over time, two periods side by
 * side. Every figure is the database's (get_period_trend, get_category_trend,
 * get_period_comparison); the page only draws, sorts and picks what to draw. The view and its
 * choices are in the address, so a link opens the same view.
 */
// R-COMPARE-190: three views, each with its choices in the address.
export function ComparePage() {
  const { t } = useTranslation()
  const { budgetId, budget } = useCurrentBudget()
  // R-COMPARE-195: an ended budget is said; whether it has ended is the database's answer.
  const ended = useCurrentPeriod(budgetId).data === null
  const [params, setParams] = useSearchParams()
  const rawView = params.get('view')
  const view: CompareView = (VIEWS as readonly string[]).includes(rawView ?? '')
    ? (rawView as CompareView)
    : 'trend'
  const count = readCount(params.get('count'))
  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key)
      else next.set(key, value)
    }
    setParams(next, { replace: true })
  }
  const linkTo = (target: CompareView) => {
    // The range carries over between the two views that use it.
    const keep: Record<string, string | null> = {
      count: target !== 'side' && count !== 12 ? String(count) : null,
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
                    'inline-flex h-8 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
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
          selected={params.get('period')}
          onSelect={(id) => set({ period: id })}
        />
      )}
      {view === 'categories' && (
        <CategoriesView
          budgetId={budgetId}
          count={count}
          picked={params.get('lines')}
          onPick={(lines) => set({ lines })}
          showPlanned={params.get('planned') === '1'}
          onShowPlanned={(on) => set({ planned: on ? '1' : null })}
        />
      )}
      {view === 'side' && (
        <SideBySideView
          budgetId={budgetId}
          a={params.get('a')}
          b={params.get('b')}
          sort={params.get('sort') === 'change' ? 'change' : 'budget'}
          onChange={set}
        />
      )}
    </div>
  )
}

/** 6, 12 or 24 periods: a radio group (more than 24 is not offered, R-COMPARE-171). */
function CountChoice({ value, onChange }: { value: Count; onChange: (count: Count) => void }) {
  const { t } = useTranslation()
  return (
    <div
      role="radiogroup"
      aria-label={t('compare.count.label')}
      className="inline-flex flex-wrap gap-1 rounded-lg border p-1"
    >
      {COUNTS.map((count) => (
        <button
          key={count}
          type="button"
          role="radio"
          aria-checked={count === value}
          onClick={() => onChange(count)}
          className={cn(
            'h-7 rounded-md px-2.5 text-sm whitespace-nowrap text-muted-foreground tabular-nums hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
            count === value && 'bg-primary text-primary-foreground hover:text-primary-foreground',
          )}
        >
          {t('compare.count.option', { count })}
        </button>
      ))}
    </div>
  )
}
