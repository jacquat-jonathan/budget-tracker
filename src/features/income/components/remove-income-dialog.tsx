import { TriangleAlertIcon } from 'lucide-react'
import { useId, useState } from 'react'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { IncomeOverview, PeriodSummary } from '@/features/budgets/budget-queries'
import { monthLabel } from '@/features/budgets/start-months'
import type { useRemoveIncome } from '@/features/income/income-mutations'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { formatCalendarDate } from '@/lib/date'
import { currentLanguage } from '@/lib/i18n'

/**
 * Remove an income: from the current period by default, or, as an explicit correction, from
 * an earlier period it counted in (R-INCOME-015), with a warning that past totals change.
 */
export function RemoveIncomeDialog({
  income,
  periods,
  mutation,
  onClose,
}: {
  income: IncomeOverview | null
  periods: PeriodSummary[]
  mutation: ReturnType<typeof useRemoveIncome>
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
          <RemoveIncomeForm
            income={income}
            periods={periods}
            mutation={mutation}
            onClose={onClose}
            title={t('income.removeTitle', { name: income.name })}
          />
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}

function RemoveIncomeForm({
  income,
  periods,
  mutation,
  onClose,
  title,
}: {
  income: IncomeOverview
  periods: PeriodSummary[]
  mutation: ReturnType<typeof useRemoveIncome>
  onClose: () => void
  title: string
}) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const language = currentLanguage()
  const id = useId()
  const correctable = periods.filter(
    (period) => !period.is_current && period.seq >= income.first_seq,
  )
  const [correct, setCorrect] = useState(false)
  const [fromPeriodId, setFromPeriodId] = useState(correctable[0]?.id ?? '')

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div className="flex flex-col gap-2">
            <p>{correct ? t('income.removeFromEarlier') : t('income.removeDescription')}</p>
            <p>{t('income.removeHistory')}</p>
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      {correctable.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border p-3">
          <Field orientation="horizontal">
            <Checkbox
              id={id}
              checked={correct}
              onCheckedChange={(checked) => setCorrect(checked === true)}
            />
            <FieldContent>
              <FieldLabel htmlFor={id}>{t('income.correction.removeLabel')}</FieldLabel>
              <FieldDescription>{t('income.correction.help')}</FieldDescription>
            </FieldContent>
          </Field>
          {correct && (
            <>
              <Field>
                <FieldLabel htmlFor={`${id}-period`}>
                  {t('income.correction.removeFrom')}
                </FieldLabel>
                <Select value={fromPeriodId} onValueChange={setFromPeriodId}>
                  <SelectTrigger id={`${id}-period`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {correctable.map((period) => (
                      <SelectItem key={period.id} value={period.id}>
                        {t('income.fields.fromPeriod', {
                          month: monthLabel(period.month, language),
                          start: formatCalendarDate(period.start_date),
                          end: formatCalendarDate(period.end_date),
                        })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Alert variant="destructive">
                <TriangleAlertIcon aria-hidden />
                <AlertDescription>{t('income.correction.warning')}</AlertDescription>
              </Alert>
            </>
          )}
        </div>
      )}
      {mutation.isError && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(mutation.error)}</AlertDescription>
        </Alert>
      )}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={mutation.isPending}>{t('common.cancel')}</AlertDialogCancel>
        <Button
          variant="destructive"
          disabled={mutation.isPending}
          onClick={() =>
            mutation.mutate(
              { income, fromPeriodId: correct ? fromPeriodId || null : null },
              { onSuccess: onClose },
            )
          }
        >
          {mutation.isPending ? t('common.saving') : t('income.remove')}
        </Button>
      </AlertDialogFooter>
    </>
  )
}
