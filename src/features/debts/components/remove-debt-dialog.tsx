import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ChangedElsewhere, GoneElsewhere, SaveError } from '@/components/changed-elsewhere'
import { CorrectionToggle } from '@/components/form/correction-toggle'
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
import { Field, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { PeriodSummary } from '@/features/budgets/budget-queries'
import { useRemoveDebt } from '@/features/debts/debt-mutations'
import { useDebtRecord, type Debt } from '@/features/debts/debt-queries'
import { useSubscriptionViews } from '@/features/subscriptions/subscription-views'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { useEditBase } from '@/hooks/use-edit-base'
import { formatCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'

/**
 * Remove a debt: deleted when it never counted and has no payment, interest or adjustment
 * (removal_deletes), otherwise ended from the current period, its history and remaining
 * amount kept (R-DEBT-001, R-DEBT-113). Said before it happens.
 */
// R-DEBT-122: which of the two happens, said before it does.
export function RemoveDebtDialog({
  budgetId,
  debt,
  periods,
  currentPeriod,
  onClose,
  onRemoved,
}: {
  budgetId: string
  debt: Debt | null
  periods: PeriodSummary[]
  currentPeriod: PeriodSummary | null
  onClose: () => void
  onRemoved?: (outcome: string) => void
}) {
  return (
    <AlertDialog
      open={debt !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <AlertDialogContent>
        {debt && (
          <RemoveBody
            budgetId={budgetId}
            opened={debt}
            periods={periods}
            currentPeriod={currentPeriod}
            onClose={onClose}
            onRemoved={onRemoved}
          />
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}

function RemoveBody({
  budgetId,
  opened,
  periods,
  currentPeriod,
  onClose,
  onRemoved,
}: {
  budgetId: string
  opened: Debt
  periods: PeriodSummary[]
  currentPeriod: PeriodSummary | null
  onClose: () => void
  onRemoved?: (outcome: string) => void
}) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const views = useSubscriptionViews()
  const live = useDebtRecord(budgetId, opened.id)
  const removal = useEditBase(opened, live, views.debt)
  const debt = live ?? removal.base ?? opened
  const remove = useRemoveDebt(budgetId)
  const correctable = periods.filter((period) => !period.is_current && period.seq >= debt.first_seq)
  const [correct, setCorrect] = useState(false)
  const [fromPeriodId, setFromPeriodId] = useState(correctable[0]?.id ?? '')
  const deletes = !correct && debt.removal_deletes
  const blocked = removal.changed || removal.gone

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {deletes
            ? t('debts.remove.deleteTitle', { name: debt.name })
            : t('debts.remove.endTitle', { name: debt.name })}
        </AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div className="flex flex-col gap-2" data-testid="remove-debt-outcome">
            <p>
              {correct
                ? t('debts.remove.fromEarlier')
                : deletes
                  ? t('debts.remove.deletes')
                  : currentPeriod
                    ? t('debts.remove.ends', {
                        date: formatCalendarDate(currentPeriod.start_date),
                        amount: formatMoney(debt.remaining),
                      })
                    : t('debts.remove.endsNoPeriod')}
            </p>
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      {correctable.length > 0 && (
        <CorrectionToggle
          checked={correct}
          onCheckedChange={setCorrect}
          label={t('debts.remove.earlierLabel')}
          warning={t('debts.remove.earlierWarning')}
        >
          <Field>
            <FieldLabel htmlFor="remove-debt-period">
              {t('income.correction.removeFrom')}
            </FieldLabel>
            <Select value={fromPeriodId} onValueChange={setFromPeriodId}>
              <SelectTrigger id="remove-debt-period" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {correctable.map((period) => (
                  <SelectItem key={period.id} value={period.id}>
                    {t('income.fields.fromPeriod', {
                      start: formatCalendarDate(period.start_date),
                      end: formatCalendarDate(period.end_date),
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CorrectionToggle>
      )}
      {removal.gone && <GoneElsewhere />}
      {removal.changed && (
        <ChangedElsewhere
          kind="remove"
          changes={removal.theirs}
          onKeepMine={() => {
            removal.adopt()
            remove.reset()
          }}
        />
      )}
      <SaveError error={remove.error} hidden={blocked} message={errorMessage} />
      <AlertDialogFooter>
        <AlertDialogCancel disabled={remove.isPending}>{t('common.cancel')}</AlertDialogCancel>
        <Button
          variant="destructive"
          disabled={remove.isPending || blocked}
          onClick={() =>
            remove.mutate(
              {
                debt,
                revision: (removal.base ?? debt).revision,
                fromPeriodId: correct ? fromPeriodId || null : null,
              },
              {
                onSuccess: (outcome) => {
                  onClose()
                  onRemoved?.(outcome)
                },
              },
            )
          }
        >
          {remove.isPending
            ? t('common.saving')
            : deletes
              ? t('debts.remove.delete')
              : t('debts.remove.end')}
        </Button>
      </AlertDialogFooter>
    </>
  )
}
