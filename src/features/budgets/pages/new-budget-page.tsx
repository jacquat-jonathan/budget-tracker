import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { paths } from '@/app/paths'
import { PageHeader } from '@/components/states'
import { Card, CardContent } from '@/components/ui/card'
import { CreateBudgetForm } from '@/features/budgets/components/create-budget-form'
import { useBudgets } from '@/features/budgets/current-budget-context'

/** Create another budget; it becomes the current one. */
export function NewBudgetPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { selectBudget } = useBudgets()

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader title={t('nav.newBudget')} description={t('budgets.create.description')} />
      <Card>
        <CardContent>
          <CreateBudgetForm
            onCreated={(budgetId) => {
              selectBudget(budgetId)
              void navigate(paths.dashboard)
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
