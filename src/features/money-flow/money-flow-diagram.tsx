import { TriangleAlertIcon } from 'lucide-react'
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
  slotColor,
  useNodeText,
  type NodeText,
} from '@/features/money-flow/money-flow-words'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

/** Below this width the flow runs top to bottom (a phone, or a narrow column). */
export const SIDEWAYS_MIN = 600
/** A column narrower than this would cut its labels: the flow runs top to bottom then. */
const COLUMN_MIN = 150
const NODE = 14
const LABEL_BAND = 48
/** A label with a warning keeps its figure on one line and its warning on two. */
const WARNING_BAND = 78
const bandOf = (node: FlowNode) => (node.warning ? WARNING_BAND : LABEL_BAND)
const BAR_ROOM = 320
const BAND_GAP = 52

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
  /** The cross axis: 'y' (a desktop) or 'x' (a phone). */
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
    })
  }
  return (
    <g>
      {solid > 0 && rect(0, Math.max(solid, 2), { rx: 2, fill: nodeColor(node) })}
      {node.setAside &&
        solid > 0 &&
        rect(0, Math.max(solid, 2), { fill: `url(#${patterns}-stripes)` })}
      {node.kind === 'not_assigned' && rect(0, shown, { fill: `url(#${patterns}-dots)` })}
      {long - solid > 0.5 &&
        rect(solid, long - solid, {
          fill: `url(#${patterns}-short)`,
          stroke: 'var(--destructive)',
          strokeWidth: 1,
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

function Label({ text, node, patterns }: { text: NodeText; node: FlowNode; patterns: string }) {
  return (
    <div className="flex min-w-0 items-start gap-1.5" data-testid="flow-label" data-node={node.id}>
      <Swatch node={node} patterns={patterns} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[13px] leading-tight font-medium" title={text.name}>
          {text.name}
        </span>
        <span
          className={cn(
            'text-xs leading-snug tabular-nums',
            text.warning ? 'font-medium text-destructive' : 'text-muted-foreground',
          )}
          data-testid="flow-node-value"
        >
          {text.figure}
          {text.warning && (
            <span className="flex items-start gap-1">
              <TriangleAlertIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
              {text.warning}
            </span>
          )}
        </span>
      </div>
    </div>
  )
}

function tierTitles(t: TFunction, layout: FlowLayout, basis: Basis): string[] {
  return Array.from({ length: layout.tiers }, (_, tier) =>
    tier === 0
      ? t('moneyFlow.tier.incomes')
      : tier === 1
        ? t('moneyFlow.tier.accounts')
        : tier < layout.poolTier
          ? t('moneyFlow.tier.accountsNext')
          : tier === layout.poolTier
            ? t('moneyFlow.tier.pool')
            : t(`moneyFlow.tier.destinations.${basis}`),
  )
}

/** "And n more…" under a tier whose smaller items are not drawn. */
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

/**
 * The money flow of a period (R-ACCOUNT-006, R-ACCOUNT-422): incomes into their accounts, the
 * transfers between them, what stays spendable and what is set aside, and the spending by
 * category group, planned or actual. Drawn in SVG by the app (D-503, D-545): top to bottom on a
 * phone, left to right on a desktop; labels are HTML (they wrap, carry their word, never
 * collide); one scale for every bar and band; colours that follow the record. One named image;
 * the tables below carry every figure.
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
  const sideways = width >= SIDEWAYS_MIN && width / probe.tiers >= COLUMN_MIN
  const layout = sideways
    ? layoutFlow(flow, {
        basis,
        cross: BAR_ROOM,
        gap: 14,
        labelBand: bandOf,
        gapsInside: false,
      })
    : layoutFlow(flow, { basis, cross: Math.max(120, width - 2), gap: 6 })
  const loops = layout.links.filter((link) => link.back)
  const titleId = `${id}-title`

  return (
    <figure className="flex min-w-0 flex-col gap-4" data-testid="money-flow-diagram">
      <figcaption id={titleId} className="sr-only">
        {title}
      </figcaption>
      <Patterns id={patterns} />
      <div
        ref={ref}
        role="img"
        aria-labelledby={titleId}
        className="w-full min-w-0"
        data-orientation={sideways ? 'sideways' : 'downwards'}
      >
        {sideways ? (
          <Sideways
            layout={layout}
            width={width}
            patterns={patterns}
            describe={describe}
            titles={tierTitles(t, layout, basis)}
          />
        ) : (
          <Downwards
            layout={layout}
            width={width}
            patterns={patterns}
            describe={describe}
            titles={tierTitles(t, layout, basis)}
          />
        )}
      </div>
      {sideways &&
        Array.from({ length: layout.tiers }, (_, tier) => hiddenNote(t, layout, tier))
          .filter((note): note is string => note !== null)
          .map((note) => (
            <p key={note} className="text-xs text-muted-foreground" data-testid="flow-more">
              {note}
            </p>
          ))}
      <Key
        layout={layout}
        basis={basis}
        patterns={patterns}
        loops={loops}
        accountName={accountName}
      />
    </figure>
  )
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

/** Left to right: one column per tier, each label in its column's room above its bar. */
function Sideways({
  layout,
  width,
  patterns,
  describe,
  titles,
}: {
  layout: FlowLayout
  width: number
  patterns: string
  describe: (node: FlowNode) => NodeText
  titles: string[]
}) {
  const { t } = useTranslation()
  const span = width / layout.tiers
  const x = (tier: number) => tier * span
  const loops = layout.links.filter((link) => link.back)
  const top = 28
  const height = top + layout.extent + (loops.length > 0 ? 24 + loops.length * 12 : 8)
  const bottom = top + layout.extent + 14
  const path = (link: FlowLink, index: number) => {
    const [first, ...rest] = link.points
    if (!first) return ''
    if (link.back) {
      const last = link.points.at(-1)
      if (!last) return ''
      const x0 = x(first.tier) + NODE
      const x1 = x(last.tier)
      const y = bottom + index * 12
      return `M${x0},${top + first.at} C${x0 + 40},${top + first.at} ${x0 + 40},${y} ${x0},${y} L${x1},${y} C${x1 - 40},${y} ${x1 - 40},${top + last.at} ${x1},${top + last.at}`
    }
    let d = `M${x(first.tier) + NODE},${top + first.at}`
    let prev = first
    rest.forEach((point, at) => {
      const sx = x(prev.tier) + NODE
      const ex = x(point.tier)
      const mid = (sx + ex) / 2
      d += ` C${mid},${top + prev.at} ${mid},${top + point.at} ${ex},${top + point.at}`
      if (at < rest.length - 1) d += ` L${ex + NODE},${top + point.at}`
      prev = point
    })
    return d
  }
  return (
    <div className="relative w-full" style={{ height }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="absolute inset-0 block"
        aria-hidden
      >
        <g fill="none">
          {[...layout.links]
            .sort((a, b) => b.width - a.width)
            .map((link) => (
              <path
                key={link.id}
                d={path(link, loops.indexOf(link))}
                stroke={linkColor(link)}
                strokeWidth={Math.max(link.width, 1)}
                strokeDasharray={link.back ? '6 4' : undefined}
                className="opacity-40 transition-opacity hover:opacity-70 dark:opacity-50"
                data-testid="flow-band"
                data-link={link.id}
              >
                <title>{bandTitle(t, link)}</title>
              </path>
            ))}
        </g>
        {layout.nodes.map((node) => (
          <g key={node.id} data-testid="flow-node" data-node={node.id}>
            <Bar
              node={node}
              patterns={patterns}
              x={x(node.tier)}
              y={top + node.pos}
              long={node.size}
              thick={NODE}
              along="y"
            />
          </g>
        ))}
      </svg>
      {titles.map((title, tier) => (
        <p
          key={tier}
          className="absolute truncate text-xs font-medium tracking-wide text-muted-foreground uppercase"
          style={{ left: x(tier), top: 0, width: span - 12 }}
        >
          {title}
        </p>
      ))}
      {layout.nodes.map((node) => (
        <div
          key={node.id}
          className="absolute"
          style={{ left: x(node.tier), top: top + node.pos - bandOf(node) + 2, width: span - 12 }}
        >
          {/* On the card's colour: a band passing under a label never runs through its text. */}
          <div className="w-fit max-w-full rounded-md bg-card/90 py-0.5 pr-1.5">
            <ClampedLabel text={describe(node)} node={node} patterns={patterns} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** A label in a fixed band: the figure keeps two lines at most (the tables carry it whole). */
function ClampedLabel({
  text,
  node,
  patterns,
}: {
  text: NodeText
  node: FlowNode
  patterns: string
}) {
  return (
    <div className="flex min-w-0 items-start gap-1.5" data-testid="flow-label" data-node={node.id}>
      <Swatch node={node} patterns={patterns} />
      <div
        className="flex min-w-0 flex-col"
        title={[text.name, text.figure, text.warning].filter(Boolean).join(' · ')}
      >
        <span className="truncate text-[13px] leading-tight font-medium">{text.name}</span>
        <span
          className={cn(
            'text-xs leading-snug tabular-nums',
            text.warning
              ? 'truncate font-medium text-destructive'
              : 'line-clamp-2 text-muted-foreground',
          )}
          data-testid="flow-node-value"
        >
          {text.figure}
          {text.warning && (
            <span className="flex items-start gap-1 whitespace-normal">
              <TriangleAlertIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
              <span className="line-clamp-2">{text.warning}</span>
            </span>
          )}
        </span>
      </div>
    </div>
  )
}

/** Top to bottom: each tier a row of bars, its labels as a list under it, bands downwards. */
function Downwards({
  layout,
  width,
  patterns,
  describe,
  titles,
}: {
  layout: FlowLayout
  width: number
  patterns: string
  describe: (node: FlowNode) => NodeText
  titles: string[]
}) {
  const { t } = useTranslation()
  const bar = 12
  const left = Math.max(0, (width - layout.extent) / 2)
  const links = layout.links.filter((link) => !link.back)
  return (
    <div className="flex flex-col">
      {Array.from({ length: layout.tiers }, (_, tier) => {
        const nodes = layout.nodes.filter((node) => node.tier === tier)
        const lanes = layout.lanes.filter((lane) => lane.tier === tier)
        const laneColor = (link: string) => {
          const found = links.find((item) => item.id === link)
          return found ? linkColor(found) : 'var(--flow-pool)'
        }
        const note = hiddenNote(t, layout, tier)
        const segments = links.flatMap((link) =>
          link.points.slice(0, -1).flatMap((point, at) => {
            const next = link.points[at + 1]
            return point.tier === tier && next ? [{ link, from: point.at, to: next.at }] : []
          }),
        )
        if (nodes.length === 0 && lanes.length === 0) return null
        return (
          <Fragment key={tier}>
            <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {titles[tier]}
            </p>
            <svg width={width} height={bar} className="block" aria-hidden>
              {lanes.map((lane) => (
                <rect
                  key={lane.link}
                  x={left + lane.pos}
                  y={0}
                  width={lane.size}
                  height={bar}
                  fill={laneColor(lane.link)}
                  className="opacity-40 dark:opacity-50"
                />
              ))}
              {nodes.map((node) => (
                <g key={node.id} data-testid="flow-node" data-node={node.id}>
                  <Bar
                    node={node}
                    patterns={patterns}
                    x={left + node.pos}
                    y={0}
                    long={node.size}
                    thick={bar}
                    along="x"
                  />
                </g>
              ))}
            </svg>
            <div className="relative py-2">
              {lanes.map((lane) => (
                <div
                  key={lane.link}
                  aria-hidden
                  className="absolute inset-y-0 opacity-40 dark:opacity-50"
                  style={{
                    left: left + lane.pos,
                    width: lane.size,
                    background: laneColor(lane.link),
                  }}
                />
              ))}
              {nodes.length > 0 && (
                <ul className="relative flex flex-wrap gap-x-2 gap-y-1.5">
                  {nodes.map((node) => (
                    <li
                      key={node.id}
                      className="max-w-full min-w-0 rounded-md bg-card/90 px-1.5 py-0.5"
                    >
                      <Label text={describe(node)} node={node} patterns={patterns} />
                    </li>
                  ))}
                </ul>
              )}
              {note && (
                <p
                  className="relative mt-1 rounded-md bg-card/90 px-1.5 text-xs text-muted-foreground"
                  data-testid="flow-more"
                >
                  {note}
                </p>
              )}
            </div>
            {tier < layout.tiers - 1 && (
              <svg width={width} height={BAND_GAP} className="block" aria-hidden>
                <g fill="none">
                  {segments.map(({ link, from, to }) => {
                    const a = left + from
                    const b = left + to
                    return (
                      <path
                        key={`${link.id}-${tier}`}
                        d={`M${a},0 C${a},${BAND_GAP / 2} ${b},${BAND_GAP / 2} ${b},${BAND_GAP}`}
                        stroke={linkColor(link)}
                        strokeWidth={Math.max(link.width, 1)}
                        className="opacity-40 dark:opacity-50"
                        data-testid="flow-band"
                        data-link={link.id}
                      >
                        <title>{bandTitle(t, link)}</title>
                      </path>
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

/** What every swatch, pattern and band means; only the ones drawn. */
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
        {loops.length > 0 && (
          <li className="flex items-start gap-1.5 sm:col-span-2" data-key="loop">
            <svg width="14" height="14" className="mt-0.5 shrink-0" aria-hidden>
              <line
                x1="0"
                y1="7"
                x2="14"
                y2="7"
                stroke="var(--flow-pool)"
                strokeWidth="3"
                strokeDasharray="4 2"
              />
            </svg>
            <span className="text-muted-foreground">
              {t('moneyFlow.key.loop')}{' '}
              {loops
                .map((link) =>
                  t('moneyFlow.key.loopItem', {
                    name: link.name,
                    from: accountName(link.source),
                    to: accountName(link.target),
                    amount: formatMoney(link.value),
                  }),
                )
                .join('; ')}
            </span>
          </li>
        )}
      </ul>
      <p className="text-muted-foreground">{t('moneyFlow.key.scale')}</p>
      {layout.idle.length > 0 && (
        <p className="text-muted-foreground">
          {t('moneyFlow.key.idle', { names: layout.idle.join(', ') })}
        </p>
      )}
    </div>
  )
}
