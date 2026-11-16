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
    income_versions: [],
    incomes: [],
    periods: [],
    profiles: [],
    budget_member_list: [],
    income_overview: [],
    my_budgets: [],
    period_summaries: [],
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
    update_income_terms: handler(() => null),
  }

  return db
}

type Filter = { column: string; value: unknown }
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

    const rows = () => db.tables[relation] as Record<string, unknown>[]
    const matches = (row: Record<string, unknown>) =>
      filters.every((filter) => row[filter.column] === filter.value)

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
        if (single) {
          if (result.length > 1) return { data: null, error: dbError('multiple rows', 'PGRST116') }
          if (result.length === 0 && single === 'one') {
            return { data: null, error: dbError('no rows', 'PGRST116') }
          }
          return { data: result[0] ?? null, error: null }
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
    (name: FunctionName, args: Record<string, unknown> = {}): Promise<RpcResult> => {
      const handle = db.rpc[name]
      try {
        return Promise.resolve({ data: handle(args) ?? null, error: null })
      } catch (failure) {
        if (failure instanceof RpcFailure)
          return Promise.resolve({ data: null, error: failure.error })
        throw failure
      }
    },
  )

  return { from, rpc }
}
