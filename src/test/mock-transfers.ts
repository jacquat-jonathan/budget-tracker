import type { Database, Tables } from '@/lib/database.types'
import type { MockDb } from '@/test/mock-db'
import { rpcError } from '@/test/mock-db'

/**
 * The step 7 calls of the in-memory database: accounts, planned transfers, the checklist and
 * its marks, the dashboard's counts and the money flow. They behave as docs/database.md says
 * for what the screens do (revisions, refusals, the states a mark leads to); what only the
 * database can work out (due dates, previews) comes from the rows a test puts in
 * `db.checklist`, or from the handlers' simple defaults; the money flow is built from the
 * period's plan a test puts in `db.moneyFlowPlans`, as private.money_flow builds it.
 */

type Fns = Database['public']['Functions']
export type ChecklistRow = Database['public']['CompositeTypes']['transfer_checklist_row']
export type MoneyFlowRow = Fns['get_money_flow']['Returns'][number]
export type TransferPreviewRow = Fns['preview_create_transfer']['Returns'][number]

const NOW = '2026-11-15T10:00:00+00:00'

export function accountRow(
  overrides: Partial<Tables<'account_overview'>> = {},
): Tables<'account_overview'> {
  return {
    id: 'acc-salary',
    budget_id: 'bbbbbbbb-0000-0000-0000-000000000001',
    name: 'Salary account',
    kind: 'current',
    bank_label: null,
    user_id: null,
    user_display_name: null,
    user_is_member: null,
    is_active: true,
    first_seq: 1,
    end_seq: null,
    in_use: false,
    removal_deletes: false,
    revision: 1,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  }
}

export function transferRow(
  overrides: Partial<Tables<'transfer_overview'>> = {},
): Tables<'transfer_overview'> {
  return {
    id: 'tr-savings',
    budget_id: 'bbbbbbbb-0000-0000-0000-000000000001',
    name: 'Savings',
    is_active: true,
    first_seq: 1,
    end_seq: null,
    from_account_id: 'acc-salary',
    from_account_name: 'Salary account',
    to_account_id: 'acc-savings',
    to_account_name: 'Savings',
    amount: 100_000,
    schedule: 'pay_date',
    offset_days: 0,
    day_of_month: null,
    cadence: null,
    first_date: null,
    monthly_amount: 100_000,
    income_id: null,
    income_name: null,
    is_automatic: true,
    category_id: null,
    category_name: null,
    parent_category_id: null,
    parent_category_name: null,
    terms_from_seq: 1,
    follows_primary: false,
    next_due_date: '2026-11-25',
    starts_on: '2026-09-25',
    has_history: true,
    removal_deletes: false,
    transaction_count: 0,
    revision: 1,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  }
}

export function checklistRow(overrides: Partial<ChecklistRow> = {}): ChecklistRow {
  return {
    transfer_id: 'tr-joint',
    period_id: 'period-2',
    occurrence_date: '2026-10-23',
    name: 'Joint account',
    from_account_id: 'acc-salary',
    from_account_name: 'Salary account',
    to_account_id: 'acc-joint',
    to_account_name: 'Joint account',
    amount: 150_000,
    due_date: '2026-10-25',
    is_automatic: false,
    category_id: null,
    category_name: null,
    status: 'to_do',
    is_overdue: true,
    held_back: false,
    follows_primary: false,
    done_on: null,
    amount_moved: null,
    transaction_id: null,
    transaction_revision: null,
    mark_revision: 0,
    recorded_by: null,
    recorded_by_name: null,
    is_ended: false,
    planned: true,
    cadence: null,
    assumed: false,
    occurrence_kind: 'payday',
    ...overrides,
  }
}

/** Every column get_money_flow answers, null where the row does not use it (as the database). */
const MONEY_FLOW_COLUMNS = [
  'row_kind',
  'id',
  'name',
  'source_id',
  'target_id',
  'amount',
  'inflow',
  'outflow',
  'stays',
  'is_negative',
  'account_kind',
  'user_id',
  'is_automatic',
  'period_id',
  'planned_amount',
  'cadence',
  'spendable',
  'expected',
  'transfer_share',
  'spent',
  'transfer_spent',
  'yearly_amount',
  'display_order',
  'set_aside',
  'spendable_amount',
  'planned_spending',
  'actual_spending',
  'not_planned',
  'left_amount',
  'created_at',
  'spending_rows_omitted',
] as const

