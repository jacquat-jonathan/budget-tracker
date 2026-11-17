import { vi } from 'vitest'

import type { Database } from '@/lib/database.types'
import { step7Handlers, type ChecklistRow, type MoneyFlowPlan } from '@/test/mock-transfers'

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
type Step7Name =
  | 'close_account'
  | 'create_account'
  | 'update_account'
  | 'preview_close_account'
  | 'create_transfer'
  | 'update_transfer'
  | 'end_transfer'
  | 'preview_create_transfer'
  | 'preview_update_transfer'
  | 'preview_end_transfer'
  | 'get_transfer_terms'
  | 'get_transfer_checklist'
  | 'get_transfers_to_do'
  | 'get_money_flow'
  | 'mark_transfer_done'
  | 'mark_transfer_not_done'
  | 'skip_transfer'
  | 'undo_transfer_mark'

export type MockTables = { [N in RelationName]: RowOf<N>[] }

export interface MockError {
  code: string
  message: string
  details?: string | null
  hint?: string | null
}

/** A database error the way PostgREST reports a raised exception (P0001 + stable code). */
export function dbError(message: string, code = 'P0001', detail?: unknown): MockError {
  return {
    code,
    message,
    details: detail === undefined ? null : JSON.stringify(detail),
    hint: null,
  }
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

export function rpcError(message: string, code = 'P0001', detail?: unknown): never {
  throw new RpcFailure(dbError(message, code, detail))
}

export interface MockDb {
  tables: MockTables
  rpc: Record<FunctionName, ReturnType<typeof vi.fn<RpcHandler>>>
  /** Make the next read of a relation fail with this error. */
  failNextRead: (relation: RelationName, error: MockError) => void
  readFailures: Map<RelationName, MockError>
  /** preview_import_part's staged parts, by batch then part. */
  staged: Record<string, Record<number, ImportRowResult[]>>
  /** import_transactions' recorded answers, by batch then chunk (a written part, D-522). */
  written: Record<string, Record<number, ImportRowResult[]>>
  /** get_transfer_checklist's rows, every period's (the marks change them in place). */
  checklist: ChecklistRow[]
  /** The plans get_money_flow reads, one per period (moneyFlowRows builds its rows). */
  moneyFlowPlans: MoneyFlowPlan[]
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
    // Step 6: import (the tables are not selectable; the screens read the views and calls).
    import_batches: [],
    import_batch_list: [],
    import_choices: [],
    import_skipped_rows: [],
    import_tokens: [],
    import_token_list: [],
    merchant_rules: [],
    merchant_rule_list: [],
    // Step 7: no screens yet.
    accounts: [],
    account_overview: [],
    transfers: [],
    transfer_versions: [],
    transfer_occurrences: [],
    transfer_overview: [],
  }
}

type ImportRowResult = PublicSchema['CompositeTypes']['import_row_result']

/**
 * What the import plans for a row by default, in the mock: imported, an expense for a debit
 * and a refund for a credit, into "to categorise" unless the row names a category. Tests of
 * duplicates, flags and matches give preview_import / import_transactions their own answer.
 */
export function plannedRow(row: Record<string, unknown>, rowNo: number): ImportRowResult {
  const direction = row.direction === 'credit' ? 'credit' : 'debit'
  const chosenKind = row.kind === 'extra_income' ? 'extra_income' : null
  const kind = direction === 'debit' ? 'expense' : (chosenKind ?? 'refund')
  const skip = row.action === 'skip'
  const category = typeof row.category_id === 'string' ? row.category_id : null
  const text =
    typeof row.merchant === 'string'
      ? row.merchant
      : typeof row.description === 'string'
        ? row.description
        : ''
  return {
    row_no: rowNo,
    chunk: null,
    valid: true,
    reason: null,
    action: skip ? 'skip_chosen' : 'import',
    kind,
    category_id: kind === 'extra_income' ? null : category,
    category_source: kind === 'extra_income' ? null : category ? 'choice' : 'to_categorise',
    rule_id: null,
    date: String(row.date),
    amount: Number(row.amount),
    direction,
    description: typeof row.description === 'string' ? row.description : null,
    merchant_key: text.toLowerCase().trim() || null,
    flag: null,
    remembered_choice: null,
    choice_key: null,
    duplicate_of: null,
    match_of: null,
    match_is_charge: false,
    salary_income_id: null,
    salary_income_amount: null,
    transaction_id: null,
  }
}

