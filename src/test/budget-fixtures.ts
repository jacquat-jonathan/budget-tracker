import type { Tables } from '@/lib/database.types'
import { createMockDb, type MockDb, type MockTables } from '@/test/mock-db'

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
    end_month: null,
    is_owner: true,
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
    month: '2026-10-01',
    anchor_date: '2026-10-23',
    start_date: '2026-10-23',
    end_date: '2026-11-24',
    today: '2026-11-15',
    end_is_manual: false,
    is_current: true,
    income_total: 650_000,
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
        month: '2026-09-01',
        anchor_date: '2026-09-25',
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
