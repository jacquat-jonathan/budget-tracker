import { useTranslation } from 'react-i18next'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts'

import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { axisMoney, periodTick } from '@/features/compare/compare-format'
import type { TrendPeriod } from '@/features/compare/compare-queries'
import { valueTicks } from '@/features/debts/debt-chart-data'
import { formatCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'

/**
 * The trend as two charts on one money axis each (never two scales on one chart): income and
 * spending as columns side by side with the planned total as a line, and the result as
 * columns from zero (above a surplus, below a deficit: position, not colour, tells which).
 * The running period carries the word "Running" over its columns. One named image each; the
 * table is their text alternative. A column or a point selects its period.
 */
// R-COMPARE-191: the trend drawn from the database's rows, the running period marked in words.

const config = {
  income: { label: 'income', color: 'var(--chart-1)' },
  spent: { label: 'spent', color: 'var(--chart-2)' },
  planned: { label: 'planned', color: 'var(--muted-foreground)' },
  result: { label: 'result', color: 'var(--chart-3)' },
} satisfies ChartConfig

/** Each period needs this much width: a wide range scrolls inside its own frame on a phone. */
const PER_PERIOD_PX = 44

interface Point {
  id: string
  period: TrendPeriod
  income: number
  spent: number
  planned: number
  result: number
}

function points(periods: TrendPeriod[]): Point[] {
  return periods.map((period) => ({
    id: period.period_id,
    period,
    income: period.income_total,
    spent: period.spent_total,
    planned: period.expected_total,
    result: period.result,
  }))
}

/**
 * A chart's own scrolling frame: on a phone a wide range scrolls inside it (never the page),
 * opening on its right end, the newest periods.
 */
export function ChartFrame({
  count,
  perPeriod = PER_PERIOD_PX,
  children,
}: {
  count: number
  perPeriod?: number
  children: React.ReactNode
}) {
  return (
    <div
      className="relative -mx-1 overflow-x-auto px-1 pb-1"
      data-testid="chart-frame"
      ref={(node) => {
        if (node) node.scrollLeft = node.scrollWidth
      }}
    >
      <div style={{ minWidth: count * perPeriod }}>{children}</div>
    </div>
  )
}

function Tip({
  point,
  rows,
}: {
  point: Point | undefined
  rows: { key: keyof typeof config; value: number }[]
}) {
  const { t } = useTranslation()
  if (!point) return null
  return (
    <div className="grid min-w-44 gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium tabular-nums">
        {t('compare.period', {
          start: formatCalendarDate(point.period.start_date),
          end: formatCalendarDate(point.period.end_date),
        })}
      </div>
      <div className="text-muted-foreground">
        {t('compare.days', { count: point.period.days })}
        {point.period.is_current && ` · ${t('compare.runningLong')}`}
      </div>
      {rows.map((row) => (
        <div key={row.key} className="flex items-center gap-2">
          <span
            className="h-0.5 w-3 shrink-0 rounded-full"
            style={{ background: config[row.key].color }}
            aria-hidden
          />
          <span className="text-muted-foreground">{t(`compare.series.${row.key}`)}</span>
          <span className="ml-auto font-medium tabular-nums">{formatMoney(row.value)}</span>
        </div>
      ))}
    </div>
  )
}

/** The legend: a swatch for the columns, a short line for the planned total. */
export function TrendLegend({ withPlanned = true }: { withPlanned?: boolean }) {
  const { t } = useTranslation()
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {(['income', 'spent'] as const).map((key) => (
        <li key={key} className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-[2px]"
            style={{ background: config[key].color }}
            aria-hidden
          />
          {t(`compare.series.${key}`)}
        </li>
      ))}
      {withPlanned && (
        <li className="flex items-center gap-1.5">
          <span
            className="h-0.5 w-3 rounded-full"
            style={{ background: config.planned.color }}
            aria-hidden
          />
          {t('compare.series.planned')}
        </li>
      )}
    </ul>
  )
}

function running(data: Point[]) {
  return data.find((point) => point.period.is_current)
}

