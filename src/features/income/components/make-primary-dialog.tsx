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
import { Button } from '@/components/ui/button'
import { ChangedElsewhere, SaveError } from '@/components/changed-elsewhere'
import type { IncomeOverview, MyBudget, PeriodSummary } from '@/features/budgets/budget-queries'
import { useRecordViews } from '@/features/budgets/record-views'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'
import type { ArrivedOffer } from '@/features/periods/boundary-ranges'
import { PayDatePreviewNotice } from '@/features/income/components/pay-date-preview-notice'
import type { useSetPrimaryIncome } from '@/features/income/income-mutations'
import {
  useArrivedUnderNewTerms,
  useExpectedPayDatePreview,
} from '@/features/income/pay-date-preview'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { useEditBase } from '@/hooks/use-edit-base'

/** "Make primary", with the expected next pay date it would give before confirming. */
export function MakePrimaryDialog({
  budgetId,
  income,
  incomes,
  currentPeriod,
  previousPeriod,
  mutation,
  onClose,
  onSalaryMayHaveArrived,
}: {
  budgetId: string
  income: IncomeOverview | null
  /** Every income, to name the primary one if another member switched it. */
  incomes: IncomeOverview[]
  currentPeriod: PeriodSummary | null
  previousPeriod: PeriodSummary | undefined
  mutation: ReturnType<typeof useSetPrimaryIncome>
  onClose: () => void
  onSalaryMayHaveArrived: (offer: ArrivedOffer) => void
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
              incomes={incomes}
              currentPeriod={currentPeriod}
              previousPeriod={previousPeriod}
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
  incomes,
  currentPeriod,
  previousPeriod,
  mutation,
  onClose,
  onSalaryMayHaveArrived,
}: {
  budgetId: string
  income: IncomeOverview
  incomes: IncomeOverview[]
  currentPeriod: PeriodSummary | null
  previousPeriod: PeriodSummary | undefined
  mutation: ReturnType<typeof useSetPrimaryIncome>
  onClose: () => void
  onSalaryMayHaveArrived: (offer: ArrivedOffer) => void
}) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const { budget } = useCurrentBudget()
  const views = useRecordViews()
  // The primary income is a field of the budget: the confirmation saves over the budget's
  // revision as it was opened (D-150), and says so if another member switched it meanwhile.
  const describe = (record: MyBudget) => views.budgetPrimary(record, incomes)
  const edit = useEditBase(budget, budget, describe)
  const enabled = currentPeriod !== null
  const preview = useExpectedPayDatePreview(
    budgetId,
    { kind: 'primary', incomeId: income.id },
    enabled,
  )
  const arrivedOffer = useArrivedUnderNewTerms({
    currentPeriod,
    previousPeriod,
    endDateEntered: budget.end_date_entered,
    endAfterSave: preview.data?.end_date,
    payDay: income.pay_day,
    weekendRule: income.weekend_rule,
    enabled,
  })
  return (
    <>
      {enabled && (
        <PayDatePreviewNotice
          preview={preview}
          offer={arrivedOffer}
          endDateEntered={budget.end_date_entered}
        />
      )}
      {edit.changed && (
        <ChangedElsewhere
          kind="remove"
          changes={edit.theirs}
          onKeepMine={() => {
            edit.adopt()
            mutation.reset()
          }}
        />
      )}
      <SaveError error={mutation.error} hidden={edit.changed} message={errorMessage} />
      <AlertDialogFooter>
        <AlertDialogCancel disabled={mutation.isPending}>{t('common.cancel')}</AlertDialogCancel>
        <Button
          disabled={mutation.isPending || edit.changed || (enabled && !preview.isSuccess)}
          onClick={() =>
            mutation.mutate(
              {
                income,
                budgetRevision: (edit.base ?? budget).revision,
                previewedEndDate: preview.data?.end_date ?? null,
              },
              {
                onSuccess: () => {
                  onClose()
                  // R-PERIOD-037: the new primary's salary this month may already have arrived.
                  if (arrivedOffer) onSalaryMayHaveArrived(arrivedOffer)
                },
              },
            )
          }
        >
          {mutation.isPending ? t('common.saving') : t('income.makePrimary')}
        </Button>
      </AlertDialogFooter>
    </>
  )
}
