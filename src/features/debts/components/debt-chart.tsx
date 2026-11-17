import { useTranslation } from 'react-i18next'
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts'

import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import {
  chartPoints,
  timeTicks,
  valueTicks,
  type ChartPoint,
} from '@/features/debts/debt-chart-data'
import type { HistoryEntry, HistoryKind } from '@/features/debts/debt-queries'
import { formatCalendarDate, fromCalendarDayNumber } from '@/lib/date'
import { formatCount, formatMoney } from '@/lib/money'

const config = {
  balance: { label: 'balance', color: 'var(--chart-1)' },
} satisfies ChartConfig

// The theme tokens themselves: the marks are also drawn outside the chart (legend, table).
const KIND_COLOR: Record<HistoryKind, string> = {
  opened: 'var(--chart-1)',
  payment: 'var(--chart-1)',
  interest: 'var(--chart-2)',
  adjustment: 'var(--chart-3)',
}

/**
 * Beyond this many dates only adjustments, the rare events worth spotting, are marked: interest
 * comes every period and its marks would bury the line. The tooltip still lists every event.
 */
const MARK_ALL_UP_TO = 24

/** One marker per kind, its shape saying the kind (never colour alone). */
function KindMark({ kind, x, y }: { kind: HistoryKind; x: number; y: number }) {
  const fill = KIND_COLOR[kind]
  // A 2px ring in the card's colour keeps overlapping marks apart.
  const ring = { stroke: 'var(--card)', strokeWidth: 2, fill }
  switch (kind) {
    case 'opened':
      // A hollow square: the start, unlike the filled dot of a payment.
      return (
        <rect
          x={x - 6}
          y={y - 6}
          width={12}
          height={12}
          rx={2}
          fill="var(--card)"
          stroke={fill}
          strokeWidth={2.5}
        />
      )
    case 'interest':
      return <path d={`M${x} ${y - 6} L${x + 6} ${y + 5} L${x - 6} ${y + 5} Z`} {...ring} />
    case 'adjustment':
      return <path d={`M${x} ${y - 6} L${x + 6} ${y} L${x} ${y + 6} L${x - 6} ${y} Z`} {...ring} />
    case 'payment':
      return <circle cx={x} cy={y} r={4} {...ring} />
  }
}

export function KindLegendMark({ kind }: { kind: HistoryKind }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="shrink-0">
      <KindMark kind={kind} x={7} y={7} />
    </svg>
  )
}

/** The mark of a date: its most telling event (an adjustment, then interest, the opening). */
function markOf(point: ChartPoint, all: boolean): HistoryKind | null {
  const kinds = point.events.map((event) => event.kind)
  for (const kind of ['adjustment', 'interest', 'opened', 'payment'] as const) {
    if (kinds.includes(kind) && (all || kind === 'adjustment')) return kind
  }
  return null
}

function useMonthLabel() {
  const { i18n } = useTranslation()
  return (date: string, unit: 'month' | 'year') => {
    const year = Number(date.slice(0, 4))
    const month = Number(date.slice(5, 7))
    return new Intl.DateTimeFormat(i18n.language, {
      ...(unit === 'month' ? { month: 'short' } : {}),
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, 1)))
  }
}

/**
 * The balance over time, from get_debt_history: a step line with one point per date (the
 * balance after that date's last event), drawn on to today; the tooltip lists every event of
 * the date. Long histories mark only interest and adjustments. The history table next to it
 * is its text alternative. Display only: every value is the database's.
 */
