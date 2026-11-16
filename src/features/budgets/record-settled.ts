import { useIsFetching } from '@tanstack/react-query'

import { budgetKeys } from '@/features/budgets/budget-keys'

/**
 * True once the record a form saves over has been read afresh (useRecord) and no read of it
 * is under way: a save sent before would carry the revision of a list read earlier (for
 * example the one this form's previous save made stale) and be refused for nothing.
 */
export function useRecordSettled(
  budgetId: string,
  view: 'subscription_overview' | 'debt_overview',
  id: string | undefined,
  live: unknown,
): boolean {
  const fetching = useIsFetching({
    queryKey: [...budgetKeys.budget(budgetId), 'record', view, id ?? ''],
  })
  return id === undefined || (live !== undefined && fetching === 0)
}
