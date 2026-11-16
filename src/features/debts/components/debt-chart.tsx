import { useTranslation } from 'react-i18next'
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts'

import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import type { HistoryEntry, HistoryKind } from '@/features/debts/debt-queries'
import { calendarDayNumber, formatCalendarDate, fromCalendarDayNumber } from '@/lib/date'
import { formatMoney } from '@/lib/money'

/** Colours are the theme's chart tokens (both themes); each kind also has its own shape. */
const config = {
  balance: { label: 'balance', color: 'var(--chart-1)' },
  interest: { label: 'interest', color: 'var(--chart-2)' },
  adjustment: { label: 'adjustment', color: 'var(--chart-3)' },
} satisfies ChartConfig

// The theme tokens themselves: the marks are also drawn outside the chart (legend, table).
const KIND_COLOR: Record<HistoryKind, string> = {
  opened: 'var(--chart-1)',
  payment: 'var(--chart-1)',
  interest: 'var(--chart-2)',
  adjustment: 'var(--chart-3)',
}

interface Point extends HistoryEntry {
  day: number
}

/** One marker per event, its shape saying its kind (never colour alone). */
function KindMark({ kind, x, y }: { kind: HistoryKind; x: number; y: number }) {
  const fill = KIND_COLOR[kind]
  // A 2px ring in the card's colour keeps overlapping marks apart.
  const ring = { stroke: 'var(--card)', strokeWidth: 2, fill }
  switch (kind) {
    case 'opened':
      return <rect x={x - 5} y={y - 5} width={10} height={10} rx={2} {...ring} />
    case 'interest':
      return <path d={`M${x} ${y - 6} L${x + 6} ${y + 5} L${x - 6} ${y + 5} Z`} {...ring} />
    case 'adjustment':
      return <path d={`M${x} ${y - 6} L${x + 6} ${y} L${x} ${y + 6} L${x - 6} ${y} Z`} {...ring} />
    case 'payment':
      return <circle cx={x} cy={y} r={4.5} {...ring} />
  }
}

export function KindLegendMark({ kind }: { kind: HistoryKind }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="shrink-0">
      <KindMark kind={kind} x={7} y={7} />
    </svg>
  )
}

/**
 * The balance over time, from get_debt_history: a step line of `balance` by `date` (dates
 * spaced by the days between them), each event marked by kind. The history table next to it
 * is its text alternative. Display only: every value is the database's.
 */
// R-DEBT-122: the evolution as the database records it, with a table as its text alternative.
export function DebtChart({ entries }: { entries: HistoryEntry[] }) {
  const { t } = useTranslation()
  const points: Point[] = entries.map((entry) => ({ ...entry, day: calendarDayNumber(entry.date) }))
  const kinds: HistoryKind[] = ['opened', 'payment', 'interest', 'adjustment']
  const present = kinds.filter((kind) => entries.some((entry) => entry.kind === kind))
  const last = entries.at(-1)
  return (
    <figure className="flex flex-col gap-3" data-testid="debt-chart">
      <ChartContainer
        config={config}
        className="aspect-auto h-60 w-full sm:h-72"
        role="img"
        aria-label={t('debts.chart.label', {
          count: entries.length,
          amount: last ? formatMoney(last.balance) : '',
        })}
      >
        <LineChart data={points} margin={{ top: 12, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid vertical={false} strokeDasharray="0" />
          <XAxis
            dataKey="day"
            type="number"
            scale="linear"
            domain={['dataMin', 'dataMax']}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={24}
            tickFormatter={(day: number) => formatCalendarDate(fromCalendarDayNumber(day))}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={72}
            // Scaled to the balances, so a change of a few payments is visible; zero is drawn
            // when it is in range (an overpaid debt).
            domain={['auto', 'auto']}
            tickFormatter={(value: number) =>
              formatMoney(Math.round(value / 100) * 100, { currency: false }).replace(/\.00$/, '')
            }
          />
          <ReferenceLine y={0} stroke="var(--border)" />
          <ChartTooltip
            cursor={{ stroke: 'var(--border)' }}
            content={({ active, payload }) => {
              const point = active ? (payload[0]?.payload as Point | undefined) : undefined
              if (!point) return null
              return (
                <div className="grid min-w-40 gap-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
                  <div className="flex items-center gap-1.5 font-medium">
                    <KindLegendMark kind={point.kind} />
                    {t(`debts.history.kind.${point.kind}`)}
                    <span className="ml-auto text-muted-foreground tabular-nums">
                      {formatCalendarDate(point.date)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{t('debts.history.amount')}</span>
                    <span className="font-medium tabular-nums">{formatMoney(point.amount)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{t('debts.history.balance')}</span>
                    <span className="font-medium tabular-nums">{formatMoney(point.balance)}</span>
                  </div>
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
            dot={(props: { cx?: number; cy?: number; payload?: Point; index?: number }) => (
              <KindMark
                key={props.index}
                kind={props.payload?.kind ?? 'payment'}
                x={props.cx ?? 0}
                y={props.cy ?? 0}
              />
            )}
            activeDot={{ r: 6, stroke: 'var(--card)', strokeWidth: 2 }}
          />
        </LineChart>
      </ChartContainer>
      <figcaption>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {present.map((kind) => (
            <li key={kind} className="flex items-center gap-1.5">
              <KindLegendMark kind={kind} />
              {t(`debts.history.kind.${kind}`)}
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  )
}
