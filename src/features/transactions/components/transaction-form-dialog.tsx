import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2Icon, RepeatIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { ConcurrentNotices } from '@/components/changed-elsewhere'
import { CalendarDateField } from '@/components/form/calendar-date-field'
import { MoneyField } from '@/components/form/money-field'
import { SegmentedField } from '@/components/form/segmented-field'
import { SelectField } from '@/components/form/select-field'
import { useDebts } from '@/features/debts/debt-queries'
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
import { useCategoriesForDate } from '@/features/categories/category-queries'
import {
  CategorySelectField,
  type CategoryChoice,
} from '@/features/transactions/components/category-select-field'
import {
  useAddTransaction,
  useUpdateTransaction,
} from '@/features/transactions/transaction-mutations'
import {
  TRANSACTION_KINDS,
  type Transaction,
  type TransactionKind,
} from '@/features/transactions/transaction-queries'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { useRecord } from '@/features/budgets/record-queries'
import { useRecordViews } from '@/features/budgets/record-views'
import { useConcurrentForm } from '@/hooks/use-concurrent-form'
import { useEditBase } from '@/hooks/use-edit-base'
import { formatCalendarDate, isCalendarDate } from '@/lib/date'
import { calendarDateSchema, DESCRIPTION_MAX_LENGTH, rappenSchema } from '@/lib/form-schemas'
import { formatMoney } from '@/lib/money'

/** The dates the database accepts for a transaction: first period's start to today. */
export interface DateRange {
  min: string
  max: string
}

function transactionSchema(range: DateRange, subscriptionLinked: boolean) {
  return z
    .object({
      /** The debt this expense pays; "" for none. */
      debtId: z.string(),
      kind: z.enum(['expense', 'refund', 'extra_income']),
      amount: rappenSchema(),
      // R-TRANSACTION-090: up to the database's today, from the first period's start.
      date: calendarDateSchema.refine(
        (value) => !isCalendarDate(value) || (range.min <= value && value <= range.max),
        { error: 'validation.dateOutsidePeriods' },
      ),
      categoryId: z.string(),
      description: z
        .string()
        .max(DESCRIPTION_MAX_LENGTH, { error: 'validation.descriptionTooLong' }),
    })
    .superRefine((values, ctx) => {
      if (values.kind !== 'extra_income' && values.categoryId === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['categoryId'],
          message: 'validation.categoryRequired',
        })
      }
      // R-TRANSACTION-110: a payment or a subscription charge stays an expense.
      if (values.kind !== 'expense' && (values.debtId !== '' || subscriptionLinked)) {
        ctx.addIssue({ code: 'custom', path: ['kind'], message: 'validation.linkedIsExpense' })
      }
    })
}
type TransactionInput = z.input<ReturnType<typeof transactionSchema>>
type TransactionValues = z.output<ReturnType<typeof transactionSchema>>

interface TransactionFormDialogProps {
  budgetId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The transaction to edit; a new one when absent. */
  transaction?: Transaction
  range: DateRange
  /** The database's today: the default date of a new transaction. */
  today: string
  /** The budget has ended: the latest date is its last day, not today. */
  ended: boolean
  /** A new debt payment: its category and debt chosen beforehand. */
  prefill?: { categoryId: string; debtId: string }
}

/** Add or edit a transaction. The form mounts only while open. */
export function TransactionFormDialog(props: TransactionFormDialogProps) {
  const { t } = useTranslation()
  const { open, onOpenChange, transaction } = props
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-8">
            {transaction
              ? t('transactions.editTitle')
              : props.prefill
                ? t('transactions.paymentTitle')
                : t('transactions.addTitle')}
          </DialogTitle>
          <DialogDescription>
            {transaction
              ? t('transactions.editDescription')
              : props.prefill
                ? t('transactions.paymentDescription')
                : t('transactions.addDescription')}
          </DialogDescription>
        </DialogHeader>
        {open && <TransactionForm {...props} />}
      </DialogContent>
    </Dialog>
  )
}

