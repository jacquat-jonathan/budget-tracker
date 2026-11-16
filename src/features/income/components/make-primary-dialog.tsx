import { useTranslation } from 'react-i18next'

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { IncomeOverview, PeriodSummary } from '@/features/budgets/budget-queries'
import { PayDatePreviewNotice } from '@/features/income/components/pay-date-preview-notice'
import type { useSetPrimaryIncome } from '@/features/income/income-mutations'
import {
  useArrivedUnderNewTerms,
  useExpectedPayDatePreview,
} from '@/features/income/pay-date-preview'
import { useErrorMessage } from '@/hooks/use-app-mutation'

/** "Make primary", with the expected next pay date it would give before confirming. */
export function MakePrimaryDialog({
  budgetId,
  income,
  currentPeriod,
  mutation,
  onClose,
  onSalaryMayHaveArrived,
}: {
  budgetId: string
  income: IncomeOverview | null
  currentPeriod: PeriodSummary | null
  mutation: ReturnType<typeof useSetPrimaryIncome>
  onClose: () => void
  onSalaryMayHaveArrived: (dueDate: string) => void
}) {
  const { t } = useTranslation()
  return (
    <AlertDialog
      open={income !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <AlertDialogContent>
        {income && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('income.primaryTitle', { name: income.name })}</AlertDialogTitle>
              <AlertDialogDescription>{t('income.primaryDescription')}</AlertDialogDescription>
            </AlertDialogHeader>
            <PrimaryBody
              budgetId={budgetId}
              income={income}
              currentPeriod={currentPeriod}
              mutation={mutation}
              onClose={onClose}
              onSalaryMayHaveArrived={onSalaryMayHaveArrived}
            />
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}

function PrimaryBody({
  budgetId,
  income,
  currentPeriod,
  mutation,
  onClose,
  onSalaryMayHaveArrived,
}: {
  budgetId: string
  income: IncomeOverview
  currentPeriod: PeriodSummary | null
  mutation: ReturnType<typeof useSetPrimaryIncome>
  onClose: () => void
  onSalaryMayHaveArrived: (dueDate: string) => void
}) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const enabled = currentPeriod !== null
  const preview = useExpectedPayDatePreview(
    budgetId,
    { kind: 'primary', incomeId: income.id },
    enabled,
  )
  const arrivedDue = useArrivedUnderNewTerms({
    currentPeriod,
    payDay: income.pay_day,
    weekendRule: income.weekend_rule,
    enabled,
  })
  return (
    <>
      {enabled && <PayDatePreviewNotice preview={preview} arrivedDue={arrivedDue} />}
      {mutation.isError && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(mutation.error)}</AlertDescription>
        </Alert>
      )}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={mutation.isPending}>{t('common.cancel')}</AlertDialogCancel>
        <Button
          disabled={mutation.isPending}
          onClick={() =>
            mutation.mutate(income, {
              onSuccess: () => {
                onClose()
                // R-PERIOD-037: the new primary's salary this month may already have arrived.
                if (arrivedDue) onSalaryMayHaveArrived(arrivedDue)
              },
            })
          }
        >
          {mutation.isPending ? t('common.saving') : t('income.makePrimary')}
        </Button>
      </AlertDialogFooter>
    </>
  )
}
