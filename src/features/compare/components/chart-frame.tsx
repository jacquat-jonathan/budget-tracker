import { useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { axisMoney } from '@/features/compare/compare-format'
import { BandContext, LABEL_PX, tickIndexes } from '@/features/compare/components/chart-ticks'

/** Space above the plot (for the "Running" label) and the x axis's own height (two lines). */
export const PLOT_TOP = 20
export const X_AXIS_HEIGHT = 36

export interface ValueAxis {
  ticks: number[]
  decimals: boolean
}

/**
 * A comparison chart's frame (R-COMPARE-282). Every period gets at least `minBand` pixels:
 * when the range fits, the chart takes the width; when it does not (a phone, 24 periods on a
 * tablet), the chart scrolls inside its own frame while the value axis stays pinned outside
 * it. The frame then shows whole periods only: its width is divided into as many periods as
 * fit, it opens on the newest ones, says that earlier ones are to the left, and can be
 * focused and scrolled with the arrow keys. The value axis is scaled to the periods in view
 * (`axisFor(from, to)`, to excluded), so a scrolled chart reads like one that fits.
 */
// R-COMPARE-282: the value axis stays in view, no period cut, the frame named and reachable.
export function ChartFrame({
  count,
  minBand,
  height,
  axisFor,
  name,
  children,
}: {
  count: number
  minBand: number
  /** The chart's height in pixels (the pinned axis is laid out on it). */
  height: number
  /** The value axis for the periods from index `from` to before `to`. */
  axisFor: (from: number, to: number) => ValueAxis
  /** What the frame holds, for screen readers (the chart's own name is on the image). */
  name: string
  /** The chart, drawn on the axis of the periods in view. */
  children: (axis: ValueAxis) => ReactNode
}) {
  const { t } = useTranslation()
  const frame = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const node = frame.current
    if (!node) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const visible = width > 0 ? Math.max(1, Math.min(count, Math.floor(width / minBand))) : count
  const scrolls = visible < count
  const band = scrolls ? width / visible : 0
  // The first period in view; null: the newest ones, where the frame opens.
  const [start, setStart] = useState<number | null>(null)
  const from = scrolls ? Math.min(count - visible, Math.max(0, start ?? count - visible)) : 0
  const to = scrolls ? from + visible : count
  const axis = useMemo(() => axisFor(from, to), [axisFor, from, to])
  useLayoutEffect(() => {
    // Opens on the newest periods, on a period's edge: no period is ever cut.
    const node = frame.current
    if (node && scrolls) node.scrollLeft = (count - visible) * band
  }, [scrolls, count, visible, band])
  const [low, high] = [axis.ticks[0] ?? 0, axis.ticks.at(-1) ?? 0]
  const plot = height - PLOT_TOP - X_AXIS_HEIGHT
  const at = (tick: number) => PLOT_TOP + (high === low ? 0 : ((high - tick) / (high - low)) * plot)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-w-0">
        {/* The value axis, pinned: its labels sit on the chart's own gridlines. */}
        <div
          className="relative w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums"
          style={{ height }}
          aria-hidden
          data-testid="value-axis"
        >
          <span className="absolute top-0 right-2 font-medium">CHF</span>
          {axis.ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-2 -translate-y-1/2 whitespace-nowrap"
              style={{ top: at(tick) }}
            >
              {axisMoney(tick, axis.decimals)}
            </span>
          ))}
        </div>
        <div
          ref={frame}
          className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          data-testid="chart-frame"
          data-scrolls={scrolls || undefined}
          onScroll={(event) => {
            if (band > 0) setStart(Math.round(event.currentTarget.scrollLeft / band))
          }}
          {...(scrolls ? { tabIndex: 0, role: 'group', 'aria-label': name } : {})}
        >
          <div style={{ width: scrolls ? band * count : '100%' }}>
            <BandContext value={scrolls ? band : width > 0 ? width / count : null}>
              {children(axis)}
            </BandContext>
          </div>
        </div>
      </div>
      {scrolls && (
        <p className="pl-16 text-xs text-muted-foreground" data-testid="chart-scrolls">
          {t('compare.scrollHint', { shown: visible, total: count })}
        </p>
      )}
    </div>
  )
}

/**
 * The x axis's tick: day and month, and the year below it where the year changes. Labels are
 * written as far apart as the periods' width needs (never touching), every year always.
 */
export function PeriodTick({
  x,
  y,
  payload,
  index,
  labels,
}: {
  x?: number
  y?: number
  payload?: { value: string }
  index?: number
  labels: ReadonlyMap<string, { dayMonth: string; year: string | null }>
}) {
  const band = useContext(BandContext)
  const shown = useMemo(
    () =>
      tickIndexes(
        [...labels.values()].map((label) => label.year !== null),
        band,
      ),
    [labels, band],
  )
  const label = payload ? labels.get(payload.value) : undefined
  if (!label || x === undefined || y === undefined) return null
  if (index !== undefined && !shown.has(index)) return null
  // The first and the last label stay inside the chart when a period is narrower than a label.
  const narrow = band !== null && band < LABEL_PX
  const edge = !narrow ? null : index === 0 ? 'start' : index === labels.size - 1 ? 'end' : null
  const at =
    edge === 'start' && band !== null
      ? x - band / 2 + 1
      : edge === 'end' && band !== null
        ? x + band / 2 - 1
        : x
  return (
    <text
      x={at}
      y={y}
      textAnchor={edge ?? 'middle'}
      fontSize={12}
      fill="var(--muted-foreground)"
      data-edge={edge ?? undefined}
    >
      <tspan x={at} dy={12}>
        {label.dayMonth}
      </tspan>
      {label.year && (
        <tspan x={at} dy={14} fontWeight={500}>
          {label.year}
        </tspan>
      )}
    </text>
  )
}
