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
  /**
   * The monthly share of the planned transfers linked to it that go to a set-aside account:
   * drawn as those transfers (set aside), not as spending (R-ACCOUNT-465).
   */
  transferShare: number
  /** Planned spending: expected less the transfers' share. */
  amount: number
  yearly: number | null
  /** Spent in the period, less the transactions of those transfers to set-aside accounts. */
  spent: number
  transferSpent: number
  /** The group's own remainder on the actual basis, the read's figure: negative when overspent. */
  left: number
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
          left: n(row.left_amount),
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
  /** Where the bar starts on the cross axis, and its size there (px). */
  pos: number
  size: number
  /** The room the bar and its label take on the cross axis (px): the bar sits in its middle. */
  top: number
  room: number
  /** The palette slot (accounts, groups), null for the fixed colours. */
  slot: number | null
  /** A set-aside account: its bar is striped. */
  setAside: boolean
  /** Its own figure is negative or short: hatched where the bar passes it, said in words. */
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
  /** `value * scale`, or the smallest drawn thickness for a band too thin to see. */
  width: number
  /** The target lies at or before its source (money sent back): a return, not a forward band. */
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
  /** Drawn incomes whose account is not drawn (more accounts receive incomes than are drawn). */
  unplaced: { income: string; account: string }[]
  /** Accounts in force with no planned flow: listed in the table, not drawn. */
  idle: string[]
  /** The tier of the pool (spendable / set aside) and of the destinations. */
  poolTier: number
}

/** At most this many incomes, accounts and destinations are drawn; the tables carry all. */
export const MAX_DRAWN = 8

interface Item {
  id: string
  /** In rappen. */
  length: number
  /** On the cross axis (px): the bar or band, and the room it keeps with its label. */
  size: number
  room: number
  top: number
  node?: FlowNode
  lane?: FlowLane
}

/**
 * Where each bar and band goes, on one cross axis (x on a phone, y on a desktop) and one
 * main axis of tiers: incomes; the accounts, each one tier after the furthest drawn account
 * that sends it money (a band that closes a cycle is a return); the pool (what stays on the
 * spendable accounts, what is set aside); the destinations (each category group's planned or
 * spent figure, then what is not planned or left). A band that skips a tier keeps a lane
 * there. Every bar and band is its amount times one scale (a band too thin to see is drawn at
 * `minBand`, its bars grow to hold it): only geometry is computed here, never a figure
 * (C-LOGIC-003). The accounts incomes arrive on are drawn first, then the largest by flow,
 * eight at most; the eight largest incomes and destinations.
 */
