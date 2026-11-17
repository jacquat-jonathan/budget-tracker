import { zodResolver } from '@hookform/resolvers/zod'
import type { UseMutationResult } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { SaveError } from '@/components/changed-elsewhere'
import { CalendarDateField } from '@/components/form/calendar-date-field'
import { MoneyField } from '@/components/form/money-field'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldGroup } from '@/components/ui/field'
import type { PeriodSummary } from '@/features/budgets/budget-queries'
import { targetOf, type MarkTarget } from '@/features/transfers/transfer-mutations'
import type { ChecklistRow } from '@/features/transfers/transfer-queries'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { formatCalendarDate } from '@/lib/date'
import { calendarDateSchema, rappenSchema } from '@/lib/form-schemas'
import { formatMoney } from '@/lib/money'

type DoneMutation = UseMutationResult<
  unknown,
  unknown,
  MarkTarget & { doneOn: string; amountMoved: number }
>

/**
 * "Done": on which day and with what amount (R-ACCOUNT-073: linked to a category, its
 * transaction is recorded then, dated that day). The date defaults as the database does it:
 * today in the current period, else the due date; never after today.
 */
export function MarkDoneDialog({
  budgetId,
  row,
  period,
  mutation,
  onClose,
}: {
  budgetId: string
  row: ChecklistRow | null
  period: PeriodSummary | null
  mutation: DoneMutation
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={row !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md"
        // The checklist puts the focus on the row once it is read again (its button changed).
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {row && (
          <>
            <DialogHeader>
              <DialogTitle className="pr-8">
                {t('transfers.checklist.doneTitle', { name: row.name ?? '' })}
              </DialogTitle>
              <DialogDescription>
                {t('transfers.checklist.doneDescription', {
                  amount: formatMoney(row.amount ?? 0),
                  date: row.due_date ? formatCalendarDate(row.due_date) : '',
                })}
              </DialogDescription>
            </DialogHeader>
            <DoneForm
              budgetId={budgetId}
              row={row}
              period={period}
              mutation={mutation}
              onClose={onClose}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function DoneForm({
  row,
  period,
  mutation,
  onClose,
}: {
  budgetId: string
  row: ChecklistRow
  period: PeriodSummary | null
  mutation: DoneMutation
  onClose: () => void
}) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage({
    record_changed: 'transfers.checklist.changedElsewhere',
    transfer_already_marked: 'transfers.checklist.changedElsewhere',
  })
  const today = period?.today ?? null
  const schema = useMemo(
    () =>
      z
        .object({ doneOn: calendarDateSchema, amount: rappenSchema() })
        .superRefine((values, ctx) => {
          if (today !== null && values.doneOn > today) {
            ctx.addIssue({ code: 'custom', path: ['doneOn'], message: 'validation.doneAfterToday' })
          }
        }),
    [today],
  )
  type Input = z.input<typeof schema>
  type Values = z.output<typeof schema>
  const defaultDate = period?.is_current && today ? today : (row.due_date ?? today ?? '')
  const form = useForm<Input, unknown, Values>({
    resolver: zodResolver(schema),
    defaultValues: { doneOn: defaultDate, amount: row.amount ?? null },
  })
  const onSubmit = form.handleSubmit((values) =>
    mutation
      .mutateAsync(
        { ...targetOf(row), doneOn: values.doneOn, amountMoved: values.amount },
        { onSuccess: onClose },
      )
      .catch(() => undefined),
  )
  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate data-testid="mark-done-form">
      <FieldGroup>
        <SaveError error={mutation.error} hidden={false} message={errorMessage} />
        <CalendarDateField
          control={form.control}
          name="doneOn"
          label={t('transfers.checklist.doneOn')}
          autoFocus
          description={
            row.category_name
              ? t('transfers.checklist.doneOnLinked', { category: row.category_name })
              : t('transfers.checklist.doneOnHelp')
          }
        />
        <MoneyField
          control={form.control}
          name="amount"
          label={t('transfers.checklist.amountMoved')}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? t('common.saving') : t('transfers.checklist.done')}
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  )
}
