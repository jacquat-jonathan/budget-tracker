import { useQuery } from '@tanstack/react-query'

import { budgetKeys } from '@/features/budgets/budget-keys'
import {
  unwrap,
  usePayDate,
  type PeriodSummary,
  type WeekendRule,
} from '@/features/budgets/budget-queries'
import { arrivedOffer, type ArrivedOffer } from '@/features/periods/boundary-ranges'
import type { Database } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

export type ExpectedPayDatePreview =
  Database['public']['Functions']['preview_expected_pay_date']['Returns'][number]

/** What is proposed: new terms for the primary income, or another income made primary. */
export type Proposal =
  | { kind: 'terms'; payDay: number; weekendRule: WeekendRule }
  | { kind: 'primary'; incomeId: string }

/**
 * R-INCOME-055: the current period's end and the expected next pay date under the proposal,
 * from preview_expected_pay_date (the same function the write uses). Never projected here.
 */
export function useExpectedPayDatePreview(budgetId: string, proposal: Proposal, enabled: boolean) {
  return useQuery({
    queryKey: [...budgetKeys.budget(budgetId), 'preview-pay-date', proposal] as const,
    enabled,
    queryFn: async (): Promise<ExpectedPayDatePreview | null> => {
      const args =
        proposal.kind === 'terms'
          ? { p_pay_day: proposal.payDay, p_weekend_rule: proposal.weekendRule }
          : { p_income_id: proposal.incomeId }
      const rows = unwrap(
        await supabase.rpc('preview_expected_pay_date', { p_budget_id: budgetId, ...args }),
      )
      return rows[0] ?? null
    },
  })
}

/**
 * R-PERIOD-037: under the proposed terms, this month's salary was due on a date that has
 * passed since the current period started. The projection then skips to the following month,
 * so the app asks about that salary, offering the operation that fits (arrivedOffer): the
 * early pay date, or moving the period's start. The pay date comes from the database
 * (pay_date) for the month of the database's today; only dates are compared here.
 */
export function useArrivedUnderNewTerms({
  currentPeriod,
  previousPeriod,
  endDateEntered,
  endAfterSave,
  payDay,
  weekendRule,
  enabled,
}: {
  currentPeriod: PeriodSummary | null | undefined
  previousPeriod: PeriodSummary | undefined
  endDateEntered: string | null
  /** The current period's end once saved, from the preview, when known. */
  endAfterSave: string | undefined
  payDay: number
  weekendRule: WeekendRule
  enabled: boolean
}): ArrivedOffer | null {
  const today = currentPeriod?.today ?? null
  const payDate = usePayDate(today, payDay, weekendRule, enabled && today !== null)
  if (!enabled || !currentPeriod || !today || !payDate.data) return null
  return arrivedOffer({
    due: payDate.data,
    current: currentPeriod,
    previous: previousPeriod,
    endDateEntered,
    endAfterSave,
  })
}

/** The period before `current` in a list of periods, if it exists. */
export function previousOf(
  periods: readonly PeriodSummary[],
  current: PeriodSummary | null | undefined,
): PeriodSummary | undefined {
  return current ? periods.find((period) => period.seq === current.seq - 1) : undefined
}
