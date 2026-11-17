import type { Tables } from '@/lib/database.types'
import { createMockDb, type MockDb, type MockTables } from '@/test/mock-db'

export function subscriptionRow(
  overrides: Partial<Tables<'subscription_overview'>> = {},
): Tables<'subscription_overview'> {
  return {
    id: 'sub-netflix',
    budget_id: BUDGET_ID,
    name: 'Netflix',
    is_active: true,
    first_seq: 2,
    end_seq: null,
    price: 1_990,
    cadence: 'monthly',
    category_id: 'cat-groceries',
    category_name: 'Groceries',
    parent_category_id: null,
    parent_category_name: null,
    anchor_date: '2026-11-05',
    terms_from_seq: 2,
    monthly_cost: 1_990,
    next_charge_date: '2026-12-05',
    charged_through: '2026-11-15',
    charge_count: 1,
    awaiting_count: 0,
    removal_deletes: false,
    revision: 1,
    created_at: '2026-11-01T10:00:00+00:00',
    updated_at: '2026-11-01T10:00:00+00:00',
    charge_day: 5,
    ...overrides,
  }
}

export function debtRow(overrides: Partial<Tables<'debt_overview'>> = {}): Tables<'debt_overview'> {
  return {
    id: DEBT_ID,
    budget_id: BUDGET_ID,
    name: 'Car loan',
    category_id: 'cat-groceries',
    category_name: 'Groceries',
    parent_category_id: null,
    parent_category_name: null,
    principal: 1_200_000,
    opened_on: '2026-10-23',
    is_active: true,
    first_seq: 2,
    end_seq: null,
    interest_rate: 4.875,
    monthly_payment: 50_000,
    terms_from_seq: 2,
    interest_total: 0,
    adjustment_total: 0,
    paid_total: 50_000,
    remaining: 1_150_000,
    payoff: 'ends',
    payments_left: 24,
    expected_end_date: '2028-11-24',
    has_history: true,
    removal_deletes: false,
    revision: 1,
    created_at: '2026-10-23T10:00:00+00:00',
    updated_at: '2026-10-23T10:00:00+00:00',
    expected_end_after_budget_end: false,
    overpaid_by: 0,
    paid_percent: 4,
    ...overrides,
  }
}

/** A debt id: debt pages take uuids only. */
export const DEBT_ID = 'dddddddd-0000-0000-0000-000000000001'

export const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001'
export const OTHER_USER_ID = '00000000-0000-0000-0000-000000000002'
export const BUDGET_ID = 'bbbbbbbb-0000-0000-0000-000000000001'

/** Rows shaped like the views of docs/database.md, with overridable fields. */
export function budgetRow(overrides: Partial<Tables<'my_budgets'>> = {}): Tables<'my_budgets'> {
  return {
    id: BUDGET_ID,
    name: 'Household',
    owner_id: DEFAULT_USER_ID,
    primary_income_id: 'income-1',
    end_date: null,
    end_date_entered: null,
    is_owner: true,
    revision: 1,
    caught_up: true,
    charges_awaiting: 0,
    to_review: 0,
    to_categorise_category_id: null,
    transfers_to_do: 0,
    transfers_overdue: 0,
    first_period_start: '2026-09-25',
    created_at: '2026-10-01T10:00:00+00:00',
    updated_at: '2026-10-01T10:00:00+00:00',
    ...overrides,
  }
}

export function periodRow(
  overrides: Partial<Tables<'period_summaries'>> = {},
): Tables<'period_summaries'> {
  return {
    id: 'period-2',
    budget_id: BUDGET_ID,
    seq: 2,
    start_date: '2026-10-23',
    end_date: '2026-11-24',
    today: '2026-11-15',
    end_is_manual: false,
    is_current: true,
    revision: 1,
    income_total: 650_000,
    salary_total: 650_000,
    extra_income_total: 0,
    expected_total: 0,
    spent_total: 0,
    left_to_assign: 650_000,
    result: 650_000,
    committed_total: 0,
    transfer_committed_total: 0,
    ...overrides,
  }
}

export function incomeRow(
  overrides: Partial<Tables<'income_overview'>> = {},
): Tables<'income_overview'> {
  return {
    id: 'income-1',
    budget_id: BUDGET_ID,
    user_id: DEFAULT_USER_ID,
    user_display_name: 'Alex',
    name: 'Salary',
    is_primary: true,
    is_active: true,
    first_seq: 1,
    end_seq: null,
    amount: 650_000,
    pay_day: 25,
    weekend_rule: 'nearest',
    terms_from_seq: 1,
    next_pay_date: '2026-11-25',
    account_id: null,
    account_name: null,
    revision: 1,
    created_at: '2026-10-01T10:00:00+00:00',
    updated_at: '2026-10-01T10:00:00+00:00',
    ...overrides,
  }
}

