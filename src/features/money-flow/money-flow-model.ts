import type { Database } from '@/lib/database.types'

type Row = Database['public']['Functions']['get_money_flow']['Returns'][number]
export type AccountKind = Database['public']['Enums']['account_kind']

/** get_money_flow's rows, read once: the contract's nulls said as such (D-356). */
export interface MoneyFlow {
  incomes: {
    id: string
    name: string
    amount: number
    target: string | null
    userId: string | null
  }[]
  notAssigned: { inflow: number } | null
  accounts: {
    id: string
    name: string
    kind: AccountKind
    userId: string | null
    inflow: number
    outflow: number
    stays: number
    negative: boolean
  }[]
  transfers: {
    id: string
    name: string
    source: string
    target: string
    /** The monthly share: what the plan moves in a period (R-ACCOUNT-304). */
    amount: number
    planned: number
    cadence: 'monthly' | 'quarterly' | 'yearly' | null
    automatic: boolean
  }[]
  total: { incomes: number; transfers: number } | null
}

/** The id the diagram gives the "not assigned" node (no account has it: ids are uuids). */
export const NOT_ASSIGNED = 'not-assigned'

export function readMoneyFlow(rows: readonly Row[]): MoneyFlow {
  const flow: MoneyFlow = {
    incomes: [],
    notAssigned: null,
    accounts: [],
    transfers: [],
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
        flow.notAssigned = { inflow: n(row.inflow) }
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
          cadence: s(row.cadence) as MoneyFlow['transfers'][number]['cadence'],
          automatic: row.is_automatic === true,
        })
        break
      case 'total':
        flow.total = { incomes: n(row.inflow ?? row.amount), transfers: n(row.outflow) }
        break
    }
  }
  return flow
}

export interface LayoutNode {
  id: string
  kind: 'income' | 'account' | 'not_assigned'
  name: string
  /** Its value on the diagram: what comes in or goes out, whichever is more. */
  value: number
  inflow: number
  outflow: number
  stays: number
  negative: boolean
  column: number
  x: number
  /** Top of the bar (the label sits above it). */
  y: number
  height: number
  /** The palette slot (1 to 5, by the order the database gives), or 0: neutral. */
  color: number
}

export interface LayoutLink {
  id: string
  kind: 'income' | 'transfer'
  name: string
  source: string
  target: string
  value: number
  width: number
  /** Centre of the band where it leaves the source and enters the target. */
  y0: number
  y1: number
  x0: number
  x1: number
  /** The target lies left of (or with) its source: drawn as a loop below. */
  back: boolean
  color: number
}

export interface Layout {
  width: number
  height: number
  nodes: LayoutNode[]
  links: LayoutLink[]
  columns: number
  nodeWidth: number
  /** Accounts in force with no planned flow: listed, not drawn. */
  idle: string[]
}

export const LABEL_BAND = 36
const NODE_GAP = 14
const MIN_BAR = 6
const PAD = 2

/**
 * Where each node and band goes: incomes on the left, each account one column right of the
 * furthest account that sends it money, bands as thick as the amounts (a common scale), a
 * label band above each bar. Only geometry: every figure is the database's (C-LOGIC-003).
 */