// R-ACCOUNT-235: one scale for bars and bands; every figure drawn is the database's.
export function layoutFlow(
  flow: MoneyFlow,
  {
    basis,
    cross,
    gap = 12,
    labelRoom,
    gapsInside = true,
    minBand = 0,
  }: {
    basis: Basis
    /** The cross-axis room for bars (px). */
    cross: number
    gap?: number
    /** The room a node's label needs on the cross axis beside its bar (px), if it sits there. */
    labelRoom?: (node: FlowNode) => number
    /** The gaps come out of `cross` (a phone's fixed width), else add to it. */
    gapsInside?: boolean
    /** The smallest thickness a band is drawn at (px). */
    minBand?: number
  },
): FlowLayout {
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
  // Accounts with a planned flow: those the drawn incomes arrive on first, then the largest by
  // what goes through them, eight at most (D-545).
  const flowing = flow.accounts.filter((a) => a.inflow > 0 || a.outflow > 0)
  const idle = flow.accounts.filter((a) => !flowing.includes(a)).map((a) => a.name)
  const receiving = flowing.filter((a) => incomes.some((i) => i.target === a.id))
  const accounts = [
    ...largest(
      receiving,
      (a) => Math.max(a.inflow, a.outflow),
      (a) => slots.get(a.id) ?? 0,
    ),
    ...largest(
      flowing.filter((a) => !receiving.includes(a)),
      (a) => Math.max(a.inflow, a.outflow),
      (a) => slots.get(a.id) ?? 0,
    ),
  ].slice(0, MAX_DRAWN)
  const drawn = new Set(accounts.map((a) => a.id))
  const notAssigned =
    flow.notAssigned && flow.notAssigned.inflow > 0 && incomes.some((i) => i.target === null)
      ? flow.notAssigned
      : null
  if (notAssigned) drawn.add(NOT_ASSIGNED)
  const unplaced = incomes
    .filter((i) => i.target !== null && !drawn.has(i.target))
    .map((i) => ({ income: i.id, account: i.target ?? '' }))
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
  const arriving = new Set(incomes.map((i) => i.target ?? NOT_ASSIGNED))
  for (const id of [...drawn].sort((a, b) => Number(arriving.has(b)) - Number(arriving.has(a)))) {
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
    fields: Omit<FlowNode, 'pos' | 'size' | 'top' | 'room' | 'warning' | 'setAside'> &
      Partial<FlowNode>,
  ): FlowNode => ({ pos: 0, size: 0, top: 0, room: 0, warning: false, setAside: false, ...fields })
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
    const length = Math.max(account.inflow, account.outflow)
    nodes.push(
      node({
        id: account.id,
        kind: 'account',
        name: account.name,
        tier: depth.get(account.id) ?? 1,
        // More planned out than in: the bar goes on, hatched, past what comes in.
        solid: account.negative ? account.inflow : length,
        length,
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
  const sum = (list: { value: number }[]) => list.reduce((acc, item) => acc + item.value, 0)
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
    const out = links.filter((l) => l.source === SPENDABLE)
    const length = Math.max(spendableSolid + short, sum(spendableIn), sum(out))
    nodes.push(
      node({
        id: SPENDABLE,
        kind: 'spendable',
        name: '',
        tier: poolTier,
        // Hatched only for its own figures: what is short, or all of it when below nothing.
        solid: total.spendable < 0 ? 0 : length - short,
        length,
        slot: null,
        warning: short > 0 || total.spendable < 0,
      }),
    )
  }
  if (total !== null && (setAsideIn.length > 0 || total.setAside !== 0)) {
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
    const length = Math.max(0, total.setAside, sum(setAsideIn))
    nodes.push(
      node({
        id: SET_ASIDE,
        kind: 'set_aside',
        name: '',
        tier: poolTier,
        // Hatched only when its own figure is negative, never because more enters than it.
        solid: total.setAside < 0 ? 0 : length,
        length,
        slot: null,
        setAside: true,
        warning: total.setAside < 0,
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
  const blank = { size: 0, room: 0, top: 0 }
  for (const n of nodes) items[n.tier]?.push({ id: n.id, length: n.length, node: n, ...blank })
  const lanes: FlowLane[] = []
  for (const l of links) {
    const from = byId.get(l.source)?.tier ?? 0
    const to = byId.get(l.target)?.tier ?? 0
    if (l.back) continue
    for (let tier = from + 1; tier < to; tier += 1) {
      const lane: FlowLane = { link: l.id, tier, pos: 0, size: 0 }
      lanes.push(lane)
      items[tier]?.push({ id: `lane:${l.id}:${tier}`, length: l.value, lane, ...blank })
    }
  }
  const linkOf = new Map(links.map((l) => [l.id, l]))

  // One scale: the fullest tier fills the room (gaps apart); bands too thin to see are drawn
  // thicker and their bars grow to hold them, so the scale shrinks until everything fits.
  let scale = Number.POSITIVE_INFINITY
  for (const list of items) {
    const length = list.reduce((acc, item) => acc + item.length, 0)
    const room = gapsInside ? cross - Math.max(0, list.length - 1) * gap : cross
    if (length > 0) scale = Math.min(scale, Math.max(room, cross * 0.25) / length)
  }
  if (!Number.isFinite(scale)) scale = 0
  const measure = () => {
    for (const l of links) l.width = Math.max(l.value * scale, l.value > 0 ? minBand : 0)
    const widths = (id: string, side: 'source' | 'target') =>
      links.filter((l) => l[side] === id).reduce((acc, l) => acc + l.width, 0)
    for (const list of items) {
      for (const item of list) {
        if (item.node) {
          const n = item.node
          n.size = Math.max(n.length * scale, widths(n.id, 'source'), widths(n.id, 'target'))
          if (n.length > 0) n.size = Math.max(n.size, minBand)
          item.size = n.size
          item.room = Math.max(n.size, labelRoom ? labelRoom(n) : 0)
          n.room = item.room
        } else if (item.lane) {
          item.size = linkOf.get(item.lane.link)?.width ?? 0
          item.room = item.size
        }
      }
    }
    return Math.max(
      0,
      ...items.map(
        (list) =>
          list.reduce((acc, item) => acc + item.room, 0) + Math.max(0, list.length - 1) * gap,
      ),
    )
  }
  let extent = measure()
  if (gapsInside && extent > cross && scale > 0) {
    for (let round = 0; round < 4 && extent > cross; round += 1) {
      const fixed = extent - cross
      scale *= Math.max(0.5, 1 - fixed / Math.max(1, extent))
      extent = measure()
    }
  }

  // Order within a tier: by where the money comes from (fewer crossings); the incomes by
  // amount, the pool spendable first, the destinations in the categories' order.
  const centre = new Map<string, number>()
  const previousAt = (item: Item, tier: number): number => {
    if (item.lane) {
      const l = linkOf.get(item.lane.link)
      if (!l) return Number.POSITIVE_INFINITY
      if (tier - 1 === (byId.get(l.source)?.tier ?? -1)) return centre.get(l.source) ?? 0
      return centre.get(`lane:${l.id}:${tier - 1}`) ?? 0
    }
    const incoming = links.filter((l) => l.target === item.id && !l.back)
    let weight = 0
    let total = 0
    for (const l of incoming) {
      const from = byId.get(l.source)?.tier ?? 0
      const key = from === tier - 1 ? l.source : `lane:${l.id}:${tier - 1}`
      const at = centre.get(key) ?? centre.get(l.source)
      if (at === undefined) continue
      weight += l.value
      total += at * l.value
    }
    return weight === 0 ? Number.POSITIVE_INFINITY : total / weight
  }
  const rank = (item: Item): number => {
    if (item.id === REST) return Number.MAX_SAFE_INTEGER
    return groupSlot.get(item.id.slice('group:'.length)) ?? 0
  }
  const poolRank = (item: Item): number =>
    item.id === SPENDABLE ? 0 : item.id === SET_ASIDE ? 1 : 2
  const stack = (list: Item[]) => {
    let at = 0
    for (const item of list) {
      item.top = at
      at += item.room + gap
      centre.set(item.id, item.top + item.room / 2)
    }
  }
  items.forEach((list, tier) => {
    if (tier === destTier) {
      list.sort((a, b) => rank(a) - rank(b))
    } else if (tier === poolTier) {
      list.sort((a, b) => poolRank(a) - poolRank(b) || previousAt(a, tier) - previousAt(b, tier))
    } else if (tier > 0) {
      list.sort((a, b) => previousAt(a, tier) - previousAt(b, tier) || b.length - a.length)
    }
    stack(list)
  })

  // Each tier starts centred on the fullest, then every bar and lane moves towards the
  // bars it is joined to, a few rounds each way, keeping its order: bands run level with
  // their ends instead of rising over a bar and falling back.
  const span = (list: Item[]) =>
    list.reduce((acc, item) => acc + item.room, 0) + Math.max(0, list.length - 1) * gap
  for (const list of items) {
    const shift = (extent - span(list)) / 2
    for (const item of list) {
      item.top += shift
      centre.set(item.id, item.top + item.room / 2)
    }
  }
  const chain = (l: FlowLink): string[] => {
    const from = byId.get(l.source)?.tier ?? 0
    const to = byId.get(l.target)?.tier ?? 0
    const ids = [l.source]
    for (let tier = from + 1; tier < to; tier += 1) ids.push(`lane:${l.id}:${tier}`)
    ids.push(l.target)
    return ids
  }
  const before = new Map<string, { id: string; weight: number }[]>()
  const after = new Map<string, { id: string; weight: number }[]>()
  for (const l of links) {
    if (l.back) continue
    const ids = chain(l)
    for (let i = 1; i < ids.length; i += 1) {
      const a = ids[i - 1] ?? ''
      const b = ids[i] ?? ''
      before.set(b, [...(before.get(b) ?? []), { id: a, weight: l.value }])
      after.set(a, [...(after.get(a) ?? []), { id: b, weight: l.value }])
    }
  }
  const settle = (list: Item[]) => {
    let floor = 0
    for (const item of list) {
      item.top = Math.max(item.top, floor)
      floor = item.top + item.room + gap
    }
    let ceiling = extent
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const item = list[i]
      if (!item) continue
      item.top = Math.min(item.top, ceiling - item.room)
      ceiling = item.top - gap
    }
    for (const item of list) centre.set(item.id, item.top + item.room / 2)
  }
  const pull = (
    tier: number,
    ends: Map<string, { id: string; weight: number }[]>,
    alpha: number,
  ) => {
    const list = items[tier] ?? []
    for (const item of list) {
      const joined = ends.get(item.id) ?? []
      const weight = joined.reduce((acc, end) => acc + end.weight, 0)
      if (weight === 0) continue
      const target =
        joined.reduce((acc, end) => acc + (centre.get(end.id) ?? 0) * end.weight, 0) / weight
      item.top += (target - (item.top + item.room / 2)) * alpha
    }
    // The accounts' tiers may change order where that lets bands run straighter; the incomes,
    // the pool and the destinations keep theirs.
    if (tier > 0 && tier < poolTier) list.sort((a, b) => a.top + a.room / 2 - (b.top + b.room / 2))
    settle(list)
  }
  for (let round = 0, alpha = 1; round < 8; round += 1, alpha *= 0.85) {
    for (let tier = 1; tier < tiers; tier += 1) pull(tier, before, alpha)
    for (let tier = tiers - 2; tier >= 0; tier -= 1) pull(tier, after, alpha)
  }
  for (const list of items) {
    for (const item of list) {
      if (item.node) {
        item.node.top = item.top
        item.node.pos = item.top + (item.room - item.size) / 2
      } else if (item.lane) {
        item.lane.pos = item.top
        item.lane.size = item.size
      }
    }
  }

  // Bands stack where they leave and enter a bar, in the order of their other end; a return
  // leaves and enters last.
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
      destinations: groups.length - destinations.length,
    },
    unplaced,
    idle,
    poolTier,
  }
}
