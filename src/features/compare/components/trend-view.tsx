import { ArrowLeftRightIcon, ChartColumnIcon, PieChartIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { compareHref, lengthsToMention, resultWord } from '@/features/compare/compare-format'
import { usePeriodTrend, type Count, type TrendPeriod } from '@/features/compare/compare-queries'
import {
  IncomeSpentChart,
  ResultChart,
  TrendLegend,
} from '@/features/compare/components/trend-charts'
import { progressPath } from '@/features/progress/progress-path'
import { formatCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

/**
 * The trend of the last periods (get_period_trend): the three averages over the completed
 * periods (null: "no completed period yet", never CHF 0.00), the charts, and the table with
 * each period's figures, length and links (its progress, and side by side with the one
 * before it).
 */
// R-COMPARE-191: averages in words when there are none, the running period marked and left out.
export function TrendView({
  budgetId,
  count,
  selected,
  onSelect,
}: {
  budgetId: string
  count: Count
  selected: string | null
  onSelect: (id: string | null) => void
}) {
  const { t } = useTranslation()
  const trend = usePeriodTrend(budgetId, count)
  if (trend.isError) return <ErrorState error={trend.error} onRetry={trend.refetch} />
  if (!trend.data) return <LoadingState rows={4} />
  const periods = trend.data
  const first = periods[0]
  if (!first) return <LoadingState rows={4} />
  if (periods.length < 2) {
    return (
      <EmptyState
        icon={ChartColumnIcon}
        title={t('compare.few.title')}
        description={
          first.is_current
            ? t('compare.few.help', { date: formatCalendarDate(first.end_date) })
            : t('compare.few.helpEnded')
        }
      />
    )
  }
  const live = periods.find((period) => period.is_current)
  const lengths = lengthsToMention(periods)
  const chosen = periods.find((period) => period.period_id === selected) ?? null
  const label = (period: TrendPeriod) =>
    t('compare.period', {
      start: formatCalendarDate(period.start_date),
      end: formatCalendarDate(period.end_date),
    })

  return (
    <div className="flex min-w-0 flex-col gap-6" data-testid="trend-view">
      <Averages first={first} />
      {(live || lengths) && (
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          {live && (
            <p data-testid="not-averaged">
              {t('compare.notAveraged', {
                start: formatCalendarDate(live.start_date),
                end: formatCalendarDate(live.end_date),
              })}
            </p>
          )}
          {lengths && <p data-testid="lengths-differ">{t('compare.lengthsDiffer', lengths)}</p>}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('compare.trend.title')}</h2>
          </CardTitle>
          <TrendLegend />
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-6">
          <IncomeSpentChart periods={periods} onSelect={onSelect} />
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t('compare.trend.resultTitle')}</h3>
            <p className="text-xs text-muted-foreground">{t('compare.trend.resultHelp')}</p>
            <ResultChart periods={periods} onSelect={onSelect} />
          </div>
          {chosen && (
            <Selected period={chosen} label={label(chosen)} onClear={() => onSelect(null)} />
          )}
        </CardContent>
      </Card>
      <TrendTable
        periods={periods}
        label={label}
        selected={chosen?.period_id ?? null}
        onSelect={onSelect}
      />
    </div>
  )
}

function Averages({ first }: { first: TrendPeriod }) {
  const { t } = useTranslation()
  const none = first.completed_count === 0
  const stats = [
    { key: 'income', value: first.average_income },
    { key: 'spent', value: first.average_spent },
    { key: 'result', value: first.average_result },
  ] as const
  return (
    <section className="@container flex flex-col gap-2" data-testid="averages">
      <dl className="grid grid-cols-1 gap-3 @xl:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.key} className="flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-4">
            <dt className="text-sm text-muted-foreground">{t(`compare.averages.${stat.key}`)}</dt>
            <dd
              className={cn(
                'text-xl font-semibold tracking-tight whitespace-nowrap tabular-nums',
                stat.key === 'result' &&
                  stat.value !== null &&
                  stat.value < 0 &&
                  'text-destructive',
              )}
            >
              {stat.value === null ? (
                <span className="text-base font-normal text-muted-foreground">
                  {t('compare.averages.none')}
                </span>
              ) : (
                formatMoney(stat.value)
              )}
            </dd>
            {stat.key === 'result' && stat.value !== null && (
              <dd className="text-xs text-muted-foreground">
                {t(`compare.trend.${resultWord(stat.value)}`)}
              </dd>
            )}
          </div>
        ))}
      </dl>
      {!none && (
        <p className="text-xs text-muted-foreground" data-testid="averages-over">
          {t('compare.averages.over', { count: first.completed_count })}
        </p>
      )}
    </section>
  )
}

