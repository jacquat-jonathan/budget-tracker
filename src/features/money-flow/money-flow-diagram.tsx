import { ArrowRightIcon, TriangleAlertIcon } from 'lucide-react'
import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import {
  layoutFlow,
  PALETTE_SIZE,
  type Basis,
  type FlowLayout,
  type FlowLink,
  type FlowNode,
  type MoneyFlow,
} from '@/features/money-flow/money-flow-model'
import {
  groupColor,
  shortNames,
  slotColor,
  textLines,
  useNodeText,
  type NodeText,
} from '@/features/money-flow/money-flow-words'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

/** Below this width the flow runs top to bottom (a phone, a tablet beside the sidebar). */
export const SIDEWAYS_MIN = 600
/** A label beside its bar needs this much width to keep "CHF 100'000.00" and its word whole. */
export const LABEL_MIN = 104
/** A left-to-right drawing up to this much wider than the card scrolls in its own frame. */
const SCROLL_MAX = 1.5
/** The bar's thickness left to right, and the space between a bar and its label. */
const NODE = 12
const LABEL_GAP = 6
/** Between a label and the next column's bar: the bands' own room. */
const LABEL_END = 10
const BAR_ROOM = 340
/** A band thinner than this is drawn this thick, so it can be seen (geometry only). */
const MIN_BAND = 2
const NAME_PX = 13
const FIGURE_PX = 12
const NAME_LINE = 17
const FIGURE_LINE = 16.5
/** Top to bottom: the bars row, the echo of the bars over the bands, and the bands. */
const DOWN_BAR = 10
const ECHO = 3
const BAND_GAP = 44
const DOWN_LABEL_MIN = 112
/** The text halo in the card's colour: a label on a pale band reads as on the card. */
const HALO =
  '[text-shadow:0_0_2px_var(--card),0_0_2px_var(--card),0_0_3px_var(--card),0_0_4px_var(--card)]'

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

function nodeColor(node: FlowNode): string {
  switch (node.kind) {
    case 'income':
      return 'var(--chart-1)'
    case 'not_assigned':
      return 'var(--muted-foreground)'
    case 'account':
      return slotColor(node.slot)
    case 'spending':
      return groupColor(node.slot)
    default:
      return 'var(--flow-pool)'
  }
}

/** A band's colour: where it comes from; a band into a category group takes the group's. */
function linkColor(link: FlowLink): string {
  if (link.color === 'income') return 'var(--chart-1)'
  if (link.color === 'neutral') return 'var(--flow-pool)'
  return link.kind === 'spend' ? groupColor(link.slot) : slotColor(link.slot)
}

/** The fills the diagram, its labels and its key share (one set per page). */
function Patterns({ id }: { id: string }) {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden focusable="false">
      <defs>
        <pattern
          id={`${id}-stripes`}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--card)" strokeWidth="2.5" />
        </pattern>
        <pattern id={`${id}-dots`} width="5" height="5" patternUnits="userSpaceOnUse">
          <circle cx="2.5" cy="2.5" r="1.1" fill="var(--card)" />
        </pattern>
        <pattern
          id={`${id}-short`}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-45)"
        >
          <rect width="6" height="6" fill="var(--card)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--destructive)" strokeWidth="2" />
        </pattern>
      </defs>
    </svg>
  )
}

/** One bar (or a key's swatch): its colour, stripes when set aside, hatching when short. */
function Bar({
  node,
  patterns,
  x,
  y,
  long,
  thick,
  along,
}: {
  node: FlowNode
  patterns: string
  x: number
  y: number
  /** Its length on the cross axis (px) and its thickness on the main axis. */
  long: number
  thick: number
  /** The cross axis: 'y' (left to right) or 'x' (top to bottom). */
  along: 'x' | 'y'
}) {
  const solid = node.length === 0 ? long : long * Math.min(1, node.solid / node.length)
  const rect = (from: number, size: number, props: Record<string, unknown>) =>
    along === 'y' ? (
      <rect x={x} y={y + from} width={thick} height={Math.max(size, 0)} {...props} />
    ) : (
      <rect x={x + from} y={y} width={Math.max(size, 0)} height={thick} {...props} />
    )
  const shown = Math.max(long, 2)
  const outline = node.slot !== null && node.slot >= PALETTE_SIZE
  if (node.kind === 'rest') {
    return rect(0, shown, {
      rx: 2,
      fill: 'var(--card)',
      stroke: 'var(--flow-pool)',
      strokeWidth: 1.5,
      'data-part': 'solid',
    })
  }
  return (
    <g>
      {solid > 0 &&
        rect(0, Math.max(solid, 2), { rx: 2, fill: nodeColor(node), 'data-part': 'solid' })}
      {node.setAside &&
        solid > 0 &&
        rect(0, Math.max(solid, 2), { fill: `url(#${patterns}-stripes)`, 'data-part': 'stripes' })}
      {node.kind === 'not_assigned' && rect(0, shown, { fill: `url(#${patterns}-dots)` })}
      {long - solid > 0.5 &&
        rect(solid, long - solid, {
          fill: `url(#${patterns}-short)`,
          stroke: 'var(--destructive)',
          strokeWidth: 1,
          'data-part': 'hatch',
        })}
      {outline &&
        rect(0, shown, {
          fill: 'none',
          stroke: 'var(--foreground)',
          strokeWidth: 1,
          strokeDasharray: '3 2',
        })}
    </g>
  )
}