// R-DEBT-122: the evolution as the database records it, with a table as its text alternative.
export function DebtChart({
  entries,
  today,
  cappedAt = null,
}: {
  entries: HistoryEntry[]
  today: string | null
  /** The chart stopped reading at this many events (D-231): said under it. */
  cappedAt?: number | null
}) {
  const { t } = useTranslation()
  const monthLabel = useMonthLabel()
  // Stopped short of the end: the line ends with the last event read, not today.
  const points = chartPoints(entries, cappedAt === null ? today : null)
  const first = points[0]
  const last = points.at(-1)
  if (!first || !last || entries.length < 2) {
    // A single event (the opening): words, not an empty-looking chart.
    const opened = entries[0]
    return (
      <p className="text-sm text-muted-foreground" data-testid="debt-chart-empty">
        {opened
          ? t('debts.chart.onlyOpened', {
              amount: formatMoney(opened.balance),
              date: formatCalendarDate(opened.date),
            })
          : t('debts.chart.nothing')}
      </p>
    )
  }
  const markAll = points.length <= MARK_ALL_UP_TO
  const values = valueTicks(points.map((point) => point.balance))
  const time = timeTicks(first.date, last.date)
  const kinds: HistoryKind[] = ['opened', 'payment', 'interest', 'adjustment']
  const present = kinds.filter((kind) =>
    points.some((point) => point.events.length > 0 && markOf(point, markAll) === kind),
  )
  const amount = (rappen: number) =>
    values.decimals
      ? formatMoney(rappen, { currency: false })
      : formatMoney(rappen, { currency: false }).replace(/\.00$/, '')
  return (
    <figure className="flex flex-col gap-3" data-testid="debt-chart">
      <ChartContainer
        config={config}
        className="aspect-auto h-60 w-full sm:h-72"
        role="img"
        aria-label={
          cappedAt === null
            ? last.balance < 0
              ? t('debts.chart.labelOverpaid', {
                  count: entries.length,
                  amount: formatMoney(-last.balance),
                })
              : t('debts.chart.label', { count: entries.length, amount: formatMoney(last.balance) })
            : t('debts.chart.labelCapped', {
                shown: formatCount(entries.length),
                date: formatCalendarDate(last.date),
              })
        }
      >
        {/* No accessibility layer: the figure is one image with a name; the table is the text. */}
        <LineChart
          data={points}
          margin={{ top: 12, right: 12, bottom: 0, left: 4 }}
          accessibilityLayer={false}
        >
          <CartesianGrid vertical={false} strokeDasharray="0" />
          <XAxis
            dataKey="day"
            type="number"
            scale="linear"
            domain={[first.day, last.day]}
            ticks={time.ticks}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={16}
            tickFormatter={(day: number) => {
              const date = fromCalendarDayNumber(day)
              return time.unit === 'day' ? formatCalendarDate(date) : monthLabel(date, time.unit)
            }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={80}
            domain={[values.ticks[0] ?? 0, values.ticks.at(-1) ?? 0]}
            ticks={values.ticks}
            tickFormatter={(value: number) => amount(value)}
          />
          {(values.ticks[0] ?? 0) < 0 && <ReferenceLine y={0} stroke="var(--muted-foreground)" />}
          <ChartTooltip
            cursor={{ stroke: 'var(--border)' }}
            content={({ active, payload }) => {
              const point = active ? (payload[0]?.payload as ChartPoint | undefined) : undefined
              if (!point) return null
              return (
                <div
                  className="grid max-w-72 min-w-48 gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl"
                  data-testid="debt-chart-tooltip"
                >
                  <div className="font-medium tabular-nums">{formatCalendarDate(point.date)}</div>
                  {point.events.length === 0 && (
                    <div className="text-muted-foreground">{t('debts.chart.today')}</div>
                  )}
                  {point.events.map((event) => (
                    <div key={`${event.kind}-${event.entry_id}`} className="grid gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <KindLegendMark kind={event.kind} />
                        <span>{t(`debts.history.kind.${event.kind}`)}</span>
                        <span className="ml-auto font-medium tabular-nums">
                          {formatMoney(event.amount)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4 pl-5 text-muted-foreground">
                        <span>{t('debts.history.balance')}</span>
                        <span className="tabular-nums">{formatMoney(event.balance)}</span>
                      </div>
                    </div>
                  ))}
                  {point.events.length === 0 && (
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">{t('debts.history.balance')}</span>
                      <span className="font-medium tabular-nums">{formatMoney(point.balance)}</span>
                    </div>
                  )}
                </div>
              )
            }}
          />
          <Line
            dataKey="balance"
            type="stepAfter"
            stroke="var(--color-balance)"
            strokeWidth={2}
            isAnimationActive={false}
            dot={(props: { cx?: number; cy?: number; payload?: ChartPoint; index?: number }) => {
              const kind = props.payload ? markOf(props.payload, markAll) : null
              return kind ? (
                <KindMark key={props.index} kind={kind} x={props.cx ?? 0} y={props.cy ?? 0} />
              ) : (
                <g key={props.index} />
              )
            }}
            activeDot={{ r: 5, stroke: 'var(--card)', strokeWidth: 2 }}
          />
        </LineChart>
      </ChartContainer>
      <figcaption className="flex flex-col gap-1">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {present.map((kind) => (
            <li key={kind} className="flex items-center gap-1.5">
              <KindLegendMark kind={kind} />
              {t(`debts.history.kind.${kind}`)}
            </li>
          ))}
        </ul>
        {!markAll && <p className="text-xs text-muted-foreground">{t('debts.chart.marksNote')}</p>}
        {cappedAt !== null && (
          <p className="text-xs font-medium" data-testid="debt-chart-capped">
            {t('debts.chart.capped', {
              shown: formatCount(cappedAt),
              date: formatCalendarDate(last.date),
            })}
          </p>
        )}
      </figcaption>
    </figure>
  )
}