function rowsOf(args: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(args.p_rows) ? (args.p_rows as Record<string, unknown>[]) : []
}

const ACTIONS = [
  'import',
  'skip_duplicate',
  'skip_flagged',
  'skip_matched',
  'confirm_match',
  'skip_chosen',
  'invalid',
] as const

/** preview_import_part's totals of some rows (D-455): one count per action, and by kind. */
export function partTotals(rows: readonly ImportRowResult[]): Record<string, number> {
  const totals: Record<string, number> = { rows: rows.length }
  for (const action of ACTIONS) totals[action] = rows.filter((row) => row.action === action).length
  for (const kind of ['expense', 'refund', 'extra_income']) {
    const of = rows.filter((row) => row.action === 'import' && row.kind === kind)
    totals[`${kind}_count`] = of.length
    totals[`${kind}_amount`] = of.reduce((sum, row) => sum + (row.amount ?? 0), 0)
  }
  return totals
}

/**
 * preview_import_part's answer for a part planned as `rows`: staged per batch (previewing a part
 * again forgets the staged parts from it on), with the totals of the part and of the parts
 * staged so far, the room and whether the statement fits.
 */
export function stagedPart(
  db: MockDb,
  args: Record<string, unknown>,
  rows: ImportRowResult[],
  room = 50_000 - db.tables.transaction_list.length,
) {
  const part = Number(args.p_part)
  const batch = String(args.p_batch_id)
  const kept = Object.entries(db.staged[batch] ?? {}).filter(([key]) => Number(key) < part)
  const staged: Record<number, ImportRowResult[]> = Object.fromEntries([...kept, [part, rows]])
  db.staged[batch] = staged
  const parts = Object.keys(staged)
    .map(Number)
    .sort((a, b) => a - b)
  const all = parts.flatMap((key) => staged[key] ?? [])
  const toImport = all.filter((row) => row.action === 'import').length
  return {
    rows,
    part: partTotals(rows),
    statement: partTotals(all),
    parts,
    room,
    fits: toImport <= room,
    written: false,
  }
}

/**
 * preview_import_part for a part whose chunk is written (D-522): what that chunk recorded, its
 * totals, `written` true, `statement` and `parts` null (as the database answers), nothing staged.
 */
export function writtenPart(rows: ImportRowResult[], room: number) {
  return {
    rows,
    part: partTotals(rows),
    statement: null,
    parts: null,
    room,
    fits: true,
    written: true,
  }
}