/** A key's or a label's swatch: the bar's own drawing, small. */
export function Swatch({ node, patterns }: { node: FlowNode; patterns: string }) {
  const swatch: FlowNode = {
    ...node,
    length: node.length || 1,
    solid: node.length ? node.solid : 1,
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" className="mt-0.5 shrink-0" aria-hidden>
      <Bar node={swatch} patterns={patterns} x={0} y={1} long={14} thick={12} along="x" />
    </svg>
  )
}

/**
 * A label: the name (shortened if it must be, whole in its title), then the figure with its
 * word and any warning, which wrap and are never cut.
 */
function Label({
  text,
  name,
  node,
  patterns,
  swatch,
  halo = false,
}: {
  text: NodeText
  name: string
  node: FlowNode
  patterns: string
  swatch: boolean
  halo?: boolean
}) {
  return (
    <div
      className={cn('flex min-w-0 items-start gap-1.5', halo && HALO)}
      data-testid="flow-label"
      data-node={node.id}
      title={[text.name, text.figure, text.warning].filter(Boolean).join(' · ')}
    >
      {swatch && <Swatch node={node} patterns={patterns} />}
      <div className="flex min-w-0 flex-col">
        <span
          className="overflow-hidden text-[13px] leading-[17px] font-medium whitespace-nowrap"
          data-testid="flow-node-name"
        >
          {name}
        </span>
        <span
          className={cn(
            'text-xs leading-[16.5px] tabular-nums',
            text.warning ? 'font-medium text-destructive' : 'text-muted-foreground',
          )}
          data-testid="flow-node-value"
        >
          {text.figure}
          {text.warning && (
            <span className="flex items-start gap-1" data-testid="flow-node-warning">
              <TriangleAlertIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
              <span>{text.warning}</span>
            </span>
          )}
        </span>
      </div>
    </div>
  )
}

/** How tall a label beside its bar is, wrapped in `width` (px). */
function labelHeight(text: NodeText, width: number): number {
  const figure = textLines(text.figure, width, FIGURE_PX)
  const warning = text.warning ? textLines(text.warning, width - 16, FIGURE_PX) : 0
  return NAME_LINE + (figure + warning) * FIGURE_LINE + 2
}

/** Each node's name, shortened to its label's width, never two alike (D-545). */
function useNames(nodes: FlowNode[], describe: (node: FlowNode) => NodeText, width: number) {
  const full = nodes.map((node) => describe(node).name)
  const short = shortNames(full, width, NAME_PX)
  return new Map(nodes.map((node, index) => [node.id, short[index] ?? '']))
}

/** The headings over the tiers: incomes, accounts (over all their tiers), the pool, spending. */
function tierHeads(t: TFunction, layout: FlowLayout, basis: Basis) {
  const heads: { from: number; to: number; text: string }[] = [
    { from: 0, to: 0, text: t('moneyFlow.tier.incomes') },
  ]
  if (layout.poolTier > 1)
    heads.push({ from: 1, to: layout.poolTier - 1, text: t('moneyFlow.tier.accounts') })
  heads.push({ from: layout.poolTier, to: layout.poolTier, text: t('moneyFlow.tier.pool') })
  heads.push({
    from: layout.tiers - 1,
    to: layout.tiers - 1,
    text: t(`moneyFlow.tier.destinations.${basis}`),
  })
  return heads
}

