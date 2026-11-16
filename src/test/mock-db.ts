import { vi } from 'vitest'

import type { Database } from '@/lib/database.types'

/**
 * An in-memory stand-in for the database behind the Supabase mock: tables and views as
 * arrays of rows, and RPCs as vi.fn handlers. It answers the way supabase-js does
 * ({ data, error }), so the app code runs unchanged. It implements only what the client
 * uses (select, eq, order, update, delete, maybeSingle); RLS and the domain logic are the
 * database's, so tests put the rows they expect the database to return.
 */

type PublicSchema = Database['public']
type RelationName = keyof PublicSchema['Tables'] | keyof PublicSchema['Views']
type RowOf<N extends RelationName> = N extends keyof PublicSchema['Tables']
  ? PublicSchema['Tables'][N]['Row']
  : N extends keyof PublicSchema['Views']
    ? PublicSchema['Views'][N]['Row']
    : never
type FunctionName = keyof PublicSchema['Functions']

export type MockTables = { [N in RelationName]: RowOf<N>[] }

export interface MockError {
  code: string
  message: string
  details?: string | null
  hint?: string | null
}

/** A database error the way PostgREST reports a raised exception (P0001 + stable code). */
export function dbError(message: string, code = 'P0001'): MockError {
  return { code, message, details: null, hint: null }
}

type RpcResult = { data: unknown; error: MockError | null }
type RpcHandler = (args: Record<string, unknown>) => unknown

/** Throw this from an RPC handler (or return it via rpcError) to fail the call. */
export class RpcFailure extends Error {
  readonly error: MockError
  constructor(error: MockError) {
    super(error.message)
    this.error = error
  }
}

export function rpcError(message: string, code = 'P0001'): never {
  throw new RpcFailure(dbError(message, code))
}

export interface MockDb {
  tables: MockTables
  rpc: Record<FunctionName, ReturnType<typeof vi.fn<RpcHandler>>>
  /** Make the next read of a relation fail with this error. */
  failNextRead: (relation: RelationName, error: MockError) => void
  readFailures: Map<RelationName, MockError>
}

function emptyTables(): MockTables {
  return {
    budget_invitations: [],
    budget_members: [],
    budgets: [],
    categories: [],
    category_expectations: [],
    category_overview: [],
    transactions: [],
    transaction_list: [],
    income_versions: [],
    incomes: [],
    periods: [],
    profiles: [],
    budget_member_list: [],
    income_overview: [],
    my_budgets: [],
    period_summaries: [],
    subscriptions: [],
    subscription_versions: [],
    subscription_overview: [],
    debts: [],
    debt_versions: [],
    debt_adjustments: [],
    debt_interest: [],
    debt_overview: [],
    debt_totals: [],
  }
}