export function createMockDb(tables: Partial<MockTables> = {}): MockDb {
  const readFailures = new Map<RelationName, MockError>()
  const db: MockDb = {
    tables: { ...emptyTables(), ...tables },
    rpc: {} as MockDb['rpc'],
    readFailures,
    staged: {},
    written: {},
    checklist: [],
    moneyFlowPlans: [],
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
        transfer_transactions_removed: 0,
        transfer_transactions_created: 0,
        transfer_marks_unplanned: 0,
        transfer_transactions_moved: 0,
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
      // As the database: another budget's (or a deleted) transfer is transfer_not_found.
      if (
        typeof args.p_transfer_id === 'string' &&
        !db.tables.transfer_overview.some(
          (row) => row.id === args.p_transfer_id && row.budget_id === args.p_budget_id,
        )
      )
        rpcError('transfer_not_found')
      return db.tables.transaction_list
        .filter((row) => row.budget_id === args.p_budget_id)
        .filter((row) => typeof args.p_from_date !== 'string' || row.date >= args.p_from_date)
        .filter((row) => typeof args.p_to_date !== 'string' || row.date <= args.p_to_date)
        .filter((row) => !args.p_kind || row.kind === args.p_kind)
        .filter((row) => !args.p_awaiting_only || row.review_state === 'awaiting_confirmation')
        .filter((row) => !args.p_to_review_only || row.review_state === 'to_review')
        .filter((row) => !args.p_import_batch_id || row.import_batch_id === args.p_import_batch_id)
        .filter((row) => !args.p_debt_id || row.debt_id === args.p_debt_id)
        .filter((row) => !args.p_subscription_id || row.subscription_id === args.p_subscription_id)
        .filter((row) => !args.p_transfer_id || row.transfer_id === args.p_transfer_id)
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
    confirm_subscription_charge: handler((args) => {
      db.tables.transaction_list = db.tables.transaction_list.map((row) =>
        row.id === args.p_transaction_id ? { ...row, review_state: 'confirmed' as const } : row,
      )
      return []
    }),
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
          account_id: row.account_id,
          terms_from_period_id: args.p_period_id,
          until_period_id: null,
        },
      ]
    }),
    // A move to a date the test typed is accepted and touches no transfer; without a date
    // the period is on its schedule already. Tests of a refusal give their own answer.
    // A move to the start the period already has is refused as a no-op (R-ACCOUNT-426), as the
    // database answers it: already_on_schedule, every count 0.
    preview_move_period_start: handler((args) => {
      const start = db.tables.period_summaries.find((p) => p.id === args.p_period_id)?.start_date
      const typed = typeof args.p_start_date === 'string' ? args.p_start_date : null
      const moves = typed !== null && typed !== start
      return [
        {
          period_id: args.p_period_id,
          scheduled_start: typed ?? '2026-10-23',
          accepted: moves,
          refusal: moves ? null : 'already_on_schedule',
          interest_removed: 0,
          transfer_transactions_removed: 0,
          transfer_transactions_created: 0,
          transfer_marks_unplanned: 0,
          transfer_transactions_moved: 0,
        },
      ]
    }),
    // The salary early or expected on another day: accepted, touching no transfer.
    preview_record_early_pay_date: handler((args) => [
      {
        period_id: args.p_budget_id,
        accepted: true,
        refusal: null,
        transfer_transactions_removed: 0,
        transfer_transactions_created: 0,
        transfer_marks_unplanned: 0,
        transfer_transactions_moved: 0,
      },
    ]),
    preview_set_expected_pay_date: handler((args) => [
      {
        period_id: args.p_budget_id,
        accepted: true,
        refusal: null,
        transfer_transactions_removed: 0,
        transfer_transactions_created: 0,
        transfer_marks_unplanned: 0,
        transfer_transactions_moved: 0,
      },
    ]),
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
    // Step 6: import. The plan is the mock's simple default (plannedRow); tests of the
    // database's decisions give these their own answers.
    preview_import: handler((args) => rowsOf(args).map((row, index) => plannedRow(row, index + 1))),
    // A chunk sent again answers what it answered the first time; writing a chunk removes the
    // part staged for it (D-522).
    import_transactions: handler((args) => {
      const batch = String(args.p_batch_id)
      const chunk = Number(args.p_chunk)
      const before = db.written[batch]?.[chunk]
      if (before) return before.map((row) => ({ ...row }))
      const answer = rowsOf(args).map((row, index) => ({
        ...plannedRow(row, index + 1),
        chunk,
        transaction_id: `imported-${String(args.p_chunk)}-${index + 1}`,
      }))
      db.written[batch] = { ...db.written[batch], [chunk]: answer }
      db.staged[batch] = Object.fromEntries(
        Object.entries(db.staged[batch] ?? {}).filter(([part]) => Number(part) !== chunk),
      )
      return answer
    }),
    // A part's rows as preview_import plans them, with the totals of the part and of the parts
    // staged so far in this batch (kept per batch here, forgotten from a part previewed again).
    preview_import_part: handler((args) => {
      const written = db.written[String(args.p_batch_id)]?.[Number(args.p_part)]
      if (written) return writtenPart(written, 50_000 - db.tables.transaction_list.length)
      return stagedPart(
        db,
        args,
        rowsOf(args).map((row, index) => plannedRow(row, index + 1)),
      )
    }),
    // As the database (D-523): the batch's skipped rows sent (or all, at most 500) that are
    // still kept, not invalid and not imported are imported, in statement order, each planned
    // again with its kind and category dropped, its original chunk and row number; the batch's
    // counts move to the imported ones. Then each distinct id sent that is not a skipped row the
    // batch keeps answers one row: action and reason 'not_kept', valid false, all else null.
    import_skipped_anyway: handler((args) => {
      const batch = db.tables.import_batch_list.find((row) => row.id === args.p_batch_id)
      if (!batch) rpcError('import_batch_not_found')
      if (batch.undone_at !== null) rpcError('batch_undone')
      const ids = Array.isArray(args.p_skipped_row_ids)
        ? [...new Set(args.p_skipped_row_ids as string[])]
        : null
      const kept = db.tables.import_skipped_rows
        .filter((row) => row.batch_id === batch.id)
        .sort((a, b) => a.chunk - b.chunk || a.row_no - b.row_no)
      const counts: Record<string, keyof typeof batch> = {
        duplicate: 'duplicate_count',
        flagged: 'flagged_count',
        matched: 'matched_count',
        chosen: 'chosen_skip_count',
      }
      const imported = kept
        .filter((row) => ids === null || ids.includes(row.id))
        .filter((row) => row.reason !== 'invalid' && row.imported_transaction_id === null)
        .slice(0, 500)
        .map((row) => {
          row.imported_transaction_id = `tx-${row.id}`
          const count = counts[row.reason]
          if (count) (batch[count] as number) -= 1
          batch.imported_count += 1
          batch.to_review_count = (batch.to_review_count ?? 0) + 1
          // Its kind from its direction, into "to categorise" (the real call names that
          // category's id; the mock has none), with the transaction it made.
          return {
            ...plannedRow(row.row_data as Record<string, unknown>, row.row_no),
            category_id: null,
            category_source: 'to_categorise',
            match_is_charge: null,
            chunk: row.chunk,
            transaction_id: row.imported_transaction_id,
          }
        })
      const keptIds = new Set(kept.map((row) => row.id))
      const notKept = (ids ?? [])
        .filter((id) => !keptIds.has(id))
        .map(() => ({
          ...Object.fromEntries(
            Object.keys(plannedRow({ date: '', amount: 0 }, 0)).map((key) => [key, null]),
          ),
          action: 'not_kept',
          reason: 'not_kept',
          valid: false,
        }))
      return [...imported, ...notKept]
    }),
    import_with_token: handler(() => rpcError('not_mocked')),
    confirm_import: handler((args) => {
      const row = db.tables.transaction_list.find((item) => item.id === args.p_transaction_id)
      if (!row) rpcError('transaction_not_found')
      if (row.revision !== args.p_expected_revision) rpcError('record_changed')
      if (row.review_state !== 'to_review') rpcError('not_to_review')
      if (row.in_to_categorise) rpcError('category_to_categorise')
      Object.assign(row, { review_state: 'confirmed', revision: row.revision + 1 })
      return [{ ...row }]
    }),
    confirm_imports: handler((args) => {
      let confirmed = 0
      let left = 0
      for (const row of db.tables.transaction_list) {
        if (row.budget_id !== args.p_budget_id || row.review_state !== 'to_review') continue
        if (args.p_batch_id && row.import_batch_id !== args.p_batch_id) continue
        if (row.in_to_categorise) left += 1
        else {
          Object.assign(row, { review_state: 'confirmed', revision: row.revision + 1 })
          confirmed += 1
        }
      }
      return [{ confirmed, left_to_categorise: left }]
    }),
    undo_import_batch: handler(() => [
      { deleted: 0, kept_confirmed: 0, kept_linked: 0, charges_confirmed: 0 },
    ]),
    list_import_batches: handler((args) =>
      db.tables.import_batch_list
        .filter((row) => row.budget_id === args.p_budget_id)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, typeof args.p_limit === 'number' ? args.p_limit : 50),
    ),
    list_import_skipped_rows: handler((args) =>
      db.tables.import_skipped_rows
        .filter((row) => row.batch_id === args.p_batch_id)
        .filter(
          (row) =>
            typeof args.p_after_chunk !== 'number' ||
            row.chunk > args.p_after_chunk ||
            (row.chunk === args.p_after_chunk && row.row_no > Number(args.p_after_row_no)),
        )
        .sort((a, b) => a.chunk - b.chunk || a.row_no - b.row_no)
        .slice(0, typeof args.p_limit === 'number' ? args.p_limit : 100),
    ),
    get_import_batch: handler((args) => {
      const batch = db.tables.import_batch_list.find((row) => row.id === args.p_batch_id)
      if (!batch) rpcError('import_batch_not_found')
      return [batch]
    }),
    forget_import_choice: handler((args) => {
      const before = db.tables.import_choices.length
      db.tables.import_choices = db.tables.import_choices.filter(
        (row) =>
          !(
            row.budget_id === args.p_budget_id &&
            row.flag === args.p_flag &&
            row.counterparty_key === args.p_counterparty_key
          ),
      )
      return db.tables.import_choices.length < before
    }),
    // The fragment as stored (lower case, trimmed), the rule the import would pick for it (the
    // longest fragment it contains) and how many waiting in "to categorise" it would move.
    // As the database: membership first, then the raw length (over 1000: invalid_fragment before
    // any work, R-IMPORT-421), then the fragment as stored (1 to 100 characters).
    preview_merchant_rule: handler((args) => {
      if (!db.tables.my_budgets.some((budget) => budget.id === args.p_budget_id))
        rpcError('budget_not_found')
      const raw = typeof args.p_fragment === 'string' ? args.p_fragment : ''
      if (raw.length > 1000) rpcError('invalid_fragment')
      const fragment = raw.toLowerCase().trim()
      if (fragment === '' || fragment.length > 100) rpcError('invalid_fragment')
      const rules = db.tables.merchant_rule_list.filter(
        (rule) => rule.budget_id === args.p_budget_id,
      )
      const covering = rules
        .filter((rule) => fragment.includes(rule.fragment))
        .sort((a, b) => b.fragment.length - a.fragment.length)[0]
      const wouldMove = db.tables.transaction_list.filter(
        (row) =>
          row.budget_id === args.p_budget_id &&
          row.review_state === 'to_review' &&
          row.in_to_categorise === true &&
          row.subscription_id === null &&
          row.debt_id === null &&
          (row.merchant_key ?? '').includes(fragment),
      ).length
      return [
        {
          fragment,
          covered_by_rule_id: covering?.id ?? null,
          covered_by_fragment: covering?.fragment ?? null,
          rule_exists: rules.some((rule) => rule.fragment === fragment),
          would_move: wouldMove,
        },
      ]
    }),
    list_import_choices: handler((args) =>
      db.tables.import_choices
        .filter((row) => row.budget_id === args.p_budget_id)
        .slice(0, typeof args.p_limit === 'number' ? args.p_limit : 100),
    ),
    create_import_token: handler(() => [
      {
        token_id: 'new-token-id',
        token: `bti_${'0123456789abcdef'.repeat(4)}`,
        expires_at: '2026-12-16T10:00:00+00:00',
      },
    ]),
    revoke_import_token: handler(() => null),
    delete_import_token: handler(() => null),
    create_merchant_rule: handler((args) => {
      const fragment = String(args.p_fragment)
      if (fragment.length > 1000 || fragment.trim() === '' || fragment.trim().length > 100)
        rpcError('invalid_fragment')
      return [
        { rule_id: 'new-rule-id', fragment: fragment.toLowerCase().trim(), revision: 1, moved: 0 },
      ]
    }),
    update_merchant_rule: handler((args) => {
      if (typeof args.p_fragment === 'string') {
        const fragment = args.p_fragment
        if (fragment.length > 1000 || fragment.trim() === '' || fragment.trim().length > 100)
          rpcError('invalid_fragment')
      }
      const rule = db.tables.merchant_rule_list.find((row) => row.id === args.p_rule_id)
      if (!rule) rpcError('merchant_rule_not_found')
      if (rule.revision !== args.p_expected_revision) rpcError('record_changed')
      return [{ rule_id: rule.id, fragment: rule.fragment, revision: rule.revision + 1, moved: 0 }]
    }),
    delete_merchant_rule: handler(() => null),
    // Step 7: accounts, transfers, the checklist and its marks, the money flow.
    ...(Object.fromEntries(
      Object.entries(step7Handlers(db)).map(([name, impl]) => [name, handler(impl)]),
    ) as Pick<MockDb['rpc'], Step7Name>),
  }

  return db
}

type Filter = { column: string; value: unknown; op?: 'eq' | 'lte' | 'in' }
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
          : filter.op === 'in'
            ? (filter.value as unknown[]).includes(row[filter.column])
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
      in: vi.fn((column: string, values: unknown[]) => {
        filters.push({ column, value: values, op: 'in' })
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
