/**
 * Query keys. Everything that belongs to one budget sits under ['budget', budgetId], so a
 * write can refetch all of a budget's data with one key (C-QUERY-001).
 */
export const budgetKeys = {
  /** my_budgets: the budgets I belong to. */
  list: ['budgets'] as const,
  /** Invitations addressed to me (list_my_invitations). */
  myInvitations: ['my-invitations'] as const,
  budget: (budgetId: string) => ['budget', budgetId] as const,
  ensurePeriods: (budgetId: string) => ['budget', budgetId, 'ensure-periods'] as const,
  currentPeriod: (budgetId: string) => ['budget', budgetId, 'current-period'] as const,
  periods: (budgetId: string) => ['budget', budgetId, 'periods'] as const,
  incomes: (budgetId: string) => ['budget', budgetId, 'incomes'] as const,
  members: (budgetId: string) => ['budget', budgetId, 'members'] as const,
  invitations: (budgetId: string) => ['budget', budgetId, 'invitations'] as const,
}