export function layoutMoneyFlow(
  flow: MoneyFlow,
  { width, barHeight }: { width: number; barHeight: number },
): Layout {
  const accountIds = new Set(flow.accounts.map((account) => account.id))
  // Bands that make sense on the diagram: between nodes it has, with an amount.
  const transfers = flow.transfers.filter(
    (transfer) =>
      transfer.amount > 0 && accountIds.has(transfer.source) && accountIds.has(transfer.target),
  )
  const incomes = flow.incomes.filter((income) => income.amount > 0)
  const receiving = new Set(incomes.map((income) => income.target ?? NOT_ASSIGNED))
  const flowing = new Set([
    ...receiving,
    ...transfers.flatMap((transfer) => [transfer.source, transfer.target]),
  ])
  const accounts = flow.accounts.filter((account) => flowing.has(account.id))
  const idle = flow.accounts.filter((account) => !flowing.has(account.id)).map((a) => a.name)

  // Columns: the longest chain of transfers from an account an income reaches. A cycle
  // (money sent back) is cut where it closes: that band is drawn as a loop.
  const depth = new Map<string, number>()
  for (const account of accounts) depth.set(account.id, 1)
  if (receiving.has(NOT_ASSIGNED)) depth.set(NOT_ASSIGNED, 1)
  const back = new Set<string>()
  const outgoing = new Map<string, typeof transfers>()
  for (const transfer of transfers) {
    outgoing.set(transfer.source, [...(outgoing.get(transfer.source) ?? []), transfer])
  }
  const state = new Map<string, 'open' | 'done'>()
  const visit = (id: string) => {
    state.set(id, 'open')
    for (const transfer of outgoing.get(id) ?? []) {
      const next = state.get(transfer.target)
      if (next === 'open') {
        back.add(transfer.id)
        continue
      }
      if (next !== 'done') visit(transfer.target)
    }
    state.set(id, 'done')
  }
  // Roots first: the accounts incomes reach, then any other, in the database's order.
  for (const account of [
    ...accounts.filter((a) => receiving.has(a.id)),
    ...accounts.filter((a) => !receiving.has(a.id)),
  ]) {
    if (!state.has(account.id)) visit(account.id)
  }
  const forward = transfers.filter((transfer) => !back.has(transfer.id))
  for (let round = 0; round < accounts.length; round += 1) {
    let moved = false
    for (const transfer of forward) {
      const next = (depth.get(transfer.source) ?? 1) + 1
      if (next > (depth.get(transfer.target) ?? 1)) {
        depth.set(transfer.target, next)
        moved = true
      }
    }
    if (!moved) break
  }
  const columns = Math.max(2, ...depth.values()) + 1

  // Palette slots follow the account (its place in the database's order), never its rank.
  const slot = new Map<string, number>()
  flow.accounts.forEach((account, index) => slot.set(account.id, index < 4 ? index + 2 : 0))

  const nodes: LayoutNode[] = [
    ...incomes.map((income): LayoutNode => ({
      id: `income:${income.id}`,
      kind: 'income',
      name: income.name,
      value: income.amount,
      inflow: 0,
      outflow: income.amount,
      stays: 0,
      negative: false,
      column: 0,
      x: 0,
      y: 0,
      height: 0,
      color: 1,
    })),
    ...(receiving.has(NOT_ASSIGNED) && flow.notAssigned
      ? [
          {
            id: NOT_ASSIGNED,
            kind: 'not_assigned' as const,
            name: '',
            value: flow.notAssigned.inflow,
            inflow: flow.notAssigned.inflow,
            outflow: 0,
            stays: flow.notAssigned.inflow,
            negative: false,
            column: 1,
            x: 0,
            y: 0,
            height: 0,
            color: 0,
          },
        ]
      : []),
    ...accounts.map((account): LayoutNode => ({
      id: account.id,
      kind: 'account',
      name: account.name,
      value: Math.max(account.inflow, account.outflow),
      inflow: account.inflow,
      outflow: account.outflow,
      stays: account.stays,
      negative: account.negative,
      column: depth.get(account.id) ?? 1,
      x: 0,
      y: 0,
      height: 0,
      color: slot.get(account.id) ?? 0,
    })),
  ]
  // Accounts with nothing further to the right sit in the last column, where the money stays.
  const last = columns - 1
  for (const node of nodes) {
    if (node.kind !== 'income' && node.outflow === 0) node.column = last
  }

  const linksIn: {
    id: string
    kind: 'income' | 'transfer'
    name: string
    source: string
    target: string
    value: number
  }[] = [
    ...incomes.map((income) => ({
      id: `income:${income.id}`,
      kind: 'income' as const,
      name: income.name,
      source: `income:${income.id}`,
      target: income.target ?? NOT_ASSIGNED,
      value: income.amount,
    })),
    ...transfers.map((transfer) => ({
      id: transfer.id,
      kind: 'transfer' as const,
      name: transfer.name,
      source: transfer.source,
      target: transfer.target,
      value: transfer.amount,
    })),
  ]

  // One scale for every bar and band: the fullest column fills `barHeight`.
  const byColumn = Array.from({ length: columns }, (_, column) =>
    nodes.filter((node) => node.column === column),
  )
  const fullest = Math.max(1, ...byColumn.map((list) => list.reduce((sum, n) => sum + n.value, 0)))
  const scale = barHeight / fullest
  const nodeWidth = width < 480 ? 10 : 14
  const span = Math.max(1, width - nodeWidth - PAD * 2)
  // Order within a column: by where their money comes from (fewer crossings), then size.
  const position = new Map<string, number>()
  let height = 0
  for (const [column, list] of byColumn.entries()) {
    const weight = (node: LayoutNode) => {
      const sources = linksIn.filter((link) => link.target === node.id)
      const placed = sources.filter((link) => position.has(link.source))
      if (placed.length === 0) return Number.POSITIVE_INFINITY
      return (
        placed.reduce((sum, link) => sum + (position.get(link.source) ?? 0) * link.value, 0) /
        placed.reduce((sum, link) => sum + link.value, 0)
      )
    }
    if (column > 0) list.sort((a, b) => weight(a) - weight(b) || b.value - a.value)
    let y = 0
    for (const node of list) {
      node.x = PAD + (span * column) / (columns - 1)
      node.height = Math.max(MIN_BAR, node.value * scale)
      node.y = y + LABEL_BAND
      position.set(node.id, node.y + node.height / 2)
      y = node.y + node.height + NODE_GAP
    }
    height = Math.max(height, y)
  }

  // Bands leave each source and enter each target stacked in the order of the other end.
  const find = (id: string) => nodes.find((node) => node.id === id)
  const outOffset = new Map<string, number>()
  const inOffset = new Map<string, number>()
  const ordered = [...linksIn].sort((a, b) => (find(a.target)?.y ?? 0) - (find(b.target)?.y ?? 0))
  const widthOf = (value: number) => Math.max(1.5, value * scale)
  const links: LayoutLink[] = []
  for (const link of ordered) {
    const source = find(link.source)
    const target = find(link.target)
    if (!source || !target) continue
    const w = widthOf(link.value)
    const out = outOffset.get(source.id) ?? 0
    outOffset.set(source.id, out + w)
    links.push({
      ...link,
      width: w,
      x0: source.x + nodeWidth,
      x1: target.x,
      y0: source.y + out + w / 2,
      y1: 0,
      back: target.column <= source.column,
      color: link.kind === 'income' ? 1 : source.color,
    })
  }
  for (const link of [...links].sort(
    (a, b) => (find(a.source)?.y ?? 0) - (find(b.source)?.y ?? 0),
  )) {
    const at = inOffset.get(link.target) ?? 0
    inOffset.set(link.target, at + link.width)
    link.y1 = (find(link.target)?.y ?? 0) + at + link.width / 2
  }
  const loops = links.filter((link) => link.back).length
  return {
    width,
    height: height + (loops > 0 ? 24 + loops * 8 : 0),
    nodes,
    links,
    columns,
    nodeWidth,
    idle,
  }
}
