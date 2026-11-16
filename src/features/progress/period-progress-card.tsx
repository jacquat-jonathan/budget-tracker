import { useQuery } from '@tanstack/react-query'
import { ChevronLeftIcon, ChevronRightIcon, PieChartIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'

import { paths } from '@/app/paths'
import { MoneyStat } from '@/components/money-stat'
import { signTone } from '@/lib/money-tone'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { budgetKeys } from '@/features/budgets/budget-keys'
import { unwrap, usePeriods, type PeriodSummary } from '@/features/budgets/budget-queries'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'
import type { Database } from '@/lib/database.types'
import { formatCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type ProgressRow = Database['public']['Functions']['get_period_progress']['Returns'][number]

/** R-PROGRESS-090: one period's progress, current or past, from get_period_progress. */
function usePeriodProgress(budgetId: string, periodId: string | undefined) {
  return useQuery({
    queryKey: budgetKeys.progress(budgetId, periodId ?? ''),
    enabled: periodId !== undefined,
    queryFn: async (): Promise<ProgressRow[]> =>
      unwrap(await supabase.rpc('get_period_progress', { p_period_id: periodId ?? '' })),
  })
}

/**
 * How a period is going, or went: per category and subcategory what was expected, what was
 * spent and the result, overspending at a glance, and the period's totals and result
 * (surplus or deficit). Any period can be browsed; the current one by default (its id in the
 * address, `?period=`). Every figure is the database's (R-PROGRESS-092): nothing is added up
 * here.
 */
// R-PROGRESS-050 R-COMPARE-001: any period's progress, browsed in place.
export function PeriodProgressCard({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { budgetId } = useCurrentBudget()
  const periods = usePeriods(budgetId)
  const [params, setParams] = useSearchParams()
  const list = periods.data
  const requested = params.get('period')
  // Newest first; the current period (or the last one, once the budget has ended) by default.
  const fallback = list?.find((item) => item.is_current === true) ?? list?.[0]
  const period = list?.find((item) => item.id === requested) ?? fallback
  const index = period && list ? list.indexOf(period) : -1
  const older = index >= 0 ? list?.[index + 1] : undefined
  const newer = index > 0 ? list?.[index - 1] : undefined
  const progress = usePeriodProgress(budgetId, period?.id)
  const go = (target: PeriodSummary) => {
    const next = new URLSearchParams(params)
    if (target.id === fallback?.id) next.delete('period')
    else next.set('period', target.id)
    setParams(next, { replace: true })
  }
  const range = (item: PeriodSummary) =>
    `${formatCalendarDate(item.start_date)} – ${formatCalendarDate(item.end_date)}`

  return (
    <Card className={className} data-testid="period-progress">
      <CardHeader className="flex flex-col gap-3 @lg/card-header:flex-row @lg/card-header:items-center @lg/card-header:justify-between">
        <CardTitle className="flex items-center gap-2">
          <PieChartIcon className="size-4 text-muted-foreground" aria-hidden />
          <h2>{t('progress.title')}</h2>
        </CardTitle>
        {period && (
          <nav
            className="flex items-center gap-1 self-start @lg/card-header:self-auto"
            aria-label={t('progress.browse')}
          >
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!older}
              onClick={() => older && go(older)}
              aria-label={t('progress.older')}
            >
              <ChevronLeftIcon />
            </Button>
            <span
              className="min-w-0 px-2 text-center text-sm font-medium tabular-nums"
              data-testid="progress-period"
              aria-live="polite"
            >
              {range(period)}
              {period.is_current === true && (
                <Badge className="ml-2 align-middle">{t('periods.current')}</Badge>
              )}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!newer}
              onClick={() => newer && go(newer)}
              aria-label={t('progress.newer')}
            >
              <ChevronRightIcon />
            </Button>
          </nav>
        )}
      </CardHeader>
      <CardContent className="@container/progress flex flex-col gap-6">
        {periods.isError ? (
          <ErrorState error={periods.error} onRetry={periods.refetch} />
        ) : !period ? (
          <LoadingState rows={3} />
        ) : (
          <>
            <Totals period={period} />
            {progress.isError ? (
              <ErrorState error={progress.error} onRetry={() => void progress.refetch()} />
            ) : !progress.data ? (
              <LoadingState rows={4} />
            ) : progress.data.length === 0 ? (
              <EmptyState
                title={t('progress.empty')}
                description={t('progress.emptyHelp')}
                action={
                  <Button asChild variant="outline" size="sm">
                    <Link to={paths.budget}>{t('progress.toBudget')}</Link>
                  </Button>
                }
              />
            ) : (
              <ProgressTable rows={progress.data} period={period} />
            )}
            {period.is_current !== true && fallback && (
              <Button variant="link" className="self-start px-0" onClick={() => go(fallback)}>
                {t('progress.backToCurrent')}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** The period's figures, as the database adds them up. R-PROGRESS-002: a surplus or a deficit. */
function Totals({ period }: { period: PeriodSummary }) {
  const { t } = useTranslation()
  const result = period.result ?? 0
  const left = period.left_to_assign ?? 0
  return (
    <dl
      className="grid grid-cols-2 gap-x-4 gap-y-5 @xl/progress:grid-cols-4"
      data-testid="progress-totals"
    >
      <MoneyStat label={t('progress.income')} amount={period.income_total ?? 0} />
      <MoneyStat
        label={t('progress.expected')}
        amount={period.expected_total ?? 0}
        hint={
          left < 0
            ? t('progress.overAssigned', { amount: formatMoney(-left) })
            : t('progress.leftToAssign', { amount: formatMoney(left) })
        }
      />
      <MoneyStat label={t('progress.spent')} amount={period.spent_total ?? 0} />
      <MoneyStat
        label={result < 0 ? t('progress.deficit') : t('progress.surplus')}
        amount={result}
        tone={signTone(result)}
        testId="progress-result"
      />
    </dl>
  )
}

/**
 * Each category and subcategory: planned, spent, left. A table for assistive technology
 * (every figure has its column header); on a narrow card the planned and spent figures go
 * into one line under the bar, and "Left" is labelled beside its figure.
 */
function ProgressTable({ rows, period }: { rows: ProgressRow[]; period: PeriodSummary }) {
  const { t } = useTranslation()
  return (
    <div role="table" aria-label={t('progress.listLabel')} className="flex flex-col">
      <div role="rowgroup">
        <div
          role="row"
          className="sr-only grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_7.5rem] gap-3 border-b pb-2 text-xs font-medium text-muted-foreground @2xl/progress:not-sr-only @2xl/progress:grid"
        >
          <span role="columnheader">{t('progress.columns.category')}</span>
          <span role="columnheader" className="text-right">
            {t('progress.columns.expected')}
          </span>
          <span role="columnheader" className="text-right">
            {t('progress.columns.spent')}
          </span>
          <span role="columnheader" className="text-right">
            {t('progress.columns.result')}
          </span>
        </div>
      </div>
      <div role="rowgroup" className="divide-y">
        {rows.map((row) => (
          <ProgressLine key={row.category_id} row={row} period={period} />
        ))}
      </div>
    </div>
  )
}

/**
 * How much of the plan is spent, in proportion: the bar's whole length is the larger of
 * planned and spent, so an overshoot shows as the share beyond the plan's mark, not as a
 * full red bar. Display only: the figures are the database's.
 */
function SpendingBar({
  expected,
  spent,
  over,
}: {
  expected: number
  spent: number
  over: boolean
}) {
  const scale = Math.max(expected, spent, 1)
  const within = (Math.min(Math.max(spent, 0), expected) / scale) * 100
  const beyond = over ? ((spent - expected) / scale) * 100 : 0
  const mark = (expected / scale) * 100
  return (
    <div className="relative h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
      <div
        className="absolute inset-y-0 left-0 rounded-l-full bg-primary/60"
        style={{ width: `${within}%` }}
      />
      {over && (
        <>
          <div
            className="absolute inset-y-0 rounded-r-full bg-destructive/70"
            style={{ left: `${within}%`, width: `${beyond}%` }}
          />
          <div className="absolute inset-y-0 w-0.5 bg-background" style={{ left: `${mark}%` }} />
        </>
      )}
    </div>
  )
}

function ProgressLine({ row, period }: { row: ProgressRow; period: PeriodSummary }) {
  const { t } = useTranslation()
  // The generated type misses that a top-level row has no parent.
  const sub = (row.parent_id as string | null) !== null
  // Spending on a category not planned then is shown as such ("Not planned"), not as an
  // overshoot of a plan that did not exist.
  const over = row.is_overspent && row.in_force
  const weight = row.is_group ? 'font-semibold' : sub ? '' : 'font-medium'
  const transactionsLink = `${paths.transactions}?period=${period.id}&category=${row.category_id}`
  return (
    <div
      role="row"
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 py-3 @2xl/progress:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_7.5rem] @2xl/progress:gap-x-3',
        sub && 'pl-4 @2xl/progress:pl-6',
      )}
      data-testid="progress-row"
      data-overspent={over || undefined}
    >
      <div role="rowheader" className="flex min-w-0 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            to={transactionsLink}
            className={cn(
              'truncate text-sm underline-offset-4 hover:underline',
              weight,
              !row.in_force && 'text-muted-foreground',
            )}
            title={t('progress.seeTransactions', { name: row.name })}
          >
            {row.name}
          </Link>
          {over && (
            <Badge
              variant="outline"
              className="border-transparent bg-red-500/10 text-red-700 dark:bg-red-400/15 dark:text-red-300"
            >
              {t('progress.overspent')}
            </Badge>
          )}
          {!row.in_force && (
            <Badge variant="outline" title={t('progress.notInForceHint')}>
              {t('progress.notInForce')}
            </Badge>
          )}
        </div>
        {!row.is_group && row.in_force && (
          <SpendingBar expected={row.expected} spent={row.spent} over={over} />
        )}
        <span
          className="text-xs text-muted-foreground tabular-nums @2xl/progress:hidden"
          aria-hidden
        >
          {t('progress.spentOf', {
            spent: formatMoney(row.spent),
            expected: formatMoney(row.expected),
          })}
        </span>
      </div>
      <span
        role="cell"
        className={cn('sr-only text-right text-sm tabular-nums @2xl/progress:not-sr-only', weight)}
      >
        {formatMoney(row.expected)}
      </span>
      <span
        role="cell"
        className={cn('sr-only text-right text-sm tabular-nums @2xl/progress:not-sr-only', weight)}
      >
        {formatMoney(row.spent)}
      </span>
      <span
        role="cell"
        className="flex flex-col items-end self-start @2xl/progress:self-center"
        data-testid="progress-row-result"
      >
        <span
          className="text-[11px] leading-none text-muted-foreground @2xl/progress:hidden"
          aria-hidden
        >
          {t('progress.columns.result')}
        </span>
        <span
          className={cn(
            'text-sm whitespace-nowrap tabular-nums',
            weight || 'font-medium',
            over && 'text-red-700 dark:text-red-300',
          )}
        >
          {formatMoney(row.result)}
        </span>
      </span>
    </div>
  )
}