export function moneyFlowRow(overrides: {
  [K in keyof MoneyFlowRow]?: MoneyFlowRow[K] | null
}): MoneyFlowRow {
  // The generated type marks every column required; the contract leaves most of them null.
  const row: Record<string, unknown> = Object.fromEntries(
    MONEY_FLOW_COLUMNS.map((column) => [column, null]),
  )
  return { ...row, row_kind: 'account', period_id: 'period-2', ...overrides } as MoneyFlowRow
}

/**
 * A period's plan as the money flow reads it: what is in force there (incomes and their
 * account, accounts, transfers and the top-level category each is linked to) and, per
 * top-level category, its expected monthly share, the real amount of its yearly expectations
 * and what the period's transactions spent (the transfers' own included, and apart).
 */
export interface MoneyFlowPlan {
  periodId: string
  incomes: { id: string; name: string; amount: number; accountId: string | null; userId?: string }[]
  accounts: {
    id: string
    name: string
    kind: Tables<'account_overview'>['kind']
    createdAt: string
    userId?: string | null
  }[]
  transfers: {
    id: string
    name: string
    from: string
    to: string
    /** The real amount; a pay-date transfer has no cadence (null). */
    amount: number
    cadence?: 'monthly' | 'quarterly' | 'yearly' | null
    automatic?: boolean
    /** The top-level category its share is committed in. */
    category?: string | null
  }[]
  categories: {
    id: string
    name: string
    displayOrder: number
    /** Expected at the monthly share (a yearly expectation counts one twelfth, half up). */
    expected: number
    yearly?: number | null
    /** What the period's transactions spent in it, refunds deducted, the transfers' included. */
    spent?: number
    /** Of `spent`, the transactions of transfers linked to it. */
    transferSpent?: number
  }[]
}

/** private.subscription_monthly_cost: the amount over its months, half up. */
function monthlyShare(amount: number, cadence: MoneyFlowPlan['transfers'][number]['cadence']) {
  const months = cadence === 'quarterly' ? 3 : cadence === 'yearly' ? 12 : 1
  return Math.floor((2 * amount + months) / (2 * months))
}

const collator = new Intl.Collator('en-US')

/**
 * Text order as the database sorts `name`: its collation is en_US.UTF-8 (a, b, B, e, é, Z on a
 * real stack), not byte order; equal under it, by bytes.
 */
export function pgTextOrder(a: string | null, b: string | null): number {
  const x = a ?? ''
  const y = b ?? ''
  return collator.compare(x, y) || (x < y ? -1 : x > y ? 1 : 0)
}

/**
 * get_money_flow's rows for a plan, as private.money_flow builds them: incomes, "not assigned"
 * (only when an income names no account), accounts, transfers, one spending row per top-level
 * category planned or spent (display order), the total last; each kind ordered by name, then
 * id; every column null where the row does not use it; past `limit` rows the last spending
 * rows are left out and counted on the total, whose figures still cover them.
 */