export function createMockDb(tables: Partial<MockTables> = {}): MockDb {
  const readFailures = new Map<RelationName, MockError>()
  const db: MockDb = {
    tables: { ...emptyTables(), ...tables },
    rpc: {} as MockDb['rpc'],
    readFailures,
    failNextRead: (relation, error) => {
      readFailures.set(relation, error)
    },
  }

  const handler = (impl: RpcHandler) => vi.fn<RpcHandler>(impl)
  const currentPreview = () => {
    const current = db.tables.period_summaries.find((period) => period.is_current)
    if (!current) rpcError('budget_ended')
    const next = new Date(Date.parse(`${current.end_date}T00:00:00Z`) + 86_400_000)
    return [
      {
        period_id: current.id,
        end_date: current.end_date,
        expected_pay_date: next.toISOString().slice(0, 10),
        end_is_manual: current.end_is_manual,
      },
    ]
  }
  db.rpc = {
    accept_invitation: handler(() => 'accepted-budget-id'),
    add_income: handler(() => 'new-income-id'),
    cancel_invitation: handler((args) => {
      const before = db.tables.budget_invitations.length
      db.tables.budget_invitations = db.tables.budget_invitations.filter(
        (invitation) => invitation.id !== args.p_invitation_id,
      )
      if (db.tables.budget_invitations.length === before) rpcError('invitation_not_found')
      return null
    }),
    delete_budget: handler((args) => {
      const before = db.tables.my_budgets.length
      db.tables.my_budgets = db.tables.my_budgets.filter((budget) => budget.id !== args.p_budget_id)
      if (db.tables.my_budgets.length === before) rpcError('budget_not_found')
      return null
    }),
    get_start_months: handler(() => [
      { today: '2026-11-15', month: '2026-10-01', start_date: '2026-10-23', is_default: true },
      { today: '2026-11-15', month: '2026-09-01', start_date: '2026-09-25', is_default: false },
      { today: '2026-11-15', month: '2026-08-01', start_date: '2026-08-25', is_default: false },
    ]),
    get_today: handler(() => '2026-11-15'),
    create_budget: handler(() => 'new-budget-id'),
    decline_invitation: handler(() => null),
    ensure_periods: handler(() => 0),
    get_current_period: handler((args) =>
      db.tables.period_summaries.filter(
        (period) => period.budget_id === args.p_budget_id && period.is_current,
      ),
    ),
    invite_member: handler(() => 'new-invitation-id'),
    leave_budget: handler(() => null),
    list_my_invitations: handler(() => []),
    move_period_start: handler(() => null),
    // The current period's end as it stands (tests give the projection when they need one).
    preview_update_income: handler(() => currentPreview()),
    preview_set_primary_income: handler(() => currentPreview()),
    preview_reopen: handler(() => []),
    record_early_pay_date: handler(() => []),
    reopen_previous_period: handler(() => []),
    set_expected_pay_date: handler(() => []),
    pay_date: handler(() => rpcError('not_mocked')),
    remove_income: handler(() => 'ended'),
    remove_member: handler(() => null),
    set_budget_end_date: handler((args) => {
      const budget = db.tables.my_budgets.find((row) => row.id === args.p_budget_id)
      if (!budget) rpcError('budget_not_found')
      const endDate = typeof args.p_end_date === 'string' ? args.p_end_date : null
      Object.assign(budget, { end_date: endDate, end_date_entered: endDate })
      return [{ ...budget }]
    }),
    set_primary_income: handler(() => null),
    rename_budget: handler((args) => {
      const budget = db.tables.my_budgets.find((row) => row.id === args.p_budget_id)
      if (!budget) rpcError('budget_not_found')
      if (args.p_expected_revision !== budget.revision) rpcError('record_changed')
      budget.name = String(args.p_name)
      budget.revision += 1
      return budget.revision
    }),
    update_income: handler((args) => {
      const income = db.tables.income_overview.find((row) => row.id === args.p_income_id)
      if (!income) rpcError('income_not_found')
      if (args.p_expected_revision !== income.revision) rpcError('record_changed')
      if (typeof args.p_name === 'string') income.name = args.p_name
      if (typeof args.p_amount === 'number') income.amount = args.p_amount
      if (typeof args.p_pay_day === 'number') income.pay_day = args.p_pay_day
      income.revision += 1
      return income.revision
    }),
    extend_category: handler(() => []),
    restore_category: handler(() => []),
    // Step 3: tests that use these give them their behaviour.
    create_category: handler(() => []),
    update_category: handler(() => []),
    reorder_categories: handler(() => null),
    end_category: handler(() => 'ended'),
    // The leaves in force now, top level by sort_order (dates are not modelled here).
    list_categories_for_date: handler(() =>
      db.tables.category_overview
        .filter((category) => !category.is_group && category.is_active)
        .map((category, index) => {
          const parent = db.tables.category_overview.find((row) => row.id === category.parent_id)
          return {
            category_id: category.id,
            parent_id: category.parent_id,
            name: category.name,
            parent_name: parent?.name ?? null,
            display_order: index,
          }
        }),
    ),
    add_transaction: handler(() => []),
    update_transaction: handler(() => []),
    delete_transaction: handler(() => null),
    // The contract's order (date, created_at, id, all descending), filters and cursor.
    list_transactions: handler((args) => {
      const key = (row: { date: string; created_at: string; id: string }) =>
        `${row.date}|${row.created_at}|${row.id}`
      const before =
        typeof args.p_before_date === 'string'
          ? `${args.p_before_date}|${String(args.p_before_created_at)}|${String(args.p_before_id)}`
          : null
      const children = (id: unknown) =>
        db.tables.category_overview.filter((row) => row.parent_id === id).map((row) => row.id)
      return db.tables.transaction_list
        .filter((row) => row.budget_id === args.p_budget_id)
        .filter((row) => typeof args.p_from_date !== 'string' || row.date >= args.p_from_date)
        .filter((row) => typeof args.p_to_date !== 'string' || row.date <= args.p_to_date)
        .filter((row) => !args.p_kind || row.kind === args.p_kind)
        .filter(
          (row) =>
            !args.p_category_id ||
            row.category_id === args.p_category_id ||
            children(args.p_category_id).includes(row.category_id ?? ''),
        )
        .sort((a, b) => (key(a) < key(b) ? 1 : -1))
        .filter((row) => before === null || key(row) < before)
        .slice(0, typeof args.p_limit === 'number' ? args.p_limit : 50)
    }),
    get_period_progress: handler(() => []),
    // Step 4: tests that use these give them their behaviour.
    link_transaction: handler(() => []),
    subscription_charge_dates: handler(() => []),
    create_subscription: handler(() => []),
    update_subscription: handler(() => []),
    end_subscription: handler(() => 'ended'),
    confirm_subscription_charge: handler(() => []),
    dismiss_subscription_charge: handler(() => null),
    list_charges_awaiting_confirmation: handler((args) =>
      db.tables.transaction_list.filter(
        (row) => row.budget_id === args.p_budget_id && row.review_state === 'awaiting_confirmation',
      ),
    ),
    create_debt: handler(() => []),
    update_debt: handler(() => []),
    remove_debt: handler(() => 'ended'),
    adjust_debt_balance: handler(() => []),
    delete_debt_adjustment: handler(() => []),
    get_debt_history: handler(() => []),
    // Step 4 database fix round: tests that use these give them their behaviour.
    preview_create_subscription: handler(() => []),
    preview_update_subscription: handler(() => []),
    confirm_subscription_charges: handler(() => 0),
    preview_end_subscription: handler(() => [{ outcome: 'ended', refusal: null }]),
    preview_remove_debt: handler(() => [{ outcome: 'ended', refusal: null }]),
    // By default a record's terms in any period are those it has now, open-ended: tests of a
    // correction set the terms of the period they choose.
    get_subscription_terms: handler((args) => {
      const row = db.tables.subscription_overview.find((item) => item.id === args.p_subscription_id)
      if (!row) rpcError('subscription_not_found')
      return [
        {
          period_id: args.p_period_id,
          in_force: true,
          price: row.price,
          cadence: row.cadence,
          category_id: row.category_id,
          anchor_date: row.anchor_date,
          charge_day: row.charge_day,
          terms_from_period_id: args.p_period_id,
          until_period_id: null,
        },
      ]
    }),
    get_debt_terms: handler((args) => {
      const row = db.tables.debt_overview.find((item) => item.id === args.p_debt_id)
      if (!row) rpcError('debt_not_found')
      return [
        {
          period_id: args.p_period_id,
          in_force: true,
          category_id: row.category_id,
          interest_rate: row.interest_rate,
          monthly_payment: row.monthly_payment,
          terms_from_period_id: args.p_period_id,
          until_period_id: null,
        },
      ]
    }),
    get_category_terms: handler((args) => {
      const row = db.tables.category_overview.find((item) => item.id === args.p_category_id)
      if (!row) rpcError('category_not_found')
      return [
        {
          period_id: args.p_period_id,
          in_force: true,
          amount: row.amount,
          cadence: row.cadence,
          terms_from_period_id: args.p_period_id,
          until_period_id: null,
        },
      ]
    }),
    get_income_terms: handler((args) => {
      const row = db.tables.income_overview.find((item) => item.id === args.p_income_id)
      if (!row) rpcError('income_not_found')
      return [
        {
          period_id: args.p_period_id,
          in_force: true,
          amount: row.amount,
          pay_day: row.pay_day,
          weekend_rule: row.weekend_rule,
          terms_from_period_id: args.p_period_id,
          until_period_id: null,
        },
      ]
    }),
    preview_move_period_start: handler(() => rpcError('not_mocked')),
    // list_periods: newest first, a page at a time (p_before_seq: the last row's seq).
    list_periods: handler((args) => {
      const limit = Number(args.p_limit ?? 120)
      const before = args.p_before_seq === undefined ? null : Number(args.p_before_seq)
      return db.tables.period_summaries
        .filter((period) => period.budget_id === args.p_budget_id || args.p_budget_id === undefined)
        .filter((period) => before === null || period.seq < before)
        .sort((x, y) => y.seq - x.seq)
        .slice(0, limit)
    }),
    get_period_trend: handler(() => []),
    get_category_trend: handler(() => []),
    get_period_comparison: handler(() => []),
  }

  return db
}

