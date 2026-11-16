import { CircleSlashIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useBudgets } from '@/features/budgets/current-budget-context'

/**
 * R-BUDGET-055: the budget I was working in is no longer mine (deleted, or I was removed):
 * say so, and that what I had not saved there was discarded, until dismissed.
 */
export function BudgetLostAlert() {
  const { t } = useTranslation()
  const { lostBudget, dismissLostBudget } = useBudgets()
  if (!lostBudget) return null
  return (
    <Alert data-testid="budget-lost" role="alert">
      <CircleSlashIcon aria-hidden />
      <AlertTitle>{t('budgetLost.title', { name: lostBudget.name })}</AlertTitle>
      <AlertDescription>
        <p>
          {lostBudget.nowIn
            ? t('budgetLost.description', { name: lostBudget.nowIn })
            : t('budgetLost.descriptionNone')}
        </p>
        <div className="mt-2">
          <Button size="sm" variant="outline" onClick={dismissLostBudget}>
            {t('budgetLost.dismiss')}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
