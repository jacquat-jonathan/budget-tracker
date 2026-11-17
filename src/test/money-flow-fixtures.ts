import type { MoneyFlowPlan } from '@/test/mock-transfers'

/**
 * A chain of transfers with money sent back (invented): Salary Lena into Salary account, a side
 * job that names no account, Salary account -> Household -> Holiday fund and Buffer, Holiday
 * fund sends on more than it receives (to Investments), Buffer sends money back to Salary
 * account; Cash box has nothing planned. Set aside 1 100.00 although 1 800.00 enters its bar
 * (Holiday fund is below nothing). `back` sets what Buffer sends back.
 */
export function chainPlan(back = 40_000, periodId = 'period-2'): MoneyFlowPlan {
  const at = (minute: number) => `2026-10-01T08:0${minute}:00+00:00`
  return {
    periodId,
    incomes: [
      { id: 'inc-lena', name: 'Salary Lena', amount: 600_000, accountId: 'acc-salary' },
      { id: 'inc-side', name: 'Side job', amount: 80_000, accountId: null },
    ],
    accounts: [
      { id: 'acc-salary', name: 'Salary account', kind: 'current', createdAt: at(0) },
      { id: 'acc-house', name: 'Household account', kind: 'current', createdAt: at(1) },
      { id: 'acc-holiday', name: 'Holiday fund', kind: 'savings', createdAt: at(2) },
      { id: 'acc-buffer', name: 'Buffer', kind: 'savings', createdAt: at(3) },
      { id: 'acc-invest', name: 'Investments', kind: 'investment', createdAt: at(4) },
      { id: 'acc-cash', name: 'Cash box', kind: 'cash', createdAt: at(5) },
    ],
    transfers: [
      { id: 'tr-house', name: 'Household', from: 'acc-salary', to: 'acc-house', amount: 300_000 },
      { id: 'tr-holiday', name: 'Holiday', from: 'acc-house', to: 'acc-holiday', amount: 50_000 },
      { id: 'tr-buffer', name: 'Buffer', from: 'acc-house', to: 'acc-buffer', amount: 100_000 },
      { id: 'tr-invest', name: 'Invest', from: 'acc-holiday', to: 'acc-invest', amount: 120_000 },
      { id: 'tr-back', name: 'Back to salary', from: 'acc-buffer', to: 'acc-salary', amount: back },
    ],
    categories: [
      { id: 'grp-home', name: 'Home', displayOrder: 1, expected: 180_000, spent: 190_000 },
      { id: 'grp-food', name: 'Food', displayOrder: 2, expected: 85_000, spent: 60_000 },
      { id: 'grp-fun', name: 'Fun', displayOrder: 3, expected: 30_000, spent: 5_000 },
    ],
  }
}

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
        // Its transaction of 25 Oct was made.
        spent: 100_000,
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
      },
    ],
  }
}

/**
 * The second worked example of docs/database.md ("a linked transfer into an everyday account",
 * R-ACCOUNT-465): income 6 000.00 into Main; Main (current), Cash (cash), Savings (savings);
 * "Pocket money" 500.00 on payday, Main -> Cash, automatic, linked to the category Pocket money
 * (its transaction made); Food planned 800.00, 300.00 spent. Amounts in rappen.
 */
export function cashWalletPlan(periodId = 'period-2'): MoneyFlowPlan {
  return {
    periodId,
    incomes: [{ id: 'inc-main', name: 'Salary', amount: 600_000, accountId: 'acc-main' }],
    accounts: [
      { id: 'acc-main', name: 'Main', kind: 'current', createdAt: '2026-10-01T08:00:00+00:00' },
      { id: 'acc-cash', name: 'Cash', kind: 'cash', createdAt: '2026-10-01T08:01:00+00:00' },
      {
        id: 'acc-savings',
        name: 'Savings',
        kind: 'savings',
        createdAt: '2026-10-01T08:02:00+00:00',
      },
    ],
    transfers: [
      {
        id: 'tr-pocket',
        name: 'Pocket money',
        from: 'acc-main',
        to: 'acc-cash',
        amount: 50_000,
        cadence: null,
        automatic: true,
        category: 'grp-pocket',
        spent: 50_000,
      },
    ],
    categories: [
      { id: 'grp-pocket', name: 'Pocket money', displayOrder: 1, expected: 50_000, spent: 50_000 },
      { id: 'grp-food', name: 'Food', displayOrder: 2, expected: 80_000, spent: 30_000 },
    ],
  }
}