export function moneyFlowRows(plan: MoneyFlowPlan, limit = 1000): MoneyFlowRow[] {
  const period = plan.periodId
  const row = (fields: Partial<Record<(typeof MONEY_FLOW_COLUMNS)[number], unknown>>) =>
    moneyFlowRow({ period_id: period, ...(fields as Partial<MoneyFlowRow>) })
  const byName = <T extends { name: string; id: string }>(list: T[]) =>
    [...list].sort((a, b) => pgTextOrder(a.name, b.name) || pgTextOrder(a.id, b.id))
  const transfers = plan.transfers.map((t) => ({
    ...t,
    monthly:
      t.cadence === 'quarterly' || t.cadence === 'yearly'
        ? monthlyShare(t.amount, t.cadence)
        : t.amount,
  }))
  const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0)
  const accounts = plan.accounts.map((a) => {
    const inflow =
      sum(plan.incomes.filter((i) => i.accountId === a.id).map((i) => i.amount)) +
      sum(transfers.filter((t) => t.to === a.id).map((t) => t.monthly))
    const outflow = sum(transfers.filter((t) => t.from === a.id).map((t) => t.monthly))
    const spendable = !['savings', 'third_pillar', 'tax_reserve', 'investment'].includes(a.kind)
    return { ...a, inflow, outflow, spendable }
  })
  const top = [...plan.categories]
    .map((c) => {
      const committed = sum(transfers.filter((t) => t.category === c.id).map((t) => t.monthly))
      const share = Math.min(committed, c.expected)
      const spent = c.spent ?? 0
      const transferSpent = c.transferSpent ?? 0
      return { ...c, committed, share, gross: spent, spent: spent - transferSpent, transferSpent }
    })
    .filter((c) => c.expected !== 0 || c.gross !== 0 || c.committed !== 0)
    .sort((a, b) => a.displayOrder - b.displayOrder)
  const unassigned = plan.incomes.filter((i) => i.accountId === null)
  const room = Math.max(
    limit -
      plan.incomes.length -
      (unassigned.length > 0 ? 1 : 0) -
      plan.accounts.length -
      plan.transfers.length -
      1,
    1,
  )
  const income = sum(plan.incomes.map((i) => i.amount))
  const setAside = sum(accounts.filter((a) => !a.spendable).map((a) => a.inflow - a.outflow))
  const planned = sum(top.map((c) => c.expected - c.share))
  const actual = sum(top.map((c) => c.spent))
  const shown = top.slice(0, room)
  return [
    ...byName(plan.incomes).map((i) =>
      row({
        row_kind: 'income',
        id: i.id,
        name: i.name,
        source_id: i.id,
        target_id: i.accountId,
        amount: i.amount,
        user_id: i.userId ?? null,
      }),
    ),
    ...(unassigned.length > 0
      ? [
          row({
            row_kind: 'not_assigned',
            inflow: sum(unassigned.map((i) => i.amount)),
            outflow: 0,
            stays: sum(unassigned.map((i) => i.amount)),
            is_negative: false,
            spendable: true,
          }),
        ]
      : []),
    ...byName(accounts).map((a) =>
      row({
        row_kind: 'account',
        id: a.id,
        name: a.name,
        inflow: a.inflow,
        outflow: a.outflow,
        stays: a.inflow - a.outflow,
        is_negative: a.inflow < a.outflow,
        account_kind: a.kind,
        user_id: a.userId ?? null,
        spendable: a.spendable,
        created_at: a.createdAt,
      }),
    ),
    ...byName(transfers).map((t) =>
      row({
        row_kind: 'transfer',
        id: t.id,
        name: t.name,
        source_id: t.from,
        target_id: t.to,
        amount: t.monthly,
        is_automatic: t.automatic ?? false,
        planned_amount: t.amount,
        cadence: t.cadence ?? null,
      }),
    ),
    ...shown.map((c) =>
      row({
        row_kind: 'spending',
        id: c.id,
        name: c.name,
        amount: c.expected - c.share,
        is_negative: c.spent > c.expected - c.share,
        expected: c.expected,
        transfer_share: c.share,
        spent: c.spent,
        transfer_spent: c.transferSpent,
        yearly_amount: c.yearly ?? null,
        display_order: c.displayOrder,
      }),
    ),
    row({
      row_kind: 'total',
      amount: income,
      inflow: income,
      outflow: sum(transfers.map((t) => t.monthly)),
      is_negative: income - setAside < planned,
      set_aside: setAside,
      spendable_amount: income - setAside,
      planned_spending: planned,
      actual_spending: actual,
      not_planned: income - setAside - planned,
      left_amount: income - setAside - actual,
      spending_rows_omitted: Math.max(top.length - room, 0),
    }),
  ]
}