type Filter = { column: string; value: unknown; op?: 'eq' | 'lte' }
type Order = { column: string; ascending: boolean }

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : 1
  return JSON.stringify(a) < JSON.stringify(b) ? -1 : 1
}

/** The `from` and `rpc` members of the mock client, backed by `db`. */
export function mockDataClient(db: MockDb) {
  const { readFailures } = db

  const from = vi.fn((relation: RelationName) => {
    const filters: Filter[] = []
    const orders: Order[] = []
    let mode: 'select' | 'update' | 'delete' = 'select'
    let changes: Record<string, unknown> = {}
    let returning = false
    let single: 'maybe' | 'one' | null = null
    let limit: number | null = null

    const rows = () => db.tables[relation] as Record<string, unknown>[]
    const matches = (row: Record<string, unknown>) =>
      filters.every((filter) =>
        filter.op === 'lte'
          ? compare(row[filter.column], filter.value) <= 0
          : row[filter.column] === filter.value,
      )

    const run = (): { data: unknown; error: MockError | null } => {
      if (mode === 'select') {
        const failure = readFailures.get(relation)
        if (failure) {
          readFailures.delete(relation)
          return { data: null, error: failure }
        }
        let result = rows().filter(matches)
        for (const order of [...orders].reverse()) {
          result = [...result].sort(
            (a, b) => compare(a[order.column], b[order.column]) * (order.ascending ? 1 : -1),
          )
        }
        if (limit !== null) result = result.slice(0, limit)
        if (single) {
          if (result.length > 1) return { data: null, error: dbError('multiple rows', 'PGRST116') }
          if (result.length === 0 && single === 'one') {
            return { data: null, error: dbError('no rows', 'PGRST116') }
          }
          // A read returns a new object, as the network does.
          return { data: result[0] ? { ...result[0] } : null, error: null }
        }
        return { data: result.map((row) => ({ ...row })), error: null }
      }
      const hit = rows().filter(matches)
      if (mode === 'update') {
        for (const row of hit) Object.assign(row, changes)
      } else {
        const keep = rows().filter((row) => !matches(row))
        ;(db.tables as Record<string, unknown[]>)[relation] = keep
      }
      return { data: returning ? hit.map((row) => ({ ...row })) : null, error: null }
    }

    const builder = {
      select: vi.fn(() => {
        if (mode !== 'select') returning = true
        return builder
      }),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push({ column, value })
        return builder
      }),
      lte: vi.fn((column: string, value: unknown) => {
        filters.push({ column, value, op: 'lte' })
        return builder
      }),
      limit: vi.fn((count: number) => {
        limit = count
        return builder
      }),
      order: vi.fn((column: string, options?: { ascending?: boolean }) => {
        orders.push({ column, ascending: options?.ascending ?? true })
        return builder
      }),
      update: vi.fn((values: Record<string, unknown>) => {
        mode = 'update'
        changes = values
        return builder
      }),
      delete: vi.fn(() => {
        mode = 'delete'
        return builder
      }),
      maybeSingle: vi.fn(() => {
        single = 'maybe'
        return Promise.resolve(run())
      }),
      single: vi.fn(() => {
        single = 'one'
        return Promise.resolve(run())
      }),
      then: (
        resolve: (value: { data: unknown; error: MockError | null }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve().then(run).then(resolve, reject),
    }
    return builder
  })

  const rpc = vi.fn(
    // A handler may return a promise (a call that takes time) or fail later.
    async (name: FunctionName, args: Record<string, unknown> = {}): Promise<RpcResult> => {
      const handle = db.rpc[name]
      try {
        return { data: (await handle(args)) ?? null, error: null }
      } catch (failure) {
        if (failure instanceof RpcFailure) return { data: null, error: failure.error }
        throw failure
      }
    },
  )

  return { from, rpc }
}