export function IncomeSpentChart({
  periods,
  onSelect,
}: {
  periods: TrendPeriod[]
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation()
  const data = points(periods)
  const values = valueTicks([
    0,
    ...data.flatMap((point) => [point.income, point.spent, point.planned]),
  ])
  const first = periods[0]
  const last = periods.at(-1)
  const live = running(data)
  const select = (payload: unknown) => {
    const point = (payload as { payload?: Point } | undefined)?.payload
    if (point) onSelect(point.id)
  }
  return (
    <ChartFrame count={data.length}>
      <ChartContainer
        config={config}
        className="aspect-auto h-64 w-full sm:h-72"
        role="img"
        aria-label={t('compare.trend.chartLabel', {
          count: data.length,
          from: first ? formatCalendarDate(first.start_date) : '',
          to: last ? formatCalendarDate(last.end_date) : '',
        })}
        data-testid="trend-chart"
      >
        <ComposedChart
          data={data}
          margin={{ top: 20, right: 8, bottom: 0, left: 4 }}
          accessibilityLayer={false}
          barGap={2}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="id"
            tickFormatter={periodTick(periods)}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval="preserveStartEnd"
          />
          <YAxis
            width={72}
            tickLine={false}
            axisLine={false}
            ticks={values.ticks}
            domain={[values.ticks[0] ?? 0, values.ticks.at(-1) ?? 0]}
            tickFormatter={(value: number) => axisMoney(value, values.decimals)}
          />
          {live && (
            <ReferenceArea
              x1={live.id}
              x2={live.id}
              fill="var(--muted)"
              fillOpacity={0.6}
              label={{
                value: t('compare.running'),
                position: 'insideTop',
                fontSize: 11,
                fill: 'var(--muted-foreground)',
                dy: -18,
              }}
            />
          )}
          <ReferenceLine y={0} stroke="var(--border)" />
          <ChartTooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
            content={({ active, payload }) => {
              const point = active ? (payload[0]?.payload as Point | undefined) : undefined
              return (
                <Tip
                  point={point}
                  rows={
                    point
                      ? [
                          { key: 'income', value: point.income },
                          { key: 'spent', value: point.spent },
                          { key: 'planned', value: point.planned },
                        ]
                      : []
                  }
                />
              )
            }}
          />
          <Bar
            dataKey="income"
            fill="var(--color-income)"
            maxBarSize={24}
            radius={[4, 4, 0, 0]}
            onClick={select}
            className="cursor-pointer"
          />
          <Bar
            dataKey="spent"
            fill="var(--color-spent)"
            maxBarSize={24}
            radius={[4, 4, 0, 0]}
            onClick={select}
            className="cursor-pointer"
          />
          <Line
            dataKey="planned"
            type="linear"
            stroke="var(--color-planned)"
            strokeWidth={2}
            dot={{ r: 4, stroke: 'var(--card)', strokeWidth: 2, fill: 'var(--color-planned)' }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartContainer>
    </ChartFrame>
  )
}

export function ResultChart({
  periods,
  onSelect,
}: {
  periods: TrendPeriod[]
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation()
  const data = points(periods)
  const values = valueTicks([0, ...data.map((point) => point.result)])
  const first = periods[0]
  const last = periods.at(-1)
  const live = running(data)
  return (
    <ChartFrame count={data.length}>
      <ChartContainer
        config={config}
        className="aspect-auto h-44 w-full sm:h-52"
        role="img"
        aria-label={t('compare.trend.resultLabel', {
          count: data.length,
          from: first ? formatCalendarDate(first.start_date) : '',
          to: last ? formatCalendarDate(last.end_date) : '',
        })}
        data-testid="result-chart"
      >
        <BarChart
          data={data}
          margin={{ top: 20, right: 8, bottom: 0, left: 4 }}
          accessibilityLayer={false}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="id"
            tickFormatter={periodTick(periods)}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval="preserveStartEnd"
          />
          <YAxis
            width={72}
            tickLine={false}
            axisLine={false}
            ticks={values.ticks}
            domain={[values.ticks[0] ?? 0, values.ticks.at(-1) ?? 0]}
            tickFormatter={(value: number) => axisMoney(value, values.decimals)}
          />
          {live && (
            <ReferenceArea
              x1={live.id}
              x2={live.id}
              fill="var(--muted)"
              fillOpacity={0.6}
              label={{
                value: t('compare.running'),
                position: 'insideTop',
                fontSize: 11,
                fill: 'var(--muted-foreground)',
                dy: -18,
              }}
            />
          )}
          <ReferenceLine y={0} stroke="var(--muted-foreground)" />
          <ChartTooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
            content={({ active, payload }) => {
              const point = active ? (payload[0]?.payload as Point | undefined) : undefined
              return (
                <Tip point={point} rows={point ? [{ key: 'result', value: point.result }] : []} />
              )
            }}
          />
          <Bar
            dataKey="result"
            fill="var(--color-result)"
            maxBarSize={24}
            radius={4}
            className="cursor-pointer"
            onClick={(payload: unknown) => {
              const point = (payload as { payload?: Point } | undefined)?.payload
              if (point) onSelect(point.id)
            }}
          />
        </BarChart>
      </ChartContainer>
    </ChartFrame>
  )
}