function Selected({
  period,
  label,
  onClear,
}: {
  period: TrendPeriod
  label: string
  onClear: () => void
}) {
  const { t } = useTranslation()
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
      data-testid="trend-selected"
      role="status"
    >
      <span className="font-medium tabular-nums">
        {t('compare.trend.selected', { period: label })}
      </span>
      <div className="flex flex-wrap gap-2">
        <PeriodActions period={period} label={label} />
        <Button variant="ghost" size="sm" onClick={onClear}>
          {t('ui.close')}
        </Button>
      </div>
    </div>
  )
}

/**
 * Open the period, or put it side by side: the period chosen is B, the one before it A (the
 * database's default for A); the first period has none before it, so A is left to pick.
 */
// R-COMPARE-284: "Compare with…" puts the period as B, never beside itself.
function PeriodActions({
  period,
  label,
  compact = false,
}: {
  period: TrendPeriod
  label: string
  compact?: boolean
}) {
  const { t } = useTranslation()
  return (
    <>
      {/* In the table, icons with their names as tooltips: the figures keep the width. */}
      <Button asChild variant="outline" size={compact ? 'icon-sm' : 'sm'}>
        <Link
          to={progressPath(period.period_id)}
          aria-label={t('compare.trend.openFor', { period: label })}
          title={compact ? t('compare.trend.open') : undefined}
        >
          <PieChartIcon aria-hidden />
          {!compact && t('compare.trend.open')}
        </Link>
      </Button>
      <Button asChild variant="outline" size={compact ? 'icon-sm' : 'sm'}>
        <Link
          to={compareHref('side', { b: period.period_id })}
          aria-label={t('compare.trend.compareWithFor', { period: label })}
          title={compact ? t('compare.trend.compareWith') : undefined}
        >
          <ArrowLeftRightIcon aria-hidden />
          {!compact && t('compare.trend.compareWith')}
        </Link>
      </Button>
    </>
  )
}

/** Every figure of the charts, newest first: the charts' text alternative. */
function TrendTable({
  periods,
  label,
  selected,
  onSelect,
}: {
  periods: TrendPeriod[]
  label: (period: TrendPeriod) => string
  selected: string | null
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation()
  const rows = [...periods].reverse()
  return (
    <Card>
      <CardContent className="min-w-0">
        <Table
          aria-label={t('compare.trend.tableLabel')}
          data-testid="trend-table"
          className="min-w-[38rem]"
        >
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className="sticky left-0 z-10 bg-card">
                {t('compare.periodHeader')}
              </TableHead>
              <TableHead scope="col" className="text-right">
                {t('compare.series.income')}
              </TableHead>
              <TableHead scope="col" className="text-right">
                {t('compare.series.spent')}
              </TableHead>
              <TableHead scope="col" className="text-right">
                {t('compare.series.planned')}
              </TableHead>
              <TableHead scope="col" className="text-right">
                {t('compare.series.result')}
              </TableHead>
              <TableHead scope="col">
                <span className="sr-only">{t('common.actions')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((period) => (
              <TableRow
                key={period.period_id}
                data-testid="trend-row"
                data-state={period.period_id === selected ? 'selected' : undefined}
              >
                {/* The row's header: its period, so each figure is read with it. */}
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-card p-2 text-left align-middle font-normal whitespace-nowrap"
                >
                  <button
                    type="button"
                    className="text-left font-medium tabular-nums underline-offset-4 hover:underline"
                    onClick={() => onSelect(period.period_id)}
                    aria-label={t('compare.trend.select', { period: label(period) })}
                  >
                    {label(period)}
                  </button>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {t('compare.days', { count: period.days })}
                    {period.is_current && <Badge variant="secondary">{t('compare.running')}</Badge>}
                  </div>
                </th>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(period.income_total)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(period.spent_total)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(period.expected_total)}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right font-medium tabular-nums',
                    period.result < 0 && 'text-destructive',
                  )}
                >
                  {formatMoney(period.result)}
                  <span className="block text-xs font-normal text-muted-foreground">
                    {t(`compare.trend.${resultWord(period.result)}`)}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <PeriodActions period={period} label={label(period)} compact />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
