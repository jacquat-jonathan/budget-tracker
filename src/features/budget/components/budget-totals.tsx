import { useTranslation } from 'react-i18next'

import { MoneyStat } from '@/components/money-stat'
import { Card, CardContent } from '@/components/ui/card'
import type { PeriodSummary } from '@/features/budgets/budget-queries'
import { CommittedTotal } from '@/features/progress/commitments'
import { formatCalendarDate } from '@/lib/date'

/**
 * The current period's plan: income, total expected and what is left to assign, as the
 * database adds them up (period_summaries). Over-assigning shows a negative amount, never a
 * refusal (R-CATEGORY-071).
 */
// R-CATEGORY-006: left to assign is per period, from the database.
export function BudgetTotals({ period }: { period: PeriodSummary }) {
  const { t } = useTranslation()
  const left = period.left_to_assign ?? 0
  return (
    <Card data-testid="budget-totals">
      <CardContent className="@container/totals flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {t('categories.totals.period', {
            start: formatCalendarDate(period.start_date),
            end: formatCalendarDate(period.end_date),
          })}
        </p>
        <dl className="grid grid-cols-1 gap-4 @xl/totals:grid-cols-3">
          <MoneyStat
            label={t('categories.totals.income')}
            amount={period.income_total ?? 0}
            testId="total-income"
          />
          <MoneyStat
            label={t('categories.totals.expected')}
            amount={period.expected_total ?? 0}
            testId="total-expected"
            hint={
              <CommittedTotal
                commitment={{
                  planned: period.expected_total ?? 0,
                  subscriptions: period.committed_total ?? 0,
                  transfers: period.transfer_committed_total ?? 0,
                }}
              />
            }
          />
          <MoneyStat
            label={left < 0 ? t('categories.totals.overAssigned') : t('categories.totals.left')}
            amount={left}
            tone={left < 0 ? 'negative' : 'neutral'}
            hint={left < 0 ? t('categories.totals.overAssignedHint') : undefined}
            testId="total-left"
            emphasis
          />
        </dl>
      </CardContent>
    </Card>
  )
}
