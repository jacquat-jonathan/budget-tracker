import type { Database } from '@/lib/database.types'

type Row = Database['public']['Functions']['get_money_flow']['Returns'][number]
export type AccountKind = Database['public']['Enums']['account_kind']

/** Planned (the plan of the period) or actual (what its transactions spent): `?basis=actual`. */
export type Basis = 'planned' | 'actual'

export interface FlowIncome {
  id: string
  name: string
  amount: number
  target: string | null
  userId: string | null
}

export interface FlowAccount {
  id: string
  name: string
  kind: AccountKind
  userId: string | null
  inflow: number
  outflow: number
  stays: number
  negative: boolean
  /** What stays is spendable (an everyday account), else set aside (R-ACCOUNT-423). */
  spendable: boolean
  createdAt: string | null
}

export interface FlowTransfer {
  id: string
  name: string
  source: string
  target: string
  /** The monthly share: what the plan moves in a period (R-ACCOUNT-304). */
  amount: number
  planned: number
  cadence: 'monthly' | 'quarterly' | 'yearly' | null
  automatic: boolean
}

/** One top-level category (a group, or a category without one), R-ACCOUNT-422. */
export interface FlowSpending {
  id: string
  name: string
  expected: number
  /** The monthly share of the planned transfers linked to it: drawn as transfers. */
  transferShare: number
  /** Planned spending: expected less the transfers' share. */
  amount: number
  yearly: number | null
  /** Spent in the period, less the transactions of the linked transfers. */
  spent: number
  transferSpent: number
  /** Spent more than planned. */
  negative: boolean
  displayOrder: number
}

export interface FlowTotal {
  incomes: number
  transfers: number
  setAside: number
  spendable: number
  plannedSpending: number
  notPlanned: number
  actualSpending: number
  left: number
  /** Spending rows the read left out (past 1000 rows); the totals still cover them. */
  omitted: number
}

/** get_money_flow's rows, read once: the contract's nulls said as such (D-356). */
export interface MoneyFlow {
  incomes: FlowIncome[]
  notAssigned: { inflow: number; stays: number } | null
  accounts: FlowAccount[]
  transfers: FlowTransfer[]
  spending: FlowSpending[]
  total: FlowTotal | null
}

/** The id the diagram gives the "not assigned" node (no account has it: ids are uuids). */
export const NOT_ASSIGNED = 'not-assigned'
export const SPENDABLE = 'pool:spendable'
export const SET_ASIDE = 'pool:set-aside'
export const REST = 'pool:rest'

export function readMoneyFlow(rows: readonly Row[]): MoneyFlow {
  const flow: MoneyFlow = {
    incomes: [],
    notAssigned: null,
    accounts: [],
    transfers: [],
    spending: [],
    total: null,
  }
  for (const row of rows as unknown as readonly Record<string, unknown>[]) {
    const n = (value: unknown) => (typeof value === 'number' ? value : 0)
    const s = (value: unknown) => (typeof value === 'string' ? value : null)
    switch (row.row_kind) {
      case 'income':
        flow.incomes.push({
          id: s(row.id) ?? s(row.source_id) ?? '',
          name: s(row.name) ?? '',
          amount: n(row.amount),
          target: s(row.target_id),
          userId: s(row.user_id),
        })
        break
      case 'not_assigned':
        flow.notAssigned = { inflow: n(row.inflow), stays: n(row.stays ?? row.inflow) }
        break
      case 'account':
        flow.accounts.push({
          id: s(row.id) ?? '',
          name: s(row.name) ?? '',
          kind: (s(row.account_kind) ?? 'other') as AccountKind,
          userId: s(row.user_id),
          inflow: n(row.inflow),
          outflow: n(row.outflow),
          stays: n(row.stays),
          negative: row.is_negative === true,
          spendable: row.spendable !== false,
          createdAt: s(row.created_at),
        })
        break
      case 'transfer':
        flow.transfers.push({
          id: s(row.id) ?? '',
          name: s(row.name) ?? '',
          source: s(row.source_id) ?? '',
          target: s(row.target_id) ?? '',
          amount: n(row.amount),
          planned: n(row.planned_amount ?? row.amount),
          cadence: s(row.cadence) as FlowTransfer['cadence'],
          automatic: row.is_automatic === true,
        })
        break
      case 'spending':
        flow.spending.push({
          id: s(row.id) ?? '',
          name: s(row.name) ?? '',
          expected: n(row.expected),
          transferShare: n(row.transfer_share),
          amount: n(row.amount),
          yearly: typeof row.yearly_amount === 'number' ? row.yearly_amount : null,
          spent: n(row.spent),
          transferSpent: n(row.transfer_spent),
          negative: row.is_negative === true,
          displayOrder: n(row.display_order),
        })
        break
      case 'total':
        flow.total = {
          incomes: n(row.inflow ?? row.amount),
          transfers: n(row.outflow),
          setAside: n(row.set_aside),
          spendable: n(row.spendable_amount),
          plannedSpending: n(row.planned_spending),
          notPlanned: n(row.not_planned),
          actualSpending: n(row.actual_spending),
          left: n(row.left_amount),
          omitted: n(row.spending_rows_omitted),
        }
        break
    }
  }
  return flow
}