export function memberRow(
  overrides: Partial<Tables<'budget_member_list'>> = {},
): Tables<'budget_member_list'> {
  return {
    budget_id: BUDGET_ID,
    user_id: DEFAULT_USER_ID,
    role: 'owner',
    display_name: 'Alex',
    email: 'alex@example.com',
    joined_at: '2026-10-01T10:00:00+00:00',
    ...overrides,
  }
}

/**
 * A database where `userId` owns one budget, "Household", with one income and two periods,
 * the second one current. The default for tests that are not about budgets.
 */
export function householdDb(userId = DEFAULT_USER_ID, tables: Partial<MockTables> = {}): MockDb {
  return createMockDb({
    my_budgets: [budgetRow({ owner_id: userId })],
    period_summaries: [
      periodRow({
        id: 'period-1',
        seq: 1,
        start_date: '2026-09-25',
        end_date: '2026-10-22',
        is_current: false,
        end_is_manual: true,
      }),
      periodRow(),
    ],
    income_overview: [incomeRow({ user_id: userId })],
    budget_member_list: [memberRow({ user_id: userId })],
    ...tables,
  })
}

export function categoryRow(
  overrides: Partial<Tables<'category_overview'>> = {},
): Tables<'category_overview'> {
  return {
    id: 'cat-groceries',
    budget_id: BUDGET_ID,
    parent_id: null,
    name: 'Groceries',
    sort_order: 1,
    is_group: false,
    is_active: true,
    first_seq: 1,
    end_seq: null,
    amount: 90_000,
    cadence: 'monthly',
    monthly_amount: 90_000,
    terms_from_seq: 1,
    has_transactions: true,
    removal_deletes: false,
    committed_amount: 0,
    transfer_committed_amount: 0,
    in_use: false,
    is_to_categorise: false,
    revision: 1,
    created_at: '2026-10-01T10:00:00+00:00',
    updated_at: '2026-10-01T10:00:00+00:00',
    ...overrides,
  }
}

export function transactionRow(
  overrides: Partial<Tables<'transaction_list'>> = {},
): Tables<'transaction_list'> {
  return {
    id: 'tx-1',
    budget_id: BUDGET_ID,
    kind: 'expense',
    amount: 8_790,
    date: '2026-11-08',
    period_id: 'period-2',
    category_id: 'cat-groceries',
    category_name: 'Groceries',
    parent_category_id: null,
    parent_category_name: null,
    description: 'Migros',
    recorded_by: DEFAULT_USER_ID,
    recorded_by_name: 'Alex',
    revision: 1,
    created_at: '2026-11-08T10:00:00+00:00',
    updated_at: '2026-11-08T10:00:00+00:00',
    subscription_id: null,
    subscription_name: null,
    debt_id: null,
    debt_name: null,
    charge_date: null,
    review_state: 'confirmed',
    debt_ended: false,
    import_batch_id: null,
    import_source: null,
    bank_transaction_id: null,
    merchant: null,
    merchant_key: null,
    details: null,
    in_to_categorise: false,
    transfer_id: null,
    transfer_name: null,
    transfer_occurrence_date: null,
    ...overrides,
  }
}

/**
 * The household with categories: Rent, Groceries, Insurance (a group of Health, and Car with
 * a yearly amount), and Old hobby, ended in the current period.
 */
export function categoriesDb(tables: Partial<MockTables> = {}): MockDb {
  return householdDb(DEFAULT_USER_ID, {
    category_overview: [
      categoryRow({
        id: 'cat-rent',
        name: 'Rent',
        sort_order: 0,
        amount: 210_000,
        monthly_amount: 210_000,
      }),
      categoryRow(),
      categoryRow({
        id: 'cat-insurance',
        name: 'Insurance',
        sort_order: 2,
        is_group: true,
        amount: null,
        cadence: null,
        monthly_amount: 56_000,
        terms_from_seq: null,
      }),
      categoryRow({
        id: 'cat-health',
        parent_id: 'cat-insurance',
        name: 'Health',
        sort_order: 0,
        amount: 48_000,
        monthly_amount: 48_000,
      }),
      categoryRow({
        id: 'cat-car',
        parent_id: 'cat-insurance',
        name: 'Car',
        sort_order: 1,
        amount: 96_000,
        cadence: 'yearly',
        monthly_amount: 8_000,
        has_transactions: false,
      }),
      categoryRow({
        id: 'cat-hobby',
        name: 'Old hobby',
        sort_order: 3,
        is_active: false,
        end_seq: 2,
      }),
    ],
    ...tables,
  })
}
