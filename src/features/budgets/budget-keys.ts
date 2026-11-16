/**
 * Query keys. Everything that belongs to one budget sits under ['budget', budgetId], so a
 * write can refetch all of a budget's data with one key.
 */
// C-QUERY-001: budget data is keyed by budget id.
export const budgetKeys = {
  /** my_budgets: the budgets I belong to. */
  list: ['budgets'] as const,
  /** Invitations addressed to me (list_my_invitations). */
  myInvitations: ['my-invitations'] as const,
  budget: (budgetId: string) => ['budget', budgetId] as const,
  ensurePeriods: (budgetId: string) => ['budget', budgetId, 'ensure-periods'] as const,
  /** This budget's my_budgets row, read again with its data (charges awaiting, caught up). */
  status: (budgetId: string) => ['budget', budgetId, 'status'] as const,
  currentPeriod: (budgetId: string) => ['budget', budgetId, 'current-period'] as const,
  periods: (budgetId: string) => ['budget', budgetId, 'periods'] as const,
  incomes: (budgetId: string) => ['budget', budgetId, 'incomes'] as const,
  members: (budgetId: string) => ['budget', budgetId, 'members'] as const,
  invitations: (budgetId: string) => ['budget', budgetId, 'invitations'] as const,
  categories: (budgetId: string) => ['budget', budgetId, 'categories'] as const,
  categoriesForDate: (budgetId: string, date: string) =>
    ['budget', budgetId, 'categories-for-date', date] as const,
  transactions: (budgetId: string) => ['budget', budgetId, 'transactions'] as const,
  progress: (budgetId: string, periodId: string) =>
    ['budget', budgetId, 'progress', periodId] as const,
  subscriptions: (budgetId: string) => ['budget', budgetId, 'subscriptions'] as const,
  awaitingCharges: (budgetId: string) => ['budget', budgetId, 'awaiting-charges'] as const,
  debts: (budgetId: string) => ['budget', budgetId, 'debts'] as const,
  debtTotals: (budgetId: string) => ['budget', budgetId, 'debt-totals'] as const,
  /** Period comparison reads (trend, category lines, side by side). */
  compare: (budgetId: string) => ['budget', budgetId, 'compare'] as const,
  debtHistory: (budgetId: string, debtId: string) =>
    ['budget', budgetId, 'debt-history', debtId] as const,
  /** Import: batches, a batch's skipped rows, previews, remembered choices. */
  imports: (budgetId: string) => ['budget', budgetId, 'imports'] as const,
  importTokens: (budgetId: string) => ['budget', budgetId, 'import-tokens'] as const,
  merchantRules: (budgetId: string) => ['budget', budgetId, 'merchant-rules'] as const,
}
