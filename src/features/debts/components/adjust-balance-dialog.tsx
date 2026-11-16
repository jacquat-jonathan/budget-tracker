import { zodResolver } from '@hookform/resolvers/zod'
import { InfoIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { ChangedElsewhere, GoneElsewhere, SaveError } from '@/components/changed-elsewhere'
import { CalendarDateField } from '@/components/form/calendar-date-field'
import { MoneyField } from '@/components/form/money-field'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { TextField } from '@/features/auth/components/text-field'
import { useRecordSettled } from '@/features/budgets/record-settled'
import { useAdjustBalance } from '@/features/debts/debt-mutations'
import { useDebtRecord, type Debt } from '@/features/debts/debt-queries'
import { useSubscriptionViews } from '@/features/subscriptions/subscription-views'
import type { DateRange } from '@/features/transactions/components/transaction-form-dialog'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { useEditBase } from '@/hooks/use-edit-base'
import { formatCalendarDate, isCalendarDate } from '@/lib/date'
import { calendarDateSchema, DESCRIPTION_MAX_LENGTH, rappenSchema } from '@/lib/form-schemas'
import { formatMoney } from '@/lib/money'

/** The largest balance the database accepts: CHF 10 billion (R-DEBT-110). */
const MAX_BALANCE_RAPPEN = 1_000_000_000_000

function adjustSchema(range: DateRange) {
  return z.object({
    balance: rappenSchema({
      min: 0,
      max: MAX_BALANCE_RAPPEN,
      tooSmall: 'validation.amountNegative',
    }),
    date: calendarDateSchema.refine(
      (value) => !isCalendarDate(value) || (range.min <= value && value <= range.max),
      { error: 'validation.dateOutsidePeriods' },
    ),
    note: z.string().max(DESCRIPTION_MAX_LENGTH, { error: 'validation.descriptionTooLong' }),
  })
}
type Input = z.input<ReturnType<typeof adjustSchema>>
type Values = z.output<ReturnType<typeof adjustSchema>>

/**
 * "Adjust balance": the user types the balance the bank shows; the database stores the
 * difference as a dated adjustment, so a payment recorded meanwhile cannot make it wrong
 * (R-DEBT-075, D-178). Saved with the debt's revision.
 */
// R-DEBT-122: the balance typed is the bank's; the difference is what is stored, said so.
export function AdjustBalanceDialog({
  budgetId,
  debt,
  range,
  today,
  ended,
  onClose,
}: {
  budgetId: string
  debt: Debt | null
  range: DateRange
  today: string
  /** The budget has ended: the latest date is its last day. */
  ended: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={debt !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-8">{t('debts.adjust.title')}</DialogTitle>
          <DialogDescription>{t('debts.adjust.description')}</DialogDescription>
        </DialogHeader>
        {debt && (
          <AdjustForm
            budgetId={budgetId}
            opened={debt}
            range={range}
            today={today}
            ended={ended}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function AdjustForm({
  budgetId,
  opened: openedNow,
  range,
  today,
  ended,
  onClose,
}: {
  budgetId: string
  opened: Debt
  range: DateRange
  today: string
  ended: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  // The version the dialog was opened on, kept: the page may pass newer ones while it is open.
  const [opened] = useState(openedNow)
  const errorMessage = useErrorMessage()
  const views = useSubscriptionViews()
  const live = useDebtRecord(budgetId, opened.id)
  const edit = useEditBase(opened, live, views.debtBalance)
  const debt = edit.base ?? opened
  const schema = useMemo(() => adjustSchema(range), [range])
  const form = useForm<Input, unknown, Values>({
    resolver: zodResolver(schema),
    defaultValues: { balance: null, date: today > range.max ? range.max : today, note: '' },
  })
  const adjust = useAdjustBalance(budgetId, { onDone: onClose })
  // The remaining amount as it is now (payments meanwhile included): the difference to store.
  const current = live ?? debt
  const settled = useRecordSettled(budgetId, 'debt_overview', opened.id, live)
  const blocked = edit.changed || edit.gone || !settled

  const onSubmit = form.handleSubmit((values) =>
    adjust
      .mutateAsync({
        debt,
        revision: debt.revision,
        balance: values.balance,
        date: values.date === today ? null : values.date,
        note: values.note,
      })
      .catch(() => undefined),
  )

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate data-testid="adjust-form">
      <FieldGroup>
        {edit.gone && <GoneElsewhere />}
        {edit.changed && (
          <ChangedElsewhere
            // Nothing of theirs to load into this form: look at their change, then continue.
            kind="remove"
            changes={edit.theirs}
            onKeepMine={() => {
              edit.adopt()
              adjust.reset()
            }}
          />
        )}
        <SaveError error={adjust.error} hidden={blocked} message={errorMessage} />
        <p className="text-sm">
          {t('debts.adjust.now', {
            name: current.name,
            amount: formatMoney(current.remaining),
          })}
        </p>
        <MoneyField
          control={form.control}
          name="balance"
          label={t('debts.adjust.balance')}
          description={t('debts.adjust.balanceHelp')}
          autoFocus
        />
        <CalendarDateField
          control={form.control}
          name="date"
          label={t('debts.adjust.date')}
          description={t(
            ended ? 'transactions.fields.dateRangeEnded' : 'transactions.fields.dateRange',
            {
              min: formatCalendarDate(range.min),
              max: formatCalendarDate(range.max),
            },
          )}
        />
        <TextField
          control={form.control}
          name="note"
          label={t('debts.adjust.note')}
          placeholder={t('debts.adjust.notePlaceholder')}
          autoComplete="off"
          maxLength={DESCRIPTION_MAX_LENGTH}
        />
        <Alert>
          <InfoIcon aria-hidden />
          <AlertDescription>{t('debts.adjust.difference')}</AlertDescription>
        </Alert>
        <DialogFooter className="sticky -bottom-4 z-10 bg-popover">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={adjust.isPending || blocked}>
            {adjust.isPending ? t('common.saving') : t('debts.adjust.save')}
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  )
}
