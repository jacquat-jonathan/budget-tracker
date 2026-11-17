import { useQuery } from '@tanstack/react-query'

import { budgetKeys } from '@/features/budgets/budget-keys'
import { unwrap } from '@/features/budgets/budget-queries'
import type { Tables } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

type RecordView =
  | 'income_overview'
  | 'category_overview'
  | 'transaction_list'
  | 'subscription_overview'
  | 'debt_overview'
  | 'account_overview'
  | 'transfer_overview'

/**
 * One editable record read by its id, for an edit form or a removal confirmation: never
 * looked up in whatever list happens to be loaded (a filter, a page, an "in force" view), so
 * a record another member moved out of the list is still the same record, and a record they
 * deleted reads as null (D-136). Under the budget's key: every write refreshes it.
 */
export function useRecord<V extends RecordView>(
  view: V,
  budgetId: string,
  id: string | undefined,
): Tables<V> | null | undefined {
  const query = useQuery({
    queryKey: [...budgetKeys.budget(budgetId), 'record', view, id ?? ''] as const,
    enabled: id !== undefined,
    staleTime: 0,
    queryFn: async (): Promise<Tables<V> | null> =>
      unwrap(
        await supabase
          // All these views have budget_id and id; one typed call serves them.
          .from(view as 'income_overview')
          .select('*')
          .eq('budget_id', budgetId)
          .eq('id', id ?? '')
          .maybeSingle(),
      ) as unknown as Tables<V> | null,
  })
  return query.data
}
