import type { MoneyFlowPlan } from '@/test/mock-transfers'

/**
 * The worked example of docs/database.md ("The money flow"): Ann's and Ben's salaries into
 * Main, a Savings standing order on payday (linked to Saving and pension, its transaction of
 * the period made), a yearly Pillar 3a transfer of 7 056.00 (its monthly share 588.00), five
 * category groups. Amounts in rappen.
 */
export function workedExamplePlan(periodId = 'period-2'): MoneyFlowPlan {
  return {
    periodId,
    incomes: [
      {
        id: 'inc-ann',
        name: 'Ann’s salary',
        amount: 600_000,
        accountId: 'acc-main',
        userId: 'user-ann',
      },
      {
        id: 'inc-ben',
        name: 'Ben’s salary',
        amount: 400_000,
        accountId: 'acc-main',
        userId: 'user-ann',
      },
    ],
    accounts: [
      { id: 'acc-main', name: 'Main', kind: 'current', createdAt: '2026-10-01T08:00:00+00:00' },
      {
        id: 'acc-savings',
        name: 'Savings',
        kind: 'savings',
        createdAt: '2026-10-01T08:01:00+00:00',
      },
      {
        id: 'acc-pillar',
        name: 'Pillar 3a',
        kind: 'third_pillar',
        createdAt: '2026-10-01T08:02:00+00:00',
      },
    ],
    transfers: [
      {
        id: 'tr-savings',
        name: 'Savings',
        from: 'acc-main',
        to: 'acc-savings',
        amount: 100_000,
        cadence: null,
        automatic: true,
        category: 'grp-saving',
      },
      {
        id: 'tr-pillar',
        name: 'Pillar 3a',
        from: 'acc-main',
        to: 'acc-pillar',
        amount: 705_600,
        cadence: 'yearly',
        automatic: true,
        category: 'grp-saving',
      },
    ],
    categories: [
      { id: 'grp-home', name: 'Home', displayOrder: 1, expected: 215_000, spent: 200_000 },
      { id: 'grp-food', name: 'Food', displayOrder: 2, expected: 110_000, spent: 72_550 },
      { id: 'grp-transport', name: 'Transport', displayOrder: 3, expected: 30_000, spent: 12_000 },
      {
        id: 'grp-leisure',
        name: 'Leisure',
        displayOrder: 4,
        expected: 35_000,
        yearly: 240_000,
        spent: 6_000,
      },
      {
        id: 'grp-saving',
        name: 'Saving and pension',
        displayOrder: 5,
        expected: 158_800,
        yearly: 705_600,
        spent: 100_000,
        transferSpent: 100_000,
      },
    ],
  }
}
