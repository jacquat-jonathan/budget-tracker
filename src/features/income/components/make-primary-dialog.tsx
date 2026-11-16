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
import { TermsEffectNotice } from '@/features/income/components/terms-effect-notice'
import type { useSetPrimaryIncome } from '@/features/income/income-mutations'
import { useTermsEffect } from '@/features/income/terms-effect'
import { useErrorMessage } from '@/hooks/use-app-mutation'

/**
 * R-INCOME-053: making another income primary re-projects the current period with its pay
 * day, which can close the period at once. Confirmed with the same preview as a change of
 * pay day, and with how to undo it.
 */
export function MakePrimaryDialog({
  income,
  currentPeriod,
  mutation,
  onClose,
}: {
  income: IncomeOverview | null
  currentPeriod: PeriodSummary | null
  mutation: ReturnType<typeof useSetPrimaryIncome>
  onClose: () => void
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
              income={income}
              currentPeriod={currentPeriod}
              mutation={mutation}
              onClose={onClose}
            />
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}

function PrimaryBody({
  income,
  currentPeriod,
  mutation,
  onClose,
}: {
  income: IncomeOverview
  currentPeriod: PeriodSummary | null
  mutation: ReturnType<typeof useSetPrimaryIncome>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const effect = useTermsEffect({
    enabled: true,
    currentPeriod,
    payDay: income.pay_day,
    weekendRule: income.weekend_rule,
  })
  return (
    <>
      <TermsEffectNotice effect={effect} undoHint />
      {mutation.isError && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(mutation.error)}</AlertDescription>
        </Alert>
      )}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={mutation.isPending}>{t('common.cancel')}</AlertDialogCancel>
        <Button
          disabled={mutation.isPending || effect.kind === 'checking'}
          onClick={() => mutation.mutate(income, { onSuccess: onClose })}
        >
          {mutation.isPending ? t('common.saving') : t('income.makePrimary')}
        </Button>
      </AlertDialogFooter>
    </>
  )
}
