import type { Database, Tables } from '@/lib/database.types'
import type { MockDb } from '@/test/mock-db'
import { rpcError } from '@/test/mock-db'

/**
 * The step 7 calls of the in-memory database: accounts, planned transfers, the checklist and
 * its marks, the dashboard's counts and the money flow. They behave as docs/database.md says
 * for what the screens do (revisions, refusals, the states a mark leads to); what only the
 * database can work out (due dates, previews, the flow) comes from the rows a test puts in
 * `db.checklist`, `db.moneyFlow`, or from the handlers' simple defaults.
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
    ...overrides,
  }
}

export function moneyFlowRow(overrides: Partial<MoneyFlowRow>): MoneyFlowRow {
  // The generated type marks every column required; the contract leaves most of them null.
  return {
    row_kind: 'account',
    id: null,
    name: null,
    source_id: null,
    target_id: null,
    amount: null,
    inflow: null,
    outflow: null,
    stays: null,
    is_negative: null,
    account_kind: null,
    user_id: null,
    is_automatic: null,
    period_id: 'period-2',
    planned_amount: null,
    cadence: null,
    ...overrides,
  } as unknown as MoneyFlowRow
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
    undo_transfer_mark: (args) => {
      const row = occurrence(args)
      if ((row.mark_revision ?? 0) === 0 || row.assumed) rpcError('nothing_to_undo')
      if (row.planned === false) {
        db.checklist = db.checklist.filter((item) => item !== row)
        return []
      }
      const due = row.due_date !== null && row.due_date <= today()
      Object.assign(row, {
        status: row.is_automatic ? (due ? 'done' : 'upcoming') : 'to_do',
        assumed: row.is_automatic && due,
        is_overdue: !row.is_automatic && due,
        done_on: row.is_automatic && due ? row.due_date : null,
        amount_moved: row.is_automatic && due ? row.amount : null,
        transaction_id: null,
        recorded_by: null,
        recorded_by_name: null,
        mark_revision: 0,
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
    get_money_flow: (args) => {
      const periodId = str(args.p_period_id) ?? current()?.id ?? null
      if (periodId === null) rpcError('budget_ended')
      return db.moneyFlow.filter((row) => row.period_id === periodId).map((row) => ({ ...row }))
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