/** "And n more…" for a tier whose smaller items are not drawn. */
function hiddenNote(t: TFunction, layout: FlowLayout, tier: number): string | null {
  const { hidden } = layout
  if (tier === 0 && hidden.incomes > 0)
    return t('moneyFlow.more.incomes', { count: hidden.incomes })
  if (tier === 1 && hidden.accounts > 0)
    return t('moneyFlow.more.accounts', { count: hidden.accounts })
  if (tier === layout.tiers - 1 && hidden.destinations > 0)
    return t('moneyFlow.more.destinations', { count: hidden.destinations })
  return null
}

function bandTitle(t: TFunction, link: FlowLink): string {
  const amount = formatMoney(link.value)
  switch (link.kind) {
    case 'income':
      return t('moneyFlow.bandIncome', { name: link.name, amount })
    case 'transfer':
      return t('moneyFlow.bandTransfer', { name: link.name, amount })
    default:
      return link.name ? `${link.name}: ${amount}` : amount
  }
}

/** A band and, under it, its edge in the card's colour: neighbours are told apart by a line. */
function Band({ link, d, t, part }: { link: FlowLink; d: string; t: TFunction; part?: string }) {
  const width = Math.max(link.width, 1)
  return (
    <g
      data-testid="flow-band"
      data-link={link.id}
      data-source={link.source}
      data-target={link.target}
      data-width={width}
      data-part={part}
    >
      <path d={d} stroke="var(--card)" strokeWidth={width + 1.5} />
      <path
        d={d}
        stroke={linkColor(link)}
        strokeWidth={width}
        className="opacity-40 transition-opacity hover:opacity-70 dark:opacity-50"
      >
        <title>{bandTitle(t, link)}</title>
      </path>
    </g>
  )
}

/**
 * The money flow of a period (R-ACCOUNT-006, R-ACCOUNT-422): incomes into their accounts, the
 * transfers between them, what stays spendable and what is set aside, and the spending by
 * category group, planned or actual. Drawn in SVG by the app (D-545): left to right when every
 * column holds its labels whole beside their bars, else top to bottom; labels are HTML, carry
 * their word and never cut a figure; one scale for every bar and band; colours that follow
 * the record. One named image; the tables below carry every figure.
 */
