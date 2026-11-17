import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  LABEL_BAND,
  layoutMoneyFlow,
  NOT_ASSIGNED,
  type LayoutLink,
  type LayoutNode,
  type MoneyFlow,
} from '@/features/money-flow/money-flow-model'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

/** The app's palette (D-405), by slot; 0 is the neutral of "not assigned" and extra accounts. */
const FILL = [
  'fill-muted-foreground',
  'fill-chart-1',
  'fill-chart-2',
  'fill-chart-3',
  'fill-chart-4',
  'fill-chart-5',
]
const STROKE = [
  'stroke-muted-foreground',
  'stroke-chart-1',
  'stroke-chart-2',
  'stroke-chart-3',
  'stroke-chart-4',
  'stroke-chart-5',
]

/** The width the diagram has, followed as the window changes (a phone, a desktop). */
function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => {
      const next = Math.round(element.getBoundingClientRect().width)
      if (next > 0) setWidth(next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return { ref, width }
}

/** A label cut to what fits beside its column (the table carries every full name). */
function fit(text: string, room: number, size: number): string {
  const max = Math.max(4, Math.floor(room / (size * 0.56)))
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

function bandPath(link: LayoutLink, bottom: number, index: number): string {
  if (!link.back) {
    const mid = (link.x0 + link.x1) / 2
    return `M${link.x0},${link.y0} C${mid},${link.y0} ${mid},${link.y1} ${link.x1},${link.y1}`
  }
  // Money sent back to an account further left: a loop under the diagram.
  const y = bottom - 12 - index * 8
  return `M${link.x0},${link.y0} C${link.x0 + 40},${link.y0} ${link.x0 + 40},${y} ${link.x0},${y} L${link.x1},${y} C${link.x1 - 40},${y} ${link.x1 - 40},${link.y1} ${link.x1},${link.y1}`
}

/**
 * The money flow of a period as a Sankey-style diagram (R-ACCOUNT-006): incomes into their
 * accounts (or "not assigned"), transfers between accounts at their monthly share, and what
 * stays on each account, as get_money_flow gives them. Drawn in SVG by the app (D-503) so that
 * it reads on a phone: labels above the bars, one scale for all, the palette of the charts.
 * One named image; the table beside it carries every figure.
 */
// R-ACCOUNT-235: every figure drawn and labelled is the database's.
export function MoneyFlowDiagram({ flow, title }: { flow: MoneyFlow; title: string }) {
  const { t } = useTranslation()
  const { ref, width } = useWidth(720)
  const id = useId()
  const layout = layoutMoneyFlow(flow, { width, barHeight: width < 480 ? 220 : 300 })
  // Each label starts over its bar and has its column's room to the right (D-503).
  const room = layout.span - 12
  const small = width < 480
  const nameSize = small ? 12 : 13
  const valueSize = small ? 11 : 12
  const backs = layout.links.filter((link) => link.back)
  const scrolls = layout.width > width + 1

  const nodeName = (node: LayoutNode) =>
    node.kind === 'not_assigned' ? t('moneyFlow.notAssigned') : node.name
  // Under an income its amount; under an account what the plan leaves on it (negative: short).
  const nodeValue = (node: LayoutNode) =>
    node.kind === 'income' ? formatMoney(node.value) : formatMoney(node.stays)

  return (
    <div ref={ref} className="w-full" data-testid="money-flow-diagram">
      <div
        className={scrolls ? 'overflow-x-auto pb-2' : undefined}
        role={scrolls ? 'region' : undefined}
        aria-label={scrolls ? t('moneyFlow.scrollFrame') : undefined}
        tabIndex={scrolls ? 0 : undefined}
      >
        <svg
          role="img"
          aria-labelledby={`${id}-title`}
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="block overflow-visible"
        >
          <title id={`${id}-title`}>{title}</title>
          <defs>
            <pattern
              id={`${id}-short`}
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" className="fill-destructive/10" />
              <line x1="0" y1="0" x2="0" y2="6" className="stroke-destructive" strokeWidth="2" />
            </pattern>
          </defs>
          <g fill="none">
            {[...layout.links]
              .sort((a, b) => b.width - a.width)
              .map((link) => (
                <path
                  key={link.id}
                  d={bandPath(link, layout.height, backs.indexOf(link))}
                  strokeWidth={link.width}
                  className={cn(
                    STROKE[link.color],
                    'opacity-35 transition-opacity hover:opacity-70 dark:opacity-45',
                  )}
                  data-testid="flow-band"
                >
                  <title>
                    {link.kind === 'income'
                      ? t('moneyFlow.bandIncome', {
                          name: link.name,
                          amount: formatMoney(link.value),
                        })
                      : t('moneyFlow.bandTransfer', {
                          name: link.name,
                          amount: formatMoney(link.value),
                        })}
                  </title>
                </path>
              ))}
          </g>
          {layout.nodes.map((node) => {
            const covered = node.negative ? node.inflow * (node.height / node.value) : node.height
            const staysHeight =
              node.kind === 'account' && node.outflow > 0 && node.stays > 0
                ? node.height * (node.stays / node.value)
                : 0
            return (
              <g key={node.id} data-testid="flow-node" data-node={node.id}>
                <title>
                  {`${nodeName(node)}: ${node.kind === 'income' ? formatMoney(node.value) : t('moneyFlow.nodeTitle', { in: formatMoney(node.inflow), out: formatMoney(node.outflow), stays: formatMoney(node.stays) })}`}
                </title>
                {staysHeight > 0 && (
                  <rect
                    x={node.x + layout.nodeWidth}
                    y={node.y + node.height - staysHeight}
                    width={small ? 12 : 22}
                    height={staysHeight}
                    className={cn(FILL[node.color], 'opacity-20')}
                  />
                )}
                <rect
                  x={node.x}
                  y={node.y}
                  width={layout.nodeWidth}
                  height={Math.max(covered, 1)}
                  rx={3}
                  className={FILL[node.color]}
                />
                {node.negative && (
                  <rect
                    x={node.x}
                    y={node.y + covered}
                    width={layout.nodeWidth}
                    height={node.height - covered}
                    rx={2}
                    fill={`url(#${id}-short)`}
                    className="stroke-destructive"
                    strokeWidth={1}
                  />
                )}
                <text
                  x={node.x}
                  y={node.y - LABEL_BAND + nameSize + 4}
                  textAnchor="start"
                  className="fill-foreground font-medium"
                  fontSize={nameSize}
                  paintOrder="stroke"
                  stroke="var(--card)"
                  strokeWidth={3}
                >
                  {fit(nodeName(node), room, nameSize)}
                </text>
                <text
                  data-testid="flow-node-value"
                  x={node.x}
                  y={node.y - 6}
                  textAnchor="start"
                  className={cn(
                    'tabular-nums',
                    node.negative ? 'fill-destructive font-medium' : 'fill-muted-foreground',
                  )}
                  fontSize={valueSize}
                  paintOrder="stroke"
                  stroke="var(--card)"
                  strokeWidth={3}
                >
                  {(node.negative ? '⚠ ' : '') + fit(nodeValue(node), room, valueSize)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      {layout.nodes.some((node) => node.id === NOT_ASSIGNED) && (
        <p className="mt-2 text-xs text-muted-foreground">{t('moneyFlow.notAssignedHelp')}</p>
      )}
    </div>
  )
}