/** The figures of a basis: what the spending and what remains are on that side. */
export function basisFigures(total: FlowTotal, basis: Basis) {
  return basis === 'planned'
    ? { spending: total.plannedSpending, rest: total.notPlanned }
    : { spending: total.actualSpending, rest: total.left }
}

/** A spending row's figure on a basis: planned spending, or what was spent. */
export function spendingValue(row: FlowSpending, basis: Basis): number {
  return basis === 'planned' ? row.amount : row.spent
}

/** How many hues the flow palette has; later slots repeat them with a dashed outline. */
export const PALETTE_SIZE = 8

/**
 * Colour slots that follow the record, never its name or rank: accounts by creation
 * (created_at, then id), so renaming recolours nothing; category groups by their display
 * order (then id). Slot n uses hue n mod 8; from the ninth on it is drawn with a dashed outline.
 */
// R-ACCOUNT-448: colours follow the record (creation, display order), never its name or rank.
export function accountSlots(accounts: readonly FlowAccount[]): Map<string, number> {
  const order = [...accounts].sort(
    (a, b) =>
      (a.createdAt ?? '').localeCompare(b.createdAt ?? '') ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
  return new Map(order.map((account, index) => [account.id, index]))
}

export function groupSlots(spending: readonly FlowSpending[]): Map<string, number> {
  const order = [...spending].sort(
    (a, b) => a.displayOrder - b.displayOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
  return new Map(order.map((row, index) => [row.id, index]))
}

export type NodeKind =
  'income' | 'not_assigned' | 'account' | 'spendable' | 'set_aside' | 'spending' | 'rest'

export interface FlowNode {
  id: string
  kind: NodeKind
  name: string
  tier: number
  /** The part of the bar the figure covers, in rappen; the rest of `length` is hatched. */
  solid: number
  /** The bar's length in rappen: at least its figure and what goes in and out of it. */
  length: number
  /** Where the bar starts on the cross axis, and its size there (px, `length * scale`). */
  pos: number
  size: number
  /** The palette slot (accounts, groups), null for the fixed colours. */
  slot: number | null
  /** A set-aside account: its bar is striped. */
  setAside: boolean
  /** Its figure is negative or short: drawn with the warning hatch, said in words. */
  warning: boolean
}

export interface FlowPoint {
  tier: number
  /** Centre of the band on the cross axis at that tier. */
  at: number
}

export interface FlowLink {
  id: string
  kind: 'income' | 'transfer' | 'stays' | 'spend' | 'rest'
  name: string
  source: string
  target: string
  value: number
  /** `value * scale`: the same factor as the bars. */
  width: number
  /** The target lies at or before its source (money sent back): drawn as a return loop. */
  back: boolean
  slot: number | null
  /** The band's colour: the income colour, an account's or a group's slot, or neutral. */
  color: 'income' | 'slot' | 'neutral'
  /** Its centre at the source, at each tier it passes through (a lane), and at the target. */
  points: FlowPoint[]
}

/** Room a band keeps in a tier it passes through, so it never crosses a bar there. */
export interface FlowLane {
  link: string
  tier: number
  pos: number
  size: number
}

export interface FlowLayout {
  tiers: number
  nodes: FlowNode[]
  links: FlowLink[]
  lanes: FlowLane[]
  /** Pixels per rappen, one factor for every bar and band. */
  scale: number
  /** The cross-axis length used (px). */
  extent: number
  /** Incomes, accounts and destinations with a figure that are not drawn (see the tables). */
  hidden: { incomes: number; accounts: number; destinations: number }
  /** Accounts in force with no planned flow: listed in the table, not drawn. */
  idle: string[]
  /** The tier of the pool (spendable / set aside) and of the destinations. */
  poolTier: number
}

/** At most this many incomes, accounts and destinations are drawn; the tables carry all. */
export const MAX_DRAWN = 8

interface Item {
  kind: 'node' | 'lane'
  id: string
  /** In rappen. */
  length: number
  node?: FlowNode
  lane?: FlowLane
}

/**
 * Where each bar and band goes, on one cross axis (x on a phone, y on a desktop) and one
 * main axis of tiers: incomes; the accounts, each one tier after the furthest drawn account
 * that sends it money (a band that closes a cycle is a return loop); the pool (what stays on
 * the spendable accounts, what is set aside); the destinations (each category group's
 * planned or spent figure, then what is not planned or left). A band that skips a tier keeps
 * a lane there. Every bar and band is its amount times one scale: only geometry is computed
 * here, never a figure (C-LOGIC-003); the largest eight of each tier are drawn.
 */
// R-ACCOUNT-235: one scale for bars and bands; every figure drawn is the database's.
export function layoutFlow(
  flow: MoneyFlow,
  {
    basis,
    cross,
    gap = 12,
    labelBand = 0,
    gapsInside = true,
  }: {
    basis: Basis
    /** The cross-axis room for bars (px). */
    cross: number
    gap?: number
    /** Room kept before each bar for its label (px; 0 when labels sit elsewhere). */
    /** Room before a bar for its label: a figure with a warning says more, so takes more. */
    labelBand?: number | ((node: FlowNode) => number)
    /** The gaps (and label bands) come out of `cross` (a phone's fixed width), else add to it. */
    gapsInside?: boolean
  },
): FlowLayout {
  const bandOf = (node: FlowNode) => (typeof labelBand === 'number' ? labelBand : labelBand(node))
  const slots = accountSlots(flow.accounts)
  const groupSlot = groupSlots(flow.spending)
  const total = flow.total
  const largest = <T>(items: T[], value: (item: T) => number, order: (item: T) => number) =>
    [...items].sort((a, b) => value(b) - value(a) || order(a) - order(b))

  // Incomes: the eight largest.
  const incomesAll = flow.incomes.filter((income) => income.amount > 0)
  const incomes = largest(
    incomesAll,
    (i) => i.amount,
    (i) => flow.incomes.indexOf(i),
  ).slice(0, MAX_DRAWN)
  // Accounts with a planned flow: the eight largest by what goes through them.
  const flowing = flow.accounts.filter((a) => a.inflow > 0 || a.outflow > 0)
  const idle = flow.accounts.filter((a) => !flowing.includes(a)).map((a) => a.name)
  const accounts = largest(
    flowing,
    (a) => Math.max(a.inflow, a.outflow),
    (a) => slots.get(a.id) ?? 0,
  ).slice(0, MAX_DRAWN)
  const drawn = new Set(accounts.map((a) => a.id))
  const notAssigned =
    flow.notAssigned && flow.notAssigned.inflow > 0 && incomes.some((i) => i.target === null)
      ? flow.notAssigned
      : null
  if (notAssigned) drawn.add(NOT_ASSIGNED)
  const transfers = flow.transfers.filter(
    (t) => t.amount > 0 && drawn.has(t.source) && drawn.has(t.target),
  )

  // Depth: the longest chain of transfers among drawn accounts; a cycle is cut where it closes.
  const depth = new Map<string, number>()
  for (const id of drawn) depth.set(id, 1)
  const outgoing = new Map<string, FlowTransfer[]>()
  for (const t of transfers) outgoing.set(t.source, [...(outgoing.get(t.source) ?? []), t])
  const back = new Set<string>()
  const state = new Map<string, 'open' | 'done'>()
  const visit = (id: string) => {
    state.set(id, 'open')
    for (const t of outgoing.get(id) ?? []) {
      const next = state.get(t.target)
      if (next === 'open') back.add(t.id)
      else if (next !== 'done') visit(t.target)
    }
    state.set(id, 'done')
  }
  const receiving = new Set(incomes.map((i) => i.target ?? NOT_ASSIGNED))
  for (const id of [...drawn].sort((a, b) => Number(receiving.has(b)) - Number(receiving.has(a)))) {
    if (!state.has(id)) visit(id)
  }
  const forward = transfers.filter((t) => !back.has(t.id))
  for (let round = 0; round <= drawn.size; round += 1) {
    let moved = false
    for (const t of forward) {
      const next = (depth.get(t.source) ?? 1) + 1
      if (next > (depth.get(t.target) ?? 1)) {
        depth.set(t.target, next)
        moved = true
      }
    }
    if (!moved) break
  }
  const accountTiers = Math.max(1, ...depth.values())
  const poolTier = accountTiers + 1
  const destTier = poolTier + 1

  const node = (
    fields: Omit<FlowNode, 'pos' | 'size' | 'warning' | 'setAside'> & Partial<FlowNode>,
  ): FlowNode => ({ pos: 0, size: 0, warning: false, setAside: false, ...fields })
  const nodes: FlowNode[] = []
  for (const income of incomes) {
    nodes.push(
      node({
        id: `income:${income.id}`,
        kind: 'income',
        name: income.name,
        tier: 0,
        solid: income.amount,
        length: income.amount,
        slot: null,
      }),
    )
  }
  if (notAssigned) {
    nodes.push(
      node({
        id: NOT_ASSIGNED,
        kind: 'not_assigned',
        name: '',
        tier: 1,
        solid: notAssigned.inflow,
        length: notAssigned.inflow,
        slot: null,
      }),
    )
  }
  for (const account of accounts) {
    nodes.push(
      node({
        id: account.id,
        kind: 'account',
        name: account.name,
        tier: depth.get(account.id) ?? 1,
        solid: account.inflow,
        length: Math.max(account.inflow, account.outflow),
        slot: slots.get(account.id) ?? 0,
        setAside: !account.spendable,
        warning: account.negative,
      }),
    )
  }

  const links: FlowLink[] = []
  const link = (fields: Omit<FlowLink, 'width' | 'points' | 'back'> & { back?: boolean }) =>
    links.push({ width: 0, points: [], back: false, ...fields })
  for (const income of incomes) {
    const target = income.target ?? NOT_ASSIGNED
    if (!drawn.has(target)) continue
    link({
      id: `income:${income.id}`,
      kind: 'income',
      name: income.name,
      source: `income:${income.id}`,
      target,
      value: income.amount,
      slot: null,
      color: 'income',
    })
  }
  for (const t of transfers) {
    link({
      id: t.id,
      kind: 'transfer',
      name: t.name,
      source: t.source,
      target: t.target,
      value: t.amount,
      back: back.has(t.id),
      slot: slots.get(t.source) ?? 0,
      color: 'slot',
    })
  }

  // The pool: what stays on the spendable accounts, and what is set aside (R-ACCOUNT-423).
  const spendableIn = [
    ...(notAssigned && notAssigned.stays > 0
      ? [{ id: NOT_ASSIGNED, value: notAssigned.stays }]
      : []),
    ...accounts
      .filter((a) => a.spendable && a.stays > 0)
      .map((a) => ({ id: a.id, value: a.stays })),
  ]
  const setAsideIn = accounts
    .filter((a) => !a.spendable && a.stays > 0)
    .map((a) => ({ id: a.id, value: a.stays }))
  const figures = total ? basisFigures(total, basis) : { spending: 0, rest: 0 }
  const spendableSolid = Math.max(0, total?.spendable ?? 0)
  // Spending above what is spendable: the bar goes on, hatched, by what is short.
  const short = Math.max(0, -figures.rest)
  const groups = flow.spending.filter((row) => spendingValue(row, basis) > 0)
  const shownGroups = new Set(
    largest(
      groups,
      (row) => spendingValue(row, basis),
      (row) => groupSlot.get(row.id) ?? 0,
    )
      .slice(0, MAX_DRAWN)
      .map((row) => row.id),
  )
  const destinations = groups.filter((row) => shownGroups.has(row.id))
  const hasPool = total !== null && (spendableIn.length > 0 || destinations.length > 0 || short > 0)
  if (hasPool) {
    for (const from of spendableIn) {
      link({
        id: `stays:${from.id}`,
        kind: 'stays',
        name: '',
        source: from.id,
        target: SPENDABLE,
        value: from.value,
        slot: from.id === NOT_ASSIGNED ? null : (slots.get(from.id) ?? 0),
        color: from.id === NOT_ASSIGNED ? 'neutral' : 'slot',
      })
    }
    for (const row of destinations) {
      link({
        id: `spend:${row.id}`,
        kind: 'spend',
        name: row.name,
        source: SPENDABLE,
        target: `group:${row.id}`,
        value: spendingValue(row, basis),
        slot: groupSlot.get(row.id) ?? 0,
        color: 'slot',
      })
      nodes.push(
        node({
          id: `group:${row.id}`,
          kind: 'spending',
          name: row.name,
          tier: destTier,
          solid: spendingValue(row, basis),
          length: spendingValue(row, basis),
          slot: groupSlot.get(row.id) ?? 0,
          warning: basis === 'actual' && row.negative,
        }),
      )
    }
    if (figures.rest > 0) {
      link({
        id: 'rest',
        kind: 'rest',
        name: '',
        source: SPENDABLE,
        target: REST,
        value: figures.rest,
        slot: null,
        color: 'neutral',
      })
      nodes.push(
        node({
          id: REST,
          kind: 'rest',
          name: '',
          tier: destTier,
          solid: figures.rest,
          length: figures.rest,
          slot: null,
        }),
      )
    }
    const sum = (list: { value: number }[]) => list.reduce((acc, item) => acc + item.value, 0)
    const out = links.filter((l) => l.source === SPENDABLE)
    nodes.push(
      node({
        id: SPENDABLE,
        kind: 'spendable',
        name: '',
        tier: poolTier,
        solid: spendableSolid,
        length: Math.max(spendableSolid + short, sum(spendableIn), sum(out)),
        slot: null,
        warning: short > 0 || total.spendable < 0,
      }),
    )
  }
  if (total !== null && (setAsideIn.length > 0 || total.setAside > 0)) {
    for (const from of setAsideIn) {
      link({
        id: `stays:${from.id}`,
        kind: 'stays',
        name: '',
        source: from.id,
        target: SET_ASIDE,
        value: from.value,
        slot: slots.get(from.id) ?? 0,
        color: 'slot',
      })
    }
    const inSum = setAsideIn.reduce((acc, item) => acc + item.value, 0)
    const solid = Math.max(0, total.setAside)
    nodes.push(
      node({
        id: SET_ASIDE,
        kind: 'set_aside',
        name: '',
        tier: poolTier,
        solid,
        length: Math.max(solid, inSum),
        slot: null,
        setAside: true,
      }),
    )
  }

  const byId = new Map(nodes.map((n) => [n.id, n]))
  for (const l of links) {
    const source = byId.get(l.source)
    const target = byId.get(l.target)
    if (source && target && target.tier <= source.tier) l.back = true
  }

  // Lanes: a forward band keeps room in every tier between its ends.
  const tiers = destTier + 1
  const items: Item[][] = Array.from({ length: tiers }, () => [])
  for (const n of nodes) items[n.tier]?.push({ kind: 'node', id: n.id, length: n.length, node: n })
  const lanes: FlowLane[] = []
  for (const l of links) {
    const from = byId.get(l.source)?.tier ?? 0
    const to = byId.get(l.target)?.tier ?? 0
    if (l.back) continue
    for (let tier = from + 1; tier < to; tier += 1) {
      const lane: FlowLane = { link: l.id, tier, pos: 0, size: 0 }
      lanes.push(lane)
      items[tier]?.push({ kind: 'lane', id: `lane:${l.id}:${tier}`, length: l.value, lane })
    }
  }

  // One scale: the fullest tier fills the room (labels and gaps apart).
  const room = (list: Item[]) =>
    gapsInside
      ? cross -
        Math.max(0, list.length - 1) * gap -
        list.reduce((acc, item) => acc + (item.node ? bandOf(item.node) : 0), 0)
      : cross
  let scale = Number.POSITIVE_INFINITY
  for (const list of items) {
    const sum = list.reduce((acc, item) => acc + item.length, 0)
    if (sum > 0) scale = Math.min(scale, Math.max(room(list), cross * 0.25) / sum)
  }
  if (!Number.isFinite(scale)) scale = 0

  // Order within a tier: by where the money comes from (fewer crossings); the incomes by
  // amount, the pool spendable first, the destinations in the categories' order.
  const centre = new Map<string, number>()
  const previousAt = (item: Item, tier: number): number => {
    if (item.lane) {
      const l = links.find((x) => x.id === item.lane?.link)
      if (!l) return Number.POSITIVE_INFINITY
      if (tier - 1 === (byId.get(l.source)?.tier ?? -1)) return centre.get(l.source) ?? 0
      return centre.get(`lane:${l.id}:${tier - 1}`) ?? 0
    }
    const incoming = links.filter((l) => l.target === item.id && !l.back)
    let weight = 0
    let sum = 0
    for (const l of incoming) {
      const from = byId.get(l.source)?.tier ?? 0
      const key = from === tier - 1 ? l.source : `lane:${l.id}:${tier - 1}`
      const at = centre.get(key) ?? centre.get(l.source)
      if (at === undefined) continue
      weight += l.value
      sum += at * l.value
    }
    return weight === 0 ? Number.POSITIVE_INFINITY : sum / weight
  }
  const extents: number[] = []
  items.forEach((list, tier) => {
    if (tier === destTier) {
      list.sort((a, b) => rank(a) - rank(b))
    } else if (tier === poolTier) {
      list.sort((a, b) => poolRank(a) - poolRank(b) || previousAt(a, tier) - previousAt(b, tier))
    } else if (tier > 0) {
      list.sort((a, b) => previousAt(a, tier) - previousAt(b, tier) || b.length - a.length)
    }
    let at = 0
    for (const item of list) {
      const size = item.length * scale
      if (item.node) {
        item.node.pos = at + bandOf(item.node)
        item.node.size = size
        at = item.node.pos + size + gap
      } else if (item.lane) {
        item.lane.pos = at
        item.lane.size = size
        at += size + gap
      }
      centre.set(item.id, (item.node?.pos ?? item.lane?.pos ?? 0) + size / 2)
    }
    extents.push(Math.max(0, at - gap))
  })
  function rank(item: Item): number {
    if (item.id === REST) return Number.MAX_SAFE_INTEGER
    const id = item.id.slice('group:'.length)
    return groupSlot.get(id) ?? 0
  }
  function poolRank(item: Item): number {
    return item.id === SPENDABLE ? 0 : item.id === SET_ASIDE ? 1 : 2
  }
  // Each tier centred on the longest.
  const extent = Math.max(0, ...extents)
  items.forEach((list, tier) => {
    const shift = (extent - (extents[tier] ?? 0)) / 2
    for (const item of list) {
      if (item.node) item.node.pos += shift
      if (item.lane) item.lane.pos += shift
    }
  })

  // Bands stack where they leave and enter a bar, in the order of their other end.
  const laneOf = new Map(lanes.map((lane) => [`${lane.link}:${lane.tier}`, lane]))
  const nextAt = (l: FlowLink) => {
    const from = byId.get(l.source)?.tier ?? 0
    const lane = laneOf.get(`${l.id}:${from + 1}`)
    const target = byId.get(l.target)
    return lane ? lane.pos : (target?.pos ?? 0) + (l.back ? 1e6 : 0)
  }
  const prevAt = (l: FlowLink) => {
    const to = byId.get(l.target)?.tier ?? 0
    const lane = laneOf.get(`${l.id}:${to - 1}`)
    const source = byId.get(l.source)
    return lane ? lane.pos : (source?.pos ?? 0) + (l.back ? 1e6 : 0)
  }
  const outOffset = new Map<string, number>()
  const inOffset = new Map<string, number>()
  for (const l of links) l.width = l.value * scale
  for (const l of [...links].sort((a, b) => nextAt(a) - nextAt(b))) {
    const source = byId.get(l.source)
    if (!source) continue
    const offset = outOffset.get(source.id) ?? 0
    outOffset.set(source.id, offset + l.width)
    l.points.push({ tier: source.tier, at: source.pos + offset + l.width / 2 })
    if (!l.back) {
      const to = byId.get(l.target)?.tier ?? 0
      for (let tier = source.tier + 1; tier < to; tier += 1) {
        const lane = laneOf.get(`${l.id}:${tier}`)
        if (lane) l.points.push({ tier, at: lane.pos + l.width / 2 })
      }
    }
  }
  for (const l of [...links].sort((a, b) => prevAt(a) - prevAt(b))) {
    const target = byId.get(l.target)
    if (!target) continue
    const offset = inOffset.get(target.id) ?? 0
    inOffset.set(target.id, offset + l.width)
    l.points.push({ tier: target.tier, at: target.pos + offset + l.width / 2 })
  }

  const destinationsWithValue = groups.length
  return {
    tiers,
    nodes,
    links: links.filter((l) => l.points.length >= 2),
    lanes,
    scale,
    extent,
    hidden: {
      incomes: incomesAll.length - incomes.length,
      accounts: flowing.length - accounts.length,
      destinations: destinationsWithValue - destinations.length,
    },
    idle,
    poolTier,
  }
}