// R-ACCOUNT-235: every figure drawn and labelled is the database's.
export function MoneyFlowDiagram({
  flow,
  basis,
  title,
  accountName,
}: {
  flow: MoneyFlow
  basis: Basis
  title: string
  accountName: (id: string) => string
}) {
  const { t } = useTranslation()
  const { ref, width } = useWidth(720)
  const id = useId().replace(/:/g, '')
  const patterns = `${id}-p`
  const describe = useNodeText(flow, basis)
  // The number of tiers does not depend on the width: one layout decides the orientation.
  const probe = layoutFlow(flow, { basis, cross: 300 })
  const labelFor = (room: number) =>
    Math.floor((room + LABEL_END) / probe.tiers - NODE - LABEL_GAP - LABEL_END)
  // R-ACCOUNT-481: left to right only where every label fits whole beside its bar; a long
  // chain a little wider than the card scrolls in its own frame rather than run downwards.
  const fits = width >= SIDEWAYS_MIN && labelFor(width) >= LABEL_MIN
  const needed = probe.tiers * (LABEL_MIN + NODE + LABEL_GAP + LABEL_END) - LABEL_END + 1
  const scrolls = !fits && width >= SIDEWAYS_MIN && needed <= width * SCROLL_MAX
  const sideways = fits || scrolls
  const drawWidth = fits ? width : needed
  const span = (drawWidth + LABEL_END) / probe.tiers
  const labelWidth = labelFor(drawWidth)
  const layout = sideways
    ? layoutFlow(flow, {
        basis,
        cross: BAR_ROOM,
        gap: 10,
        labelRoom: (node) => labelHeight(describe(node), labelWidth),
        gapsInside: false,
        minBand: MIN_BAND,
      })
    : layoutFlow(flow, { basis, cross: Math.max(120, width - 2), gap: 6, minBand: MIN_BAND })
  const loops = layout.links.filter((link) => link.back)
  const titleId = `${id}-title`
  const incomeName = (incomeId: string) => flow.incomes.find((i) => i.id === incomeId)?.name ?? ''

  return (
    <figure className="flex min-w-0 flex-col gap-4" data-testid="money-flow-diagram">
      <figcaption id={titleId} className="sr-only">
        {title}
      </figcaption>
      <Patterns id={patterns} />
      <div ref={ref} className="w-full min-w-0">
        {scrolls && (
          <p
            className="mb-2 flex items-center gap-1 text-xs text-muted-foreground"
            data-testid="flow-scroll-hint"
          >
            {t('moneyFlow.scrollHint')}
            <ArrowRightIcon className="size-3.5" aria-hidden />
          </p>
        )}
        <div
          className={cn(
            scrolls &&
              'overflow-x-auto rounded-md border pb-2 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
          )}
          {...(scrolls
            ? {
                tabIndex: 0,
                role: 'region',
                'aria-label': t('moneyFlow.scrollFrame'),
                'data-testid': 'flow-scroll-frame',
              }
            : {})}
        >
          <div
            role="img"
            aria-labelledby={titleId}
            className="min-w-0"
            style={{ width: scrolls ? drawWidth : '100%' }}
            data-orientation={sideways ? 'sideways' : 'downwards'}
          >
            {sideways ? (
              <Sideways
                layout={layout}
                width={drawWidth}
                span={span}
                labelWidth={labelWidth}
                patterns={patterns}
                describe={describe}
                basis={basis}
              />
            ) : (
              <Downwards
                layout={layout}
                width={width}
                patterns={patterns}
                describe={describe}
                basis={basis}
              />
            )}
          </div>
        </div>
      </div>
      {sideways &&
        Array.from({ length: layout.tiers }, (_, tier) => hiddenNote(t, layout, tier))
          .filter((note): note is string => note !== null)
          .map((note) => (
            <p key={note} className="text-xs text-muted-foreground" data-testid="flow-more">
              {note}
            </p>
          ))}
      {layout.unplaced.map((item) => (
        <p key={item.income} className="text-xs text-muted-foreground" data-testid="flow-unplaced">
          {t('moneyFlow.unplaced', {
            income: incomeName(item.income),
            account: accountName(item.account),
          })}
        </p>
      ))}
      {!sideways && loops.length > 0 && (
        <div className="flex flex-col gap-1 text-sm" data-testid="flow-sent-back">
          <p className="font-medium">{t('moneyFlow.sentBack.title')}</p>
          <ul className="flex flex-col gap-0.5 text-muted-foreground">
            {loops.map((link) => (
              <li key={link.id}>
                {t('moneyFlow.sentBack.item', {
                  name: link.name,
                  from: accountName(link.source),
                  to: accountName(link.target),
                  amount: formatMoney(link.value),
                })}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Key
        layout={layout}
        basis={basis}
        patterns={patterns}
        loops={sideways ? loops : []}
        accountName={accountName}
      />
    </figure>
  )
}

/**
 * Left to right: one column per tier, each bar with its label beside it in the gap to the next
 * column, as plain text with a halo over the pale bands; each bar keeps the room its label
 * needs, and bars move towards what they are joined to so bands run level.
 */
function Sideways({
  layout,
  width,
  span,
  labelWidth,
  patterns,
  describe,
  basis,
}: {
  layout: FlowLayout
  width: number
  span: number
  labelWidth: number
  patterns: string
  describe: (node: FlowNode) => NodeText
  basis: Basis
}) {
  const { t } = useTranslation()
  const x = (tier: number) => tier * span
  const loops = layout.links.filter((link) => link.back)
  const forward = layout.links.filter((link) => !link.back)
  const height = layout.extent + (loops.length > 0 ? 18 + loops.length * 16 : 4)
  const names = useNames(layout.nodes, describe, labelWidth)
  const heads = tierHeads(t, layout, basis)
  const path = (link: FlowLink) => {
    const [first, ...rest] = link.points
    if (!first) return ''
    let d = `M${x(first.tier) + NODE},${first.at}`
    let prev = first
    rest.forEach((point, at) => {
      const sx = x(prev.tier) + NODE
      const ex = x(point.tier)
      const mid = (sx + ex) / 2
      d += ` C${mid},${prev.at} ${mid},${point.at} ${ex},${point.at}`
      if (at < rest.length - 1) d += ` L${ex + NODE},${point.at}`
      prev = point
    })
    return d
  }
  const loopPath = (link: FlowLink, index: number) => {
    const first = link.points[0]
    const last = link.points.at(-1)
    if (!first || !last) return ''
    const x0 = x(first.tier) + NODE
    const x1 = x(last.tier)
    const y = layout.extent + 14 + index * 16
    return `M${x0},${first.at} C${x0 + 34},${first.at} ${x0 + 34},${y} ${x0 + 6},${y} L${x1 - 30},${y} C${x1 - 46},${y} ${x1 - 46},${last.at} ${x1 - 8},${last.at}`
  }
  return (
    <div className="flex flex-col gap-2">
      <div
        className="grid text-xs font-medium tracking-wide text-muted-foreground uppercase"
        style={{ gridTemplateColumns: `repeat(${layout.tiers}, minmax(0, 1fr))` }}
        aria-hidden
      >
        {heads.map((head) => (
          <p
            key={head.from}
            className="pr-3"
            style={{ gridColumn: `${head.from + 1} / ${head.to + 2}` }}
            data-testid="flow-tier-title"
          >
            {head.text}
          </p>
        ))}
      </div>
      <div className="relative w-full" style={{ height }}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="absolute inset-0 block overflow-visible"
          aria-hidden
        >
          <defs>
            {loops.map((link) => (
              <marker
                key={link.id}
                id={`${patterns}-arrow-${link.id}`}
                viewBox="0 0 10 10"
                refX="1"
                refY="5"
                markerWidth="9"
                markerHeight="9"
                markerUnits="userSpaceOnUse"
                orient="auto"
              >
                <path d="M0,0 L10,5 L0,10 z" fill={linkColor(link)} />
              </marker>
            ))}
          </defs>
          <g fill="none">
            {[...forward]
              .sort((a, b) => b.width - a.width)
              .map((link) => (
                <Band key={link.id} link={link} d={path(link)} t={t} />
              ))}
            {loops.map((link, index) => (
              <g
                key={link.id}
                data-testid="flow-band"
                data-link={link.id}
                data-source={link.source}
                data-target={link.target}
                data-part="return"
              >
                <path
                  d={loopPath(link, index)}
                  stroke={linkColor(link)}
                  strokeWidth={Math.max(link.width, MIN_BAND)}
                  strokeDasharray="9 6"
                  markerEnd={`url(#${patterns}-arrow-${link.id})`}
                  className="opacity-60 dark:opacity-70"
                >
                  <title>{bandTitle(t, link)}</title>
                </path>
              </g>
            ))}
          </g>
          {layout.nodes.map((node) => (
            <g
              key={node.id}
              data-testid="flow-node"
              data-node={node.id}
              data-size={node.size}
              data-pos={node.pos}
            >
              <Bar
                node={node}
                patterns={patterns}
                x={x(node.tier)}
                y={node.pos}
                long={node.size}
                thick={NODE}
                along="y"
              />
            </g>
          ))}
        </svg>
        {layout.nodes.map((node) => {
          const text = describe(node)
          const tall = labelHeight(text, labelWidth)
          return (
            <div
              key={node.id}
              className="absolute"
              style={{
                left: x(node.tier) + NODE + LABEL_GAP,
                top: node.top + Math.max(0, (node.room - tall) / 2),
                width: labelWidth,
              }}
            >
              <Label
                text={text}
                name={names.get(node.id) ?? text.name}
                node={node}
                patterns={patterns}
                swatch={false}
                halo
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Top to bottom: each tier is a row of bars (a band that skips the tier passes as a pale part
 * of the row), then its labels on the plain card, in the bars' order and under them where
 * there is room, then the bands to the next tier, starting with a thin echo of the bars.
 */
function Downwards({
  layout,
  width,
  patterns,
  describe,
  basis,
}: {
  layout: FlowLayout
  width: number
  patterns: string
  describe: (node: FlowNode) => NodeText
  basis: Basis
}) {
  const { t } = useTranslation()
  const left = Math.max(0, (width - layout.extent) / 2)
  const links = layout.links.filter((link) => !link.back)
  const columns = Math.max(1, Math.min(4, Math.floor((width + 8) / (DOWN_LABEL_MIN + 8))))
  const column = (width - (columns - 1) * 8) / columns
  const names = useNames(layout.nodes, describe, column - 20)
  const heads = new Map(tierHeads(t, layout, basis).map((head) => [head.from, head.text]))
  const laneColor = (link: string) => {
    const found = links.find((item) => item.id === link)
    return found ? linkColor(found) : 'var(--flow-pool)'
  }
  return (
    <div className="flex flex-col">
      {Array.from({ length: layout.tiers }, (_, tier) => {
        const nodes = layout.nodes
          .filter((node) => node.tier === tier)
          .sort((a, b) => a.pos - b.pos)
        const lanes = layout.lanes.filter((lane) => lane.tier === tier)
        const note = hiddenNote(t, layout, tier)
        const segments = links.flatMap((link) =>
          link.points.slice(0, -1).flatMap((point, at) => {
            const next = link.points[at + 1]
            return point.tier === tier && next ? [{ link, from: point.at, to: next.at }] : []
          }),
        )
        if (nodes.length === 0 && lanes.length === 0) return null
        // Labels in the bars' order, each in the column under its bar when that is still free.
        let row = 1
        let cursor = 0
        const placed = nodes.map((node) => {
          const wanted = Math.min(
            columns - 1,
            Math.max(0, Math.floor((left + node.pos + node.size / 2) / (column + 8))),
          )
          let at = Math.max(cursor, wanted)
          if (at >= columns) {
            row += 1
            at = wanted
          }
          cursor = at + 1
          return { node, row, column: at }
        })
        const lanesRow = (height: number, y = 0) =>
          lanes.map((lane) => (
            <rect
              key={lane.link}
              x={left + lane.pos}
              y={y}
              width={lane.size}
              height={height}
              fill={laneColor(lane.link)}
              className="opacity-40 dark:opacity-50"
              data-testid="flow-lane"
              data-link={lane.link}
            />
          ))
        return (
          <Fragment key={tier}>
            {heads.has(tier) && (
              <p
                className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase"
                data-testid="flow-tier-title"
              >
                {heads.get(tier)}
              </p>
            )}
            <svg width={width} height={DOWN_BAR} className="block" aria-hidden>
              {lanesRow(DOWN_BAR)}
              {nodes.map((node) => (
                <g
                  key={node.id}
                  data-testid="flow-node"
                  data-node={node.id}
                  data-size={node.size}
                  data-pos={node.pos}
                >
                  <Bar
                    node={node}
                    patterns={patterns}
                    x={left + node.pos}
                    y={0}
                    long={node.size}
                    thick={DOWN_BAR}
                    along="x"
                  />
                </g>
              ))}
            </svg>
            {nodes.length > 0 && (
              <ul
                className="grid gap-x-2 gap-y-2 pt-2 pb-2"
                style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
              >
                {placed.map(({ node, row: line, column: at }) => (
                  <li
                    key={node.id}
                    className="min-w-0"
                    style={{ gridRow: line, gridColumn: at + 1 }}
                  >
                    <Label
                      text={describe(node)}
                      name={names.get(node.id) ?? ''}
                      node={node}
                      patterns={patterns}
                      swatch
                    />
                  </li>
                ))}
              </ul>
            )}
            {nodes.length === 0 && <div className="h-2" />}
            {note && (
              <p className="mb-2 text-xs text-muted-foreground" data-testid="flow-more">
                {note}
              </p>
            )}
            {tier < layout.tiers - 1 && (
              <svg width={width} height={ECHO + BAND_GAP} className="block" aria-hidden>
                {lanesRow(ECHO)}
                {nodes.map((node) => (
                  <rect
                    key={node.id}
                    x={left + node.pos}
                    y={0}
                    width={Math.max(node.size, 2)}
                    height={ECHO}
                    fill={node.kind === 'rest' ? 'var(--flow-pool)' : nodeColor(node)}
                    data-testid="flow-echo"
                  />
                ))}
                <g fill="none">
                  {segments
                    .sort((a, b) => b.link.width - a.link.width)
                    .map(({ link, from, to }) => {
                      const a = left + from
                      const b = left + to
                      const top = ECHO
                      const bottom = ECHO + BAND_GAP
                      const mid = (top + bottom) / 2
                      return (
                        <Band
                          key={`${link.id}-${tier}`}
                          link={link}
                          d={`M${a},${top} C${a},${mid} ${b},${mid} ${b},${bottom}`}
                          t={t}
                        />
                      )
                    })}
                </g>
              </svg>
            )}
          </Fragment>
        )
      })}
    </div>
  )
}

/** What every swatch, pattern and band drawn here means, and nothing else. */
function Key({
  layout,
  basis,
  patterns,
  loops,
  accountName,
}: {
  layout: FlowLayout
  basis: Basis
  patterns: string
  loops: FlowLink[]
  accountName: (id: string) => string
}) {
  const { t } = useTranslation()
  const kinds = new Set(layout.nodes.map((node) => node.kind))
  const sample = (fields: Partial<FlowNode>): FlowNode => ({
    id: 'key',
    kind: 'account',
    name: '',
    tier: 0,
    solid: 1,
    length: 1,
    pos: 0,
    size: 0,
    top: 0,
    room: 0,
    slot: 0,
    setAside: false,
    warning: false,
    ...fields,
  })
  const entries: { key: string; node: FlowNode; text: ReactNode }[] = []
  if (kinds.has('income'))
    entries.push({
      key: 'income',
      node: sample({ kind: 'income', slot: null }),
      text: t('moneyFlow.key.income'),
    })
  if (layout.nodes.some((node) => node.kind === 'account' && !node.setAside))
    entries.push({ key: 'account', node: sample({}), text: t('moneyFlow.key.account') })
  if (layout.nodes.some((node) => node.kind === 'account' && node.setAside))
    entries.push({
      key: 'setAsideAccount',
      node: sample({ setAside: true, slot: 1 }),
      text: t('moneyFlow.key.setAsideAccount'),
    })
  if (kinds.has('not_assigned'))
    entries.push({
      key: 'notAssigned',
      node: sample({ kind: 'not_assigned', slot: null }),
      text: t('moneyFlow.key.notAssigned'),
    })
  if (kinds.has('spendable'))
    entries.push({
      key: 'spendable',
      node: sample({ kind: 'spendable', slot: null }),
      text: t('moneyFlow.key.spendable'),
    })
  if (kinds.has('set_aside'))
    entries.push({
      key: 'setAside',
      node: sample({ kind: 'set_aside', slot: null, setAside: true }),
      text: t('moneyFlow.key.setAside'),
    })
  if (kinds.has('spending'))
    entries.push({
      key: 'group',
      node: sample({ kind: 'spending', slot: 2 }),
      text: t(`moneyFlow.key.group.${basis}`),
    })
  if (kinds.has('rest'))
    entries.push({
      key: 'rest',
      node: sample({ kind: 'rest', slot: null }),
      text: t(`moneyFlow.key.rest.${basis}`),
    })
  if (layout.nodes.some((node) => node.length - node.solid > 0))
    entries.push({
      key: 'short',
      node: sample({ solid: 0, length: 1, slot: null, kind: 'spendable' }),
      text: t('moneyFlow.key.short'),
    })
  if (layout.nodes.some((node) => node.slot !== null && node.slot >= PALETTE_SIZE))
    entries.push({
      key: 'repeat',
      node: sample({ slot: PALETTE_SIZE }),
      text: t('moneyFlow.key.repeat'),
    })
  const thicker = layout.links.some((link) => link.width > link.value * layout.scale + 0.01)
  return (
    <div className="flex flex-col gap-2 border-t pt-3 text-xs" data-testid="money-flow-key">
      <p className="font-medium">{t('moneyFlow.key.title')}</p>
      <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {entries.map((entry) => (
          <li key={entry.key} className="flex items-start gap-1.5" data-key={entry.key}>
            <Swatch node={entry.node} patterns={patterns} />
            <span className="text-muted-foreground">{entry.text}</span>
          </li>
        ))}
        {loops.map((link) => (
          <li key={link.id} className="flex items-start gap-1.5 sm:col-span-2" data-key="loop">
            <svg width="14" height="14" className="mt-0.5 shrink-0" aria-hidden>
              <line
                x1="0"
                y1="7"
                x2="9"
                y2="7"
                stroke={linkColor(link)}
                strokeWidth="3"
                strokeDasharray="3 2"
              />
              <path d="M8,3 L14,7 L8,11 z" fill={linkColor(link)} />
            </svg>
            <span className="text-muted-foreground">
              {t('moneyFlow.key.loop', {
                name: link.name,
                from: accountName(link.source),
                to: accountName(link.target),
                amount: formatMoney(link.value),
              })}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">
        {t('moneyFlow.key.scale')} {t('moneyFlow.key.colour')}
        {thicker && <> {t('moneyFlow.key.thicker')}</>}
      </p>
      {layout.idle.length > 0 && (
        <p className="text-muted-foreground">
          {t('moneyFlow.key.idle', { names: layout.idle.join(', ') })}
        </p>
      )}
    </div>
  )
}