// R-TRANSACTION-050: dates the database accepts, categories for the date, a fast path.
function TransactionForm({
  budgetId,
  onOpenChange,
  transaction: opened,
  range,
  today,
  ended,
  prefill,
}: TransactionFormDialogProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const close = () => onOpenChange(false)
  const views = useRecordViews()
  // The payment link is part of what this form shows and saves: another member's change of
  // it is a change of this form's fields.
  const describe = (record: Transaction) => [
    ...views.transaction(record),
    {
      key: 'debt',
      label: t('transactions.fields.debt'),
      value: record.debt_name ?? t('concurrent.none'),
    },
  ]
  // R-CONCURRENCY-091: saved over the version opened; the record is read by its id, so a
  // date moved out of the filtered list is still the same transaction.
  const live = useRecord('transaction_list', budgetId, opened?.id)
  const edit = useEditBase(opened, live, describe)
  const transaction = edit.base
  const subscriptionLinked = transaction?.subscription_id != null
  const schema = useMemo(
    () => transactionSchema(range, subscriptionLinked),
    [range, subscriptionLinked],
  )
  const debts = useDebts(budgetId)

  const valuesOf = (from: Transaction | undefined): TransactionInput => ({
    kind: from?.kind ?? 'expense',
    amount: from?.amount ?? null,
    date: from?.date ?? (today > range.max ? range.max : today),
    categoryId: from?.category_id ?? prefill?.categoryId ?? '',
    description: from?.description ?? '',
    debtId: from ? (from.debt_id ?? '') : (prefill?.debtId ?? ''),
  })
  const form = useForm<TransactionInput, unknown, TransactionValues>({
    resolver: zodResolver(schema),
    defaultValues: valuesOf(transaction),
  })
  const [kind, date, categoryId, debtId] = useWatch({
    control: form.control,
    name: ['kind', 'date', 'categoryId', 'debtId'],
  })
  // R-DEBT-123: the debts paid from the chosen category (the database checks the date). A
  // payment keeps its debt while it keeps its category, even after the debt moved category.
  const keptDebt = transaction?.debt_id ?? null
  const payable = useMemo(
    () =>
      (debts.data ?? []).filter(
        (debt) =>
          (debt.category_id === categoryId && debt.is_active) ||
          (debt.id === keptDebt && categoryId === transaction?.category_id),
      ),
    [debts.data, categoryId, keptDebt, transaction?.category_id],
  )
  useEffect(() => {
    // A debt of another category cannot be paid from this one: the link is cleared.
    if (debts.data && debtId !== '' && !payable.some((debt) => debt.id === debtId)) {
      form.setValue('debtId', '')
    }
  }, [debts.data, debtId, payable, form])
  const isExtra = kind === 'extra_income'
  // R-TRANSACTION-091: the categories this date may use, read again whenever it changes.
  const dateInRange = isCalendarDate(date) && range.min <= date && date <= range.max
  const choices = useCategoriesForDate(budgetId, dateInRange ? date : '')
  // A transaction keeps the category it already has, even one no longer planned on its
  // date (removed or ended since): offered as such, never silently blanked.
  const kept = transaction?.category_id ?? null
  const options = useMemo((): CategoryChoice[] => {
    const list: CategoryChoice[] = choices.data ?? []
    if (!kept || !transaction || list.some((c) => c.category_id === kept)) return list
    return [
      ...list,
      {
        category_id: kept,
        parent_id: transaction.parent_category_id,
        name: transaction.category_name ?? '',
        parent_name: transaction.parent_category_name,
        display_order: list.length,
        kept: true,
      },
    ]
  }, [choices.data, kept, transaction])
  useEffect(() => {
    // Another category not usable on the new date is cleared rather than sent and refused.
    if (
      choices.data &&
      categoryId &&
      categoryId !== kept &&
      !choices.data.some((c) => c.category_id === categoryId)
    ) {
      form.setValue('categoryId', '')
    }
  }, [choices.data, categoryId, kept, form])

  const add = useAddTransaction(budgetId)
  const update = useUpdateTransaction(budgetId, { onDone: close })
  const mutation = transaction ? update : add
  const sync = useConcurrentForm(form, edit, valuesOf, () => update.reset())
  /** The fast path: what was just saved, while the next one is typed. */
  const [lastSaved, setLastSaved] = useState<{ amount: number; count: number } | null>(null)
  // Ready for the next receipt: back to the amount once the form shows the cleared values.
  useEffect(() => {
    if (lastSaved) form.setFocus('amount')
  }, [lastSaved, form])

  const submit = (another: boolean) =>
    form.handleSubmit((values) => {
      const fields = {
        kind: values.kind,
        amount: values.amount,
        date: values.date,
        categoryId: values.kind === 'extra_income' ? null : values.categoryId,
        description: values.description,
        // Unchanged for a subscription charge: its link is not this form's.
        debtId: subscriptionLinked ? undefined : values.debtId || null,
      }
      if (transaction) {
        return update
          .mutateAsync({ ...fields, transaction, revision: transaction.revision })
          .catch(() => undefined)
      }
      return add.mutateAsync(fields).then(
        () => {
          if (!another) {
            close()
            return
          }
          // Keep the kind, date and category; clear what differs from one receipt to the next.
          setLastSaved((saved) => ({ amount: values.amount, count: (saved?.count ?? 0) + 1 }))
          form.reset({ ...values, amount: null, description: '' })
          add.reset()
        },
        () => undefined,
      )
    })

  return (
    <form onSubmit={(event) => void submit(false)(event)} noValidate data-testid="transaction-form">
      <FieldGroup>
        <ConcurrentNotices
          gone={edit.gone}
          pending={sync.pending}
          updated={sync.updated}
          onUseTheirs={sync.useTheirs}
          onKeepMine={sync.keepMine}
          error={mutation.error}
          message={errorMessage}
        />
        {lastSaved && (
          <Alert data-testid="saved-in-a-row" role="status">
            <CheckCircle2Icon aria-hidden className="text-positive" />
            <AlertDescription>
              {t('transactions.savedInARow', {
                count: lastSaved.count,
                amount: formatMoney(lastSaved.amount),
              })}
            </AlertDescription>
          </Alert>
        )}
        <SegmentedField
          control={form.control}
          name="kind"
          label={t('transactions.fields.kind')}
          options={TRANSACTION_KINDS.map((value: TransactionKind) => ({
            value,
            label: t(`transactions.kindShort.${value}`),
          }))}
          description={t(`transactions.kindHelp.${kind}`)}
        />
        {form.formState.errors.kind && (
          <p role="alert" className="-mt-3 text-sm text-destructive" data-testid="kind-error">
            {t('validation.linkedIsExpense')}
          </p>
        )}
        <MoneyField
          control={form.control}
          name="amount"
          label={t('transactions.fields.amount')}
          autoFocus
        />
        <CalendarDateField
          control={form.control}
          name="date"
          label={t('transactions.fields.date')}
          description={t(
            ended ? 'transactions.fields.dateRangeEnded' : 'transactions.fields.dateRange',
            {
              min: formatCalendarDate(range.min),
              max: formatCalendarDate(range.max),
            },
          )}
        />
        {!isExtra && (
          <CategorySelectField
            control={form.control}
            name="categoryId"
            label={t('transactions.fields.category')}
            options={options}
            loading={dateInRange && choices.isPending}
            description={
              dateInRange && choices.data?.length === 0 && options.length === 0
                ? t('transactions.fields.noCategoriesHelp')
                : undefined
            }
          />
        )}
        {!isExtra && choices.isError && (
          <Alert variant="destructive" data-testid="categories-failed">
            <AlertDescription>
              <p>
                {t('transactions.fields.categoriesFailed', {
                  reason: errorMessage(choices.error),
                })}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => void choices.refetch()}
              >
                {t('states.retry')}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {transaction?.subscription_id && (
          <Alert data-testid="charge-note">
            <RepeatIcon aria-hidden />
            <AlertDescription>
              {transaction.charge_date
                ? transaction.review_state === 'awaiting_confirmation'
                  ? t('transactions.chargeAwaitingNote', {
                      name: transaction.subscription_name ?? '',
                    })
                  : t('transactions.chargeNote', { name: transaction.subscription_name ?? '' })
                : t('transactions.subscriptionNote', {
                    name: transaction.subscription_name ?? '',
                  })}
            </AlertDescription>
          </Alert>
        )}
        {!subscriptionLinked && (kind === 'expense' || debtId !== '') && payable.length > 0 && (
          <SelectField
            control={form.control}
            name="debtId"
            label={t('transactions.fields.debt')}
            description={t('transactions.fields.debtHelp')}
            options={[
              { value: '', label: t('transactions.fields.noDebt') },
              ...payable.map((debt) => ({
                value: debt.id,
                label: t('transactions.fields.paymentOn', { name: debt.name }),
              })),
            ]}
          />
        )}
        <TextField
          control={form.control}
          name="description"
          label={t('transactions.fields.description')}
          placeholder={t('transactions.fields.descriptionPlaceholder')}
          autoComplete="off"
          maxLength={DESCRIPTION_MAX_LENGTH}
        />
        <DialogFooter className="sticky -bottom-4 z-10 bg-popover sm:flex-wrap">
          <Button type="button" variant="outline" onClick={close}>
            {lastSaved ? t('transactions.done') : t('common.cancel')}
          </Button>
          {!transaction && (
            <Button
              type="button"
              variant="secondary"
              disabled={mutation.isPending}
              onClick={() => void submit(true)()}
            >
              {t('transactions.saveAndAdd')}
            </Button>
          )}
          <Button type="submit" disabled={mutation.isPending || sync.pending !== null || edit.gone}>
            {mutation.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  )
}