type Args = Record<string, unknown>
type Handler = (args: Args) => unknown

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}
function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function step7Handlers(db: MockDb): Record<string, Handler> {
  const accounts = () => db.tables.account_overview
  const transfers = () => db.tables.transfer_overview
  const account = (id: unknown) => {
    const row = accounts().find((item) => item.id === id)
    if (!row) rpcError('account_not_found')
    return row
  }
  const transfer = (id: unknown) => {
    const row = transfers().find((item) => item.id === id)
    if (!row) rpcError('transfer_not_found')
    return row
  }
  const revision = (actual: number, expected: unknown) => {
    if (typeof expected !== 'number') rpcError('invalid_revision')
    if (actual !== expected) rpcError('record_changed')
  }
  const memberName = (userId: string | null) =>
    db.tables.budget_member_list.find((member) => member.user_id === userId)?.display_name ?? null
  const current = () => db.tables.period_summaries.find((period) => period.is_current)
  const today = () => current()?.today ?? '2026-11-15'

  const closeCheck = (row: Tables<'account_overview'>) => {
    if (!row.is_active) return 'account_ended'
    if (row.in_use) return 'account_in_use'
    return null
  }
  const usedBy = (row: Tables<'account_overview'>) => [
    ...db.tables.income_overview
      .filter((income) => income.account_id === row.id && income.is_active)
      .map((income) => ({ kind: 'income', id: income.id, name: income.name })),
    ...transfers()
      .filter(
        (item) =>
          item.is_active && (item.from_account_id === row.id || item.to_account_id === row.id),
      )
      .map((item) => ({ kind: 'transfer', id: item.id, name: item.name })),
  ]

  /** The checklist row a mark acts on (one occurrence, named when there are several). */
  const occurrence = (args: Args) => {
    const rows = db.checklist.filter(
      (row) => row.transfer_id === args.p_transfer_id && row.period_id === args.p_period_id,
    )
    if (rows.length === 0) rpcError('transfer_not_in_force')
    const date = str(args.p_occurrence_date)
    if (date === null && rows.length > 1) rpcError('occurrence_required')
    const row = date === null ? rows[0] : rows.find((item) => item.occurrence_date === date)
    if (!row) rpcError('transfer_not_in_force')
    if (typeof args.p_expected_revision !== 'number') rpcError('invalid_revision')
    if ((row.mark_revision ?? 0) !== args.p_expected_revision) rpcError('record_changed')
    return row
  }
  const mark = (row: ChecklistRow, changes: Partial<ChecklistRow>) => {
    Object.assign(row, changes, {
      mark_revision: (row.mark_revision ?? 0) + 1,
      recorded_by: '00000000-0000-0000-0000-000000000001',
      recorded_by_name: 'Alex',
      assumed: false,
    })
    return [{ ...row }]
  }
  const needsPlanned = (row: ChecklistRow) => {
    if (row.planned === false) rpcError('transfer_not_in_force')
    if ((row.mark_revision ?? 0) > 0 && !row.assumed) rpcError('transfer_already_marked')
  }

  return {
    create_account: (args) => {
      if (str(args.p_name)?.trim() === '' || args.p_name === undefined) rpcError('invalid_name')
      if (accounts().filter((row) => row.is_active).length >= 50) rpcError('account_limit_reached')
      const userId = str(args.p_user_id)
      const row = accountRow({
        id: `acc-new-${accounts().length + 1}`,
        name: text(args.p_name),
        kind: args.p_kind as Tables<'account_overview'>['kind'],
        bank_label: str(args.p_bank_label),
        user_id: userId,
        user_display_name: memberName(userId),
        user_is_member: userId === null ? null : true,
        removal_deletes: true,
      })
      db.tables.account_overview = [...accounts(), row]
      return [{ ...row }]
    },
    update_account: (args) => {
      const row = account(args.p_account_id)
      revision(row.revision, args.p_expected_revision)
      if (args.p_clear_bank_label && args.p_bank_label !== undefined) rpcError('invalid_arguments')
      if (args.p_clear_user && args.p_user_id !== undefined) rpcError('invalid_arguments')
      if (args.p_name !== undefined) row.name = text(args.p_name)
      if (args.p_kind !== undefined) row.kind = args.p_kind as typeof row.kind
      if (args.p_bank_label !== undefined) row.bank_label = text(args.p_bank_label)
      if (args.p_clear_bank_label) row.bank_label = null
      if (args.p_user_id !== undefined) {
        row.user_id = text(args.p_user_id)
        row.user_display_name = memberName(row.user_id)
        row.user_is_member = true
      }
      if (args.p_clear_user) Object.assign(row, { user_id: null, user_display_name: null })
      row.revision += 1
      return [{ ...row }]
    },
    preview_close_account: (args) => {
      const row = account(args.p_account_id)
      const refusal = closeCheck(row)
      return [
        {
          outcome: refusal ? null : row.removal_deletes ? 'deleted' : 'ended',
          refusal,
          used_by: refusal === 'account_in_use' ? usedBy(row) : null,
        },
      ]
    },
    close_account: (args) => {
      const row = account(args.p_account_id)
      revision(row.revision, args.p_expected_revision)
      const refusal = closeCheck(row)
      if (refusal === 'account_in_use') rpcError(refusal, 'P0001', usedBy(row))
      if (refusal) rpcError(refusal)
      if (row.removal_deletes) {
        db.tables.account_overview = accounts().filter((item) => item.id !== row.id)
        return 'deleted'
      }
      Object.assign(row, { is_active: false, end_seq: 2, revision: row.revision + 1 })
      return 'ended'
    },

    create_transfer: (args) => {
      if (!args.p_from_account_id || !args.p_to_account_id) rpcError('account_required')
      if (args.p_from_account_id === args.p_to_account_id) rpcError('same_account')
      const from = account(args.p_from_account_id)
      const to = account(args.p_to_account_id)
      const amount = Number(args.p_amount)
      const cadence = (str(args.p_cadence) ??
        (args.p_schedule === 'pay_date' ? null : 'monthly')) as
        Tables<'transfer_overview'>['cadence'] | null
      const row = transferRow({
        id: `tr-new-${transfers().length + 1}`,
        name: text(args.p_name),
        from_account_id: from.id,
        from_account_name: from.name,
        to_account_id: to.id,
        to_account_name: to.name,
        amount,
        monthly_amount:
          cadence === 'quarterly'
            ? Math.round(amount / 3)
            : cadence === 'yearly'
              ? Math.round(amount / 12)
              : amount,
        schedule: args.p_schedule as Tables<'transfer_overview'>['schedule'],
        offset_days: args.p_schedule === 'pay_date' ? Number(args.p_offset_days ?? 0) : null,
        day_of_month:
          args.p_schedule === 'pay_date'
            ? null
            : Number(args.p_day_of_month ?? str(args.p_first_date)?.slice(8, 10) ?? 1),
        cadence,
        first_date: str(args.p_first_date),
        income_id: str(args.p_income_id),
        income_name:
          db.tables.income_overview.find((income) => income.id === args.p_income_id)?.name ?? null,
        is_automatic: args.p_is_automatic === true,
        category_id: str(args.p_category_id),
        category_name:
          db.tables.category_overview.find((category) => category.id === args.p_category_id)
            ?.name ?? null,
        has_history: false,
        removal_deletes: true,
        next_due_date: null,
        starts_on: today(),
      })
      db.tables.transfer_overview = [...transfers(), row]
      return [{ ...row }]
    },
    update_transfer: (args) => {
      const row = transfer(args.p_transfer_id)
      revision(row.revision, args.p_expected_revision)
      if (args.p_clear_income && args.p_income_id !== undefined) rpcError('invalid_arguments')
      if (args.p_clear_category && args.p_category_id !== undefined) rpcError('invalid_arguments')
      if (args.p_name !== undefined) row.name = text(args.p_name)
      if (args.p_amount !== undefined) row.amount = Number(args.p_amount)
      if (args.p_from_account_id !== undefined) {
        row.from_account_id = text(args.p_from_account_id)
        row.from_account_name = account(args.p_from_account_id).name
      }
      if (args.p_to_account_id !== undefined) {
        row.to_account_id = text(args.p_to_account_id)
        row.to_account_name = account(args.p_to_account_id).name
      }
      if (args.p_is_automatic !== undefined) row.is_automatic = args.p_is_automatic === true
      if (args.p_schedule !== undefined) row.schedule = args.p_schedule as typeof row.schedule
      if (args.p_offset_days !== undefined) row.offset_days = Number(args.p_offset_days)
      if (args.p_day_of_month !== undefined) row.day_of_month = Number(args.p_day_of_month)
      if (args.p_cadence !== undefined) row.cadence = args.p_cadence as typeof row.cadence
      if (args.p_first_date !== undefined) row.first_date = text(args.p_first_date)
      if (args.p_income_id !== undefined) row.income_id = text(args.p_income_id)
      if (args.p_clear_income) Object.assign(row, { income_id: null, income_name: null })
      if (args.p_category_id !== undefined) row.category_id = text(args.p_category_id)
      if (args.p_clear_category) Object.assign(row, { category_id: null, category_name: null })
      row.revision += 1
      return [{ ...row }]
    },
    end_transfer: (args) => {
      const row = transfer(args.p_transfer_id)
      revision(row.revision, args.p_expected_revision)
      if (!row.is_active) rpcError('transfer_ended')
      if (row.removal_deletes) {
        db.tables.transfer_overview = transfers().filter((item) => item.id !== row.id)
        return 'deleted'
      }
      Object.assign(row, {
        is_active: false,
        end_seq: 2,
        next_due_date: null,
        revision: row.revision + 1,
      })
      return 'ended'
    },
    // The plan is the database's: a test gives the rows it expects; by default the terms
    // govern one occurrence on the transfer's next due date and nothing is created at once.
    preview_create_transfer: () => [
      previewRow({ due_date: '2026-11-25', occurrence_date: '2026-11-25' }),
    ],
    preview_update_transfer: (args) => {
      const row = transfer(args.p_transfer_id)
      return [
        previewRow({
          due_date: row.next_due_date ?? '2026-11-25',
          occurrence_date: row.next_due_date ?? '2026-11-25',
          amount: typeof args.p_amount === 'number' ? args.p_amount : row.amount,
        }),
      ]
    },
    preview_end_transfer: (args) => {
      const row = transfer(args.p_transfer_id)
      if (!row.is_active) {
        return [
          {
            outcome: null,
            refusal: 'transfer_ended',
            occurrences_removed: 0,
            marks_kept: 0,
            transactions_kept: 0,
          },
        ]
      }
      return [
        {
          outcome: row.removal_deletes ? 'deleted' : 'ended',
          refusal: null,
          occurrences_removed: 1,
          marks_kept: 0,
          transactions_kept: 0,
        },
      ]
    },
    get_transfer_terms: (args) => {
      const row = transfer(args.p_transfer_id)
      return [
        {
          period_id: args.p_period_id,
          in_force: true,
          from_account_id: row.from_account_id,
          to_account_id: row.to_account_id,
          amount: row.amount,
          schedule: row.schedule,
          offset_days: row.offset_days,
          day_of_month: row.day_of_month,
          income_id: row.income_id,
          is_automatic: row.is_automatic,
          category_id: row.category_id,
          terms_from_period_id: args.p_period_id,
          until_period_id: null,
          cadence: row.cadence,
          first_date: row.first_date,
        },
      ]
    },

    get_transfer_checklist: (args) =>
      db.checklist.filter((row) => row.period_id === args.p_period_id).map((row) => ({ ...row })),
    mark_transfer_done: (args) => {
      const row = occurrence(args)
      needsPlanned(row)
      if (row.is_automatic) rpcError('transfer_is_automatic')
      const done = str(args.p_done_on) ?? (row.period_id === current()?.id ? today() : row.due_date)
      if (done !== null && done > today()) rpcError('date_outside_periods')
      const amount = typeof args.p_amount === 'number' ? args.p_amount : row.amount
      return mark(row, {
        status: 'done',
        done_on: done,
        amount_moved: amount,
        transaction_id: row.category_id ? `tx-${row.transfer_id}` : null,
      })
    },
    skip_transfer: (args) => {
      const row = occurrence(args)
      needsPlanned(row)
      if (row.is_automatic) rpcError('transfer_is_automatic')
      return mark(row, { status: 'skipped' })
    },
    mark_transfer_not_done: (args) => {
      const row = occurrence(args)
      if (row.planned === false) rpcError('transfer_not_in_force')
      if ((row.mark_revision ?? 0) > 0 && !row.assumed) rpcError('transfer_already_marked')
      if (!row.is_automatic) rpcError('transfer_is_manual')
      return mark(row, { status: 'not_done', transaction_id: null, done_on: null })
    },
    // As the database: no mark, or the catch-up's own transaction of an automatic linked
    // occurrence, is nothing to undo; the catch-up's transaction kept on an occurrence made
    // manual is undone (its transaction deleted). Back unmarked, an automatic occurrence due is
    // assumed done: with a category the catch-up's transaction (dated its due date, its own
    // mark), without one no mark at all (done_on null, mark_revision 0).
    undo_transfer_mark: (args) => {
      const row = occurrence(args)
      const catchUps =
        row.planned !== false &&
        row.status === 'done' &&
        row.assumed === true &&
        row.is_automatic === true &&
        row.category_id !== null
      if ((row.mark_revision ?? 0) === 0 || catchUps) rpcError('nothing_to_undo')
      if (row.planned === false) {
        db.checklist = db.checklist.filter((item) => item !== row)
        return []
      }
      const due = row.due_date !== null && row.due_date <= today()
      const assumed = row.is_automatic === true && due
      const linked = assumed && row.category_id !== null
      Object.assign(row, {
        status: row.is_automatic ? (due ? 'done' : 'upcoming') : 'to_do',
        assumed,
        is_overdue: !row.is_automatic && row.due_date !== null && row.due_date < today(),
        done_on: linked ? row.due_date : null,
        amount_moved: linked ? row.amount : null,
        transaction_id: linked ? `tx-${row.transfer_id}-catch-up` : null,
        transaction_revision: linked ? 1 : null,
        recorded_by: null,
        recorded_by_name: null,
        mark_revision: linked ? (row.mark_revision ?? 0) + 1 : 0,
      })
      return [{ ...row }]
    },
    // The manual occurrences of the current period and of the one before it with no mark.
    get_transfers_to_do: (args) => {
      const periods = db.tables.period_summaries
        .filter((period) => period.budget_id === args.p_budget_id)
        .sort((a, b) => b.seq - a.seq)
      const now = periods.find((period) => period.is_current)
      if (!now) return [{ transfers_to_do: 0, transfers_overdue: 0 }]
      const ids = new Set(
        periods.filter((period) => period.seq >= now.seq - 1).map((period) => period.id),
      )
      const open = db.checklist.filter(
        (row) =>
          ids.has(row.period_id ?? '') &&
          !row.is_automatic &&
          row.planned !== false &&
          row.status === 'to_do',
      )
      return [
        {
          transfers_to_do: open.length,
          transfers_overdue: open.filter((row) => row.is_overdue).length,
        },
      ]
    },
    // As the database: a member's budget (else budget_not_found), one of its periods (else
    // period_not_found; the current one by default, budget_ended when there is none), and the
    // rows private.money_flow builds from the period's plan (moneyFlowRows).
    get_money_flow: (args) => {
      if (!db.tables.my_budgets.some((budget) => budget.id === args.p_budget_id))
        rpcError('budget_not_found')
      const named = str(args.p_period_id)
      const periodId = named ?? current()?.id ?? null
      if (periodId === null) rpcError('budget_ended')
      if (
        named !== null &&
        !db.tables.period_summaries.some(
          (period) => period.id === named && period.budget_id === args.p_budget_id,
        )
      )
        rpcError('period_not_found')
      const plan = db.moneyFlowPlans.find((item) => item.periodId === periodId)
      return moneyFlowRows(
        plan ?? { periodId, incomes: [], accounts: [], transfers: [], categories: [] },
      )
    },
  }
}

export function previewRow(overrides: Partial<TransferPreviewRow> = {}): TransferPreviewRow {
  return {
    period_id: 'period-2',
    start_date: '2026-10-23',
    end_date: '2026-11-24',
    projected: false,
    occurrence_date: '2026-11-25',
    due_date: '2026-11-25',
    amount: 100_000,
    is_automatic: true,
    category_id: null,
    follows_primary: false,
    created_at_once: false,
    created_at_once_count: 0,
    transactions_removed_count: 0,
    marks_unplanned_count: 0,
    ...overrides,
  } as TransferPreviewRow
}
