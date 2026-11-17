import { ArrowRightLeftIcon, ClockAlertIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { paths } from '@/app/paths'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useBudgetStatus } from '@/features/budgets/budget-queries'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'
import { useTransfersToDo } from '@/features/transfers/transfer-queries'

/**
 * The dashboard's "transfers to make" (R-ACCOUNT-241): the manual transfers of the current
 * period and of the one before it still to do, and how many are overdue, as get_transfers_to_do
 * counts them once my_budgets says the budget is caught up; quiet when there is nothing to do
 * (D-501). It leads to the checklist.
 */
export function TransfersToDoCard() {
  const { t } = useTranslation()
  const { budgetId } = useCurrentBudget()
  const status = useBudgetStatus(budgetId)
  const counts = useTransfersToDo(budgetId, status.data?.caught_up === true)
  const toDo = counts.data?.toDo ?? 0
  if (counts.isError) {
    // Never silent when the count could not be read: there may be transfers to make.
    return (
      <Card role="region" aria-labelledby="transfers-to-do-title" data-testid="transfers-to-do">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightLeftIcon className="size-4 text-muted-foreground" aria-hidden />
            <h2 id="transfers-to-do-title">{t('transfers.card.failedTitle')}</h2>
          </CardTitle>
          <CardDescription>{t('transfers.card.failed')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap justify-end gap-3">
          <Button
            variant="outline"
            size="sm"
            aria-disabled={counts.isFetching}
            onClick={() => {
              if (!counts.isFetching) void counts.refetch()
            }}
          >
            {t('states.retry')}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={paths.transfers}>{t('transfers.card.open')}</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }
  if (toDo === 0) return null
  const overdue = counts.data?.overdue ?? 0
  return (
    <Card role="region" aria-labelledby="transfers-to-do-title" data-testid="transfers-to-do">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowRightLeftIcon className="size-4 text-muted-foreground" aria-hidden />
          <h2 id="transfers-to-do-title">{t('transfers.card.title', { count: toDo })}</h2>
        </CardTitle>
        <CardDescription>{t('transfers.card.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        {overdue > 0 ? (
          <p
            className="flex items-center gap-1.5 text-sm text-destructive"
            data-testid="transfers-overdue"
          >
            <ClockAlertIcon className="size-4" aria-hidden />
            {t('transfers.card.overdue', { count: overdue })}
          </p>
        ) : (
          <span />
        )}
        <Button asChild variant="outline" size="sm">
          <Link to={paths.transfers}>{t('transfers.card.open')}</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
