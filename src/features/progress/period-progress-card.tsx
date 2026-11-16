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
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2">
          <PieChartIcon className="size-4 text-muted-foreground" aria-hidden />
          <h2>{t('progress.title')}</h2>
        </CardTitle>
        {period && (
          <nav
            className="flex items-center gap-1 self-start sm:self-auto"
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
      <CardContent className="flex flex-col gap-6">
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
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4" data-testid="progress-totals">
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
        emphasis
        testId="progress-result"
      />
    </dl>
  )
}

/** Each category and subcategory: expected, spent, result; overspending stands out. */
function ProgressTable({ rows, period }: { rows: ProgressRow[]; period: PeriodSummary }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col">
      <div className="hidden grid-cols-[minmax(0,1fr)_7rem_7rem_7rem] gap-3 border-b pb-2 text-xs font-medium text-muted-foreground sm:grid">
        <span>{t('progress.columns.category')}</span>
        <span className="text-right">{t('progress.columns.expected')}</span>
        <span className="text-right">{t('progress.columns.spent')}</span>
        <span className="text-right">{t('progress.columns.result')}</span>
      </div>
      <ul className="divide-y" aria-label={t('progress.listLabel')}>
        {rows.map((row) => (
          <ProgressLine key={row.category_id} row={row} period={period} />
        ))}
      </ul>
    </div>
  )
}

function ProgressLine({ row, period }: { row: ProgressRow; period: PeriodSummary }) {
  const { t } = useTranslation()
  // The generated type misses that a top-level row has no parent.
  const sub = (row.parent_id as string | null) !== null
  const over = row.is_overspent
  // Only the bar's length: how much of what was expected is spent (display, not a figure).
  const share =
    row.expected > 0
      ? Math.min(100, Math.max(0, (row.spent / row.expected) * 100))
      : row.spent > 0
        ? 100
        : 0
  const transactionsLink = `${paths.transactions}?period=${period.id}&category=${row.category_id}`
  return (
    <li
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_6.5rem] items-center gap-x-3 gap-y-1 py-2.5 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_7rem]',
        sub && 'pl-4 sm:pl-6',
      )}
      data-testid="progress-row"
      data-overspent={over || undefined}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Link
            to={transactionsLink}
            className={cn(
              'truncate underline-offset-4 hover:underline',
              row.is_group ? 'font-semibold' : sub ? 'text-sm' : 'font-medium',
              !row.in_force && 'text-muted-foreground',
            )}
            title={t('progress.seeTransactions', { name: row.name })}
          >
            {row.name}
          </Link>
          {over && <Badge variant="destructive">{t('progress.overspent')}</Badge>}
          {!row.in_force && (
            <Badge variant="outline" title={t('progress.notInForceHint')}>
              {t('progress.notInForce')}
            </Badge>
          )}
        </div>
        {!row.is_group && (
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div
              className={cn('h-full rounded-full', over ? 'bg-destructive' : 'bg-primary/70')}
              style={{ width: `${share}%` }}
            />
          </div>
        )}
      </div>
      <span className="hidden text-right text-sm tabular-nums sm:block">
        {formatMoney(row.expected)}
      </span>
      <span className="hidden text-right text-sm tabular-nums sm:block">
        {formatMoney(row.spent)}
      </span>
      <span
        className={cn(
          'text-right text-sm font-medium tabular-nums',
          over && 'text-destructive',
          row.is_group && 'font-semibold',
        )}
        data-testid="progress-row-result"
      >
        {formatMoney(row.result)}
      </span>
      <span className="col-span-2 text-xs text-muted-foreground tabular-nums sm:hidden">
        {over
          ? t('progress.spentOfOver', {
              spent: formatMoney(row.spent),
              expected: formatMoney(row.expected),
            })
          : t('progress.spentOf', {
              spent: formatMoney(row.spent),
              expected: formatMoney(row.expected),
            })}
      </span>
    </li>
  )
}
