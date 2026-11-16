import { useQuery } from '@tanstack/react-query'

import { budgetKeys } from '@/features/budgets/budget-keys'
import { unwrap } from '@/features/budgets/budget-queries'
import type { DbErrorCode } from '@/lib/db-errors'
import { DB_ERROR_CODES } from '@/lib/db-errors'
import { supabase } from '@/lib/supabase'

/** What a removal from a period would do now, as the database says beforehand (D-220). */
export interface RemovalOutcome {
  outcome: 'deleted' | 'ended' | null
  /** The code the write would answer when it would be refused. */
  refusal: DbErrorCode | null
}

function readOutcome(row: { outcome: string | null; refusal: string | null } | undefined) {
  const outcome = row?.outcome === 'deleted' || row?.outcome === 'ended' ? row.outcome : null
  const refusal = (DB_ERROR_CODES as readonly string[]).includes(row?.refusal ?? '')
    ? (row?.refusal as DbErrorCode)
    : null
  return { outcome, refusal } satisfies RemovalOutcome
}

/**
 * preview_end_subscription / preview_remove_debt from the chosen period (the current one when
 * null): the dialog says the one outcome it gives (R-SUBSCRIPTION-141). Read afresh each time
 * the dialog or the period changes.
 */
export function useRemovalPreview(
  kind: 'subscription' | 'debt',
  budgetId: string,
  id: string,
  periodId: string | null,
) {
  return useQuery({
    queryKey: [
      ...budgetKeys.budget(budgetId),
      'removal-preview',
      kind,
      id,
      periodId ?? '',
    ] as const,
    staleTime: 0,
    queryFn: async (): Promise<RemovalOutcome> => {
      const args = periodId ? { p_from_period_id: periodId } : {}
      const rows =
        kind === 'subscription'
          ? unwrap(
              await supabase.rpc('preview_end_subscription', { p_subscription_id: id, ...args }),
            )
          : unwrap(await supabase.rpc('preview_remove_debt', { p_debt_id: id, ...args }))
      return readOutcome(rows[0])
    },
  })
}
