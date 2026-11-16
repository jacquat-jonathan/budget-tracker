import { useTranslation } from 'react-i18next'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'

import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { axisMoney, periodTick, SLOT_COLORS } from '@/features/compare/compare-format'
import type { CategoryLine, TrendPeriod } from '@/features/compare/compare-queries'
import { ChartFrame } from '@/features/compare/components/trend-charts'
import { valueTicks } from '@/features/debts/debt-chart-data'
import { formatCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'

/**
 * The spending of the chosen category lines over the range, one line each in the hue of its
 * slot, with a legend naming every line (identity never by colour alone) and a tooltip listing
 * every line at a period. One named image; the table is its text alternative.
 */
// R-COMPARE-192: at most five lines, each keeping its hue while others are added or removed.
export function CategoryChart({
  periods,
  slots,
}: {
  periods: TrendPeriod[]
  /** The chosen lines in their slots (null: an empty slot). */
  slots: (CategoryLine | null)[]
}) {
  const { t } = useTranslation()
  const drawn = slots
    .map((line, slot) => (line ? { line, slot, key: `s${slot}` } : null))
    .filter((item): item is { line: CategoryLine; slot: number; key: string } => item !== null)
  const config = Object.fromEntries(
    drawn.map((item) => [item.key, { label: item.line.name, color: SLOT_COLORS[item.slot] }]),
  ) satisfies ChartConfig
  const data = periods.map((period, index) => ({
    id: period.period_id,
    period,
    ...Object.fromEntries(drawn.map((item) => [item.key, item.line.spent[index] ?? 0])),
  }))
  const values = valueTicks([0, ...drawn.flatMap((item) => item.line.spent)])
  const first = periods[0]
  const last = periods.at(-1)
  return (
    <div className="flex flex-col gap-3">
      <ul
        className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
        data-testid="category-legend"
      >
        {drawn.map((item) => (
          <li key={item.key} className="flex min-w-0 items-center gap-1.5">
            <span
              className="h-0.5 w-3 shrink-0 rounded-full"
              style={{ background: SLOT_COLORS[item.slot] }}
              aria-hidden
            />
            <span className="max-w-48 truncate">{item.line.name}</span>
          </li>
        ))}
      </ul>
      <ChartFrame count={periods.length} perPeriod={24}>
        <ChartContainer
          config={config}
          className="aspect-auto h-64 w-full"
          role="img"
          aria-label={t('compare.categories.chartLabel', {
            count: periods.length,
            names: drawn.map((item) => item.line.name).join(', '),
            from: first ? formatCalendarDate(first.start_date) : '',
            to: last ? formatCalendarDate(last.end_date) : '',
          })}
          data-testid="category-chart"
        >
          <LineChart
            data={data}
            margin={{ top: 12, right: 12, bottom: 0, left: 4 }}
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
            <ChartTooltip
              cursor={{ stroke: 'var(--border)' }}
              content={({ active, payload }) => {
                const row = active
                  ? (payload[0]?.payload as (typeof data)[number] | undefined)
                  : undefined
                if (!row) return null
                return (
                  <div className="grid min-w-44 gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
                    <div className="font-medium tabular-nums">
                      {t('compare.period', {
                        start: formatCalendarDate(row.period.start_date),
                        end: formatCalendarDate(row.period.end_date),
                      })}
                    </div>
                    {drawn.map((item) => (
                      <div key={item.key} className="flex items-center gap-2">
                        <span
                          className="h-0.5 w-3 shrink-0 rounded-full"
                          style={{ background: SLOT_COLORS[item.slot] }}
                          aria-hidden
                        />
                        <span className="max-w-40 truncate text-muted-foreground">
                          {item.line.name}
                        </span>
                        <span className="ml-auto font-medium tabular-nums">
                          {formatMoney((row as Record<string, unknown>)[item.key] as number)}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              }}
            />
            {drawn.map((item) => (
              <Line
                key={item.key}
                dataKey={item.key}
                type="linear"
                stroke={SLOT_COLORS[item.slot]}
                strokeWidth={2}
                dot={{
                  r: 4,
                  stroke: 'var(--card)',
                  strokeWidth: 2,
                  fill: SLOT_COLORS[item.slot],
                }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
      </ChartFrame>
    </div>
  )
}
