import { BellRingIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CalendarDate } from '@/components/form/calendar-date-field'
import { ErrorState } from '@/components/states'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'
import { ChargeAnswers } from '@/features/subscriptions/components/charge-answers'
import { useAwaitingCharges } from '@/features/subscriptions/subscription-queries'
import { useCategoryPath } from '@/features/subscriptions/subscription-views'
import { formatMoney } from '@/lib/money'

/**
 * The dashboard's notification (R-SUBSCRIPTION-076): every automatic charge awaiting
 * confirmation, asking whether it really went through. Read after the catch-up; when another
 * member answered first, the list is read again and a message says so. Nothing is shown when
 * nothing awaits.
 */
export function ChargesToConfirmCard() {
  const { t } = useTranslation()
  const { budgetId } = useCurrentBudget()
  const charges = useAwaitingCharges(budgetId)
  const path = useCategoryPath()

  if (charges.isError) {
    return <ErrorState className="" error={charges.error} onRetry={charges.refetch} />
  }
  const list = charges.data ?? []
  if (list.length === 0) return null

  return (
    <Card
      data-testid="charges-to-confirm"
      className="ring-amber-500/40"
      role="region"
      aria-labelledby="charges-to-confirm-title"
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRingIcon className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />
          <h2 id="charges-to-confirm-title">{t('charges.title', { count: list.length })}</h2>
        </CardTitle>
        <CardDescription>{t('charges.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {list.map((charge) => (
            <li
              key={charge.id}
              className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              data-testid="charge-to-confirm"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex min-w-0 items-baseline justify-between gap-3 sm:justify-start">
                  <span className="truncate font-medium">{charge.subscription_name}</span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {formatMoney(charge.amount)}
                  </span>
                </div>
                <span className="truncate text-xs text-muted-foreground">
                  <CalendarDate value={charge.date} />
                  {' · '}
                  {path(charge.category_name, charge.parent_category_name)}
                </span>
              </div>
              <ChargeAnswers budgetId={budgetId} charge={charge} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
