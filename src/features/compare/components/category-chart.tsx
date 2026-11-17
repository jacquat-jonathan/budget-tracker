import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { CartesianGrid, Line, LineChart, ReferenceArea, XAxis, YAxis } from 'recharts'

import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import {
  periodLabels,
  SLOT_COLORS,
  SLOT_DASHES,
  SLOT_MARKS,
  type SlotMark,
} from '@/features/compare/compare-format'
import type { CategoryLine, TrendPeriod } from '@/features/compare/compare-queries'
import {
  ChartFrame,
  PeriodTick,
  PLOT_TOP,
  X_AXIS_HEIGHT,
} from '@/features/compare/components/chart-frame'
import { valueTicks } from '@/features/debts/debt-chart-data'
import { formatCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'

const HEIGHT = 272
/** Lines need less room than columns: 24 periods fit from a tablet. */
const MIN_BAND = 20

/**
 * The spending of the chosen category lines over the range, one line each in the hue, the
 * mark and the dash of its slot, with a legend naming every line with the same mark (identity
 * never by colour alone) and a tooltip listing every line at a period. The running period is
 * shaded and named "Running": its spending is not final. One named image; the table is its
 * text alternative.
 */
// R-COMPARE-192: at most five lines, each keeping its hue, mark and dash while others change.
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
  const axisFor = useCallback(
    (from: number, to: number) =>
      valueTicks([0, ...drawn.flatMap((item) => item.line.spent.slice(from, to))]),
    [drawn],
  )
  const labels = periodLabels(periods)
  const ticks = new Map(
    periods.map((period, index) => [
      period.period_id,
      labels[index] ?? { dayMonth: '', year: null },
    ]),
  )
  const live = periods.find((period) => period.is_current)
  const first = periods[0]
  const last = periods.at(-1)
  const name = t('compare.categories.chartLabel', {
    count: periods.length,
    names: drawn.map((item) => item.line.name).join(', '),
    from: first ? formatCalendarDate(first.start_date) : '',
    to: last ? formatCalendarDate(last.end_date) : '',
  })
  return (
    <div className="flex flex-col gap-3">
      <ul
        className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
        data-testid="category-legend"
      >
        {drawn.map((item) => (
          <li key={item.key} className="flex min-w-0 items-center gap-1.5">
            <SlotSwatch slot={item.slot} />
            <span className="max-w-48 truncate">{item.line.name}</span>
          </li>
        ))}
      </ul>
      <ChartFrame
        count={periods.length}
        minBand={MIN_BAND}
        height={HEIGHT}
        axisFor={axisFor}
        name={name}
      >
        {(values) => (
          <ChartContainer
            config={config}
            className="aspect-auto w-full"
            style={{ height: HEIGHT }}
            role="img"
            aria-label={name}
            data-testid="category-chart"
          >
            <LineChart
              data={data}
              margin={{ top: PLOT_TOP, right: 8, bottom: 0, left: 8 }}
              accessibilityLayer={false}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="id"
                tickLine={false}
                axisLine={false}
                height={X_AXIS_HEIGHT}
                interval={0}
                padding={{ left: 8, right: 8 }}
                tick={<PeriodTick labels={ticks} />}
              />
              <YAxis
                hide
                ticks={values.ticks}
                domain={[values.ticks[0] ?? 0, values.ticks.at(-1) ?? 0]}
                allowDataOverflow
              />
              {live && (
                <ReferenceArea
                  x1={live.period_id}
                  x2={live.period_id}
                  fill="var(--muted)"
                  fillOpacity={0.6}
                  label={{
                    value: t('compare.running'),
                    // The running period is the last one: the word ends at its right edge, never cut.
                    position: 'insideTopRight',
                    fontSize: 11,
                    fill: 'var(--muted-foreground)',
                    dy: -18,
                  }}
                />
              )}
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
                      <div className="text-muted-foreground">
                        {t('compare.days', { count: row.period.days })}
                        {row.period.is_current && ` · ${t('compare.runningLong')}`}
                      </div>
                      {drawn.map((item) => (
                        <div key={item.key} className="flex items-center gap-2">
                          <SlotSwatch slot={item.slot} />
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
                  strokeDasharray={SLOT_DASHES[item.slot] || undefined}
                  dot={(props: { cx?: number; cy?: number; index?: number }) => (
                    <Mark
                      key={`${item.key}-${props.index ?? 0}`}
                      kind={SLOT_MARKS[item.slot] ?? 'circle'}
                      x={props.cx}
                      y={props.cy}
                      color={SLOT_COLORS[item.slot] ?? SLOT_COLORS[0]}
                    />
                  )}
                  activeDot={(props: { cx?: number; cy?: number }) => (
                    <Mark
                      kind={SLOT_MARKS[item.slot] ?? 'circle'}
                      x={props.cx}
                      y={props.cy}
                      color={SLOT_COLORS[item.slot] ?? SLOT_COLORS[0]}
                      size={6}
                    />
                  )}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ChartContainer>
        )}
      </ChartFrame>
    </div>
  )
}

/** A slot's mark, drawn at a point: its shape in its hue, ringed with the card colour. */
function Mark({
  kind,
  x,
  y,
  color,
  size = 4.5,
}: {
  kind: SlotMark
  x?: number
  y?: number
  color: string
  size?: number
}) {
  if (x === undefined || y === undefined) return <g />
  const common = { fill: color, stroke: 'var(--card)', strokeWidth: 1.5 }
  const s = size
  switch (kind) {
    case 'circle':
      return <circle cx={x} cy={y} r={s} {...common} />
    case 'square':
      return <rect x={x - s} y={y - s} width={s * 2} height={s * 2} {...common} />
    case 'triangle':
      return (
        <polygon
          points={`${x},${y - s * 1.2} ${x + s * 1.1},${y + s * 0.9} ${x - s * 1.1},${y + s * 0.9}`}
          {...common}
        />
      )
    case 'diamond':
      return (
        <polygon
          points={`${x},${y - s * 1.3} ${x + s * 1.1},${y} ${x},${y + s * 1.3} ${x - s * 1.1},${y}`}
          {...common}
        />
      )
    case 'cross':
      return (
        <path
          d={`M${x - s},${y - s}L${x + s},${y + s}M${x + s},${y - s}L${x - s},${y + s}`}
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      )
  }
}

/** The legend's and the tooltip's mark: a short line in the slot's dash, its mark on it. */
export function SlotSwatch({ slot }: { slot: number }) {
  const color = SLOT_COLORS[slot] ?? SLOT_COLORS[0]
  return (
    <svg width={22} height={12} viewBox="0 0 22 12" className="shrink-0" aria-hidden>
      <line
        x1={1}
        y1={6}
        x2={21}
        y2={6}
        stroke={color}
        strokeWidth={2}
        strokeDasharray={SLOT_DASHES[slot] || undefined}
      />
      <Mark kind={SLOT_MARKS[slot] ?? 'circle'} x={11} y={6} color={color} size={3.5} />
    </svg>
  )
}
