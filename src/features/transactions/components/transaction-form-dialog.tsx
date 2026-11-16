import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2Icon, LockIcon, RepeatIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { ConcurrentNotices } from '@/components/changed-elsewhere'
import { CalendarDateField } from '@/components/form/calendar-date-field'
import { MoneyField } from '@/components/form/money-field'
import { SegmentedField } from '@/components/form/segmented-field'
import { SelectField } from '@/components/form/select-field'
import { usePeriods } from '@/features/budgets/budget-queries'
import { useTermsAt } from '@/features/budgets/terms-at'
import { useDebts } from '@/features/debts/debt-queries'
import { useCategoryPath } from '@/features/subscriptions/subscription-views'
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
import { useClientId } from '@/hooks/use-client-id'
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
  /** Editing: the bounds of the period the transaction is in (the database's period_id). */
  ownPeriod?: { start_date: string; end_date: string } | null
  /** After an edit was saved: the transaction before and as the database now has it. */
  onSaved?: (before: Transaction, after: Transaction) => void
}

/** Add or edit a transaction. The form mounts only while open. */
export function TransactionFormDialog(props: TransactionFormDialogProps) {
  const { t } = useTranslation()
  const { open, onOpenChange, transaction } = props
  // A payment of an ended debt opens as what it is: a read-only view (R-DEBT-151).
  const frozen = transaction?.debt_ended === true
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-8">
            {frozen
              ? t('transactions.frozenTitle')
              : transaction
                ? t('transactions.editTitle')
                : props.prefill
                  ? t('transactions.paymentTitle')
                  : t('transactions.addTitle')}
          </DialogTitle>
          <DialogDescription>
            {frozen
              ? t('transactions.frozenDescription')
              : transaction
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
  ownPeriod,
  onSaved,
}: TransactionFormDialogProps) {
  const { t } = useTranslation()
  // R-DEBT-151: an ended debt's refusal said for what was tried.
  const errorMessage = useErrorMessage({
    debt_ended: opened ? 'debts.endedErrors.frozenPayment' : 'debts.endedErrors.payment',
  })
  const close = () => onOpenChange(false)
  const views = useRecordViews()
  // The payment link is part of what this form shows and saves: another member's change of
  // it is a change of this form's fields.
  const describe = (record: Transaction) => [
    ...views.transaction(record),
    {
      // The debt a payment is for: the form's debtId (M1: never kept as "mine" by default).
      key: 'debt',
      fields: ['debtId'],
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
  const periods = usePeriods(budgetId)
  const path = useCategoryPath()

  const valuesOf = (from: Transaction | undefined): TransactionInput => ({
    kind: from?.kind ?? 'expense',
    amount: from?.amount ?? null,
    date: from?.date ?? (today > range.max ? range.max : today),
    // An import waiting in "to categorise" is given a real category here, never kept there.
    categoryId: from?.in_to_categorise ? '' : (from?.category_id ?? prefill?.categoryId ?? ''),
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
  // R-DEBT-152: the debts that can be paid (not ended; the database checks the date), and the
  // one a payment already pays. Choosing a debt sets the category: that of its terms in force
  // in the period of the date (get_debt_terms), said under the choice.
  const keptDebt = transaction?.debt_id ?? null
  const payable = useMemo(
    () => (debts.data ?? []).filter((debt) => debt.end_seq === null || debt.id === keptDebt),
    [debts.data, keptDebt],
  )
  const chosenDebt = payable.find((debt) => debt.id === debtId) ?? null
  // R-DEBT-151: a payment of an ended debt is frozen: nothing can be saved.
  // The list says so on the row itself (transaction_list.debt_ended).
  const frozen = transaction?.debt_ended === true
  const frozenDebt = frozen ? { name: transaction.debt_name ?? '' } : null
  const datePeriod =
    isCalendarDate(date) && kind === 'expense'
      ? (periods.data?.find((period) => period.start_date <= date && date <= period.end_date) ??
        null)
      : null
  const debtTerms = useTermsAt(
    'debt',
    budgetId,
    chosenDebt && !frozen ? chosenDebt.id : undefined,
    datePeriod?.id ?? null,
  )
  const termsCategory = debtTerms.data?.inForce ? (debtTerms.data.terms?.category_id ?? null) : null
  // Set once per debt and period chosen; the form's own values when it opened are left alone.
  const followed = useRef(`${valuesOf(transaction).debtId}|${transaction?.period_id ?? ''}`)
  useEffect(() => {
    if (!chosenDebt || !datePeriod || termsCategory === null) return
    const key = `${chosenDebt.id}|${datePeriod.id}`
    if (followed.current === key) return
    followed.current = key
    if (form.getValues('categoryId') !== termsCategory) {
      form.setValue('categoryId', termsCategory, { shouldDirty: true })
    }
  }, [chosenDebt, datePeriod, termsCategory, form])
  // A payment waits for its debt's terms on the date (its category follows them): no save
  // before they are known, and none when the debt was not in force then; both buttons alike.
  const termsPending =
    chosenDebt !== null &&
    !frozen &&
    datePeriod !== null &&
    (debtTerms.isFetching || termsCategory === null || categoryId !== termsCategory)
  const blocked =
    frozen || termsPending || (chosenDebt !== null && debtTerms.data?.inForce === false)
  // R-DEBT-150: no payment before the day the debt was opened.
  const debtFloor = chosenDebt && !frozen ? chosenDebt.opened_on : null
  const isExtra = kind === 'extra_income'
  // R-TRANSACTION-091: the categories this date may use, read again whenever it changes.
  const dateInRange = isCalendarDate(date) && range.min <= date && date <= range.max
  const choices = useCategoriesForDate(budgetId, dateInRange ? date : '')
  // R-TRANSACTION-100: a transaction keeps the category it already has, even one no longer
  // planned on its date (removed or ended since), while its date stays in its own period:
  // offered as such, never silently blanked. A date in another period needs a category in
  // force there.
  const inOwnPeriod =
    ownPeriod !== undefined &&
    ownPeriod !== null &&
    isCalendarDate(date) &&
    ownPeriod.start_date <= date &&
    date <= ownPeriod.end_date
  const waiting = transaction?.in_to_categorise === true
  const kept = inOwnPeriod && !waiting ? (transaction?.category_id ?? null) : null
  const keptLost =
    !waiting &&
    !inOwnPeriod &&
    transaction?.category_id !== undefined &&
    transaction.category_id !== null &&
    choices.data !== undefined &&
    !choices.data.some((c) => c.category_id === transaction.category_id)
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
  const request = useClientId()
  const update = useUpdateTransaction(budgetId, { onDone: close, onSaved })
  const mutation = transaction ? update : add
  const sync = useConcurrentForm(form, edit, valuesOf, () => update.reset(), {
    error: update.error,
  })
  /** The fast path: what was just saved, while the next one is typed. */
  const [lastSaved, setLastSaved] = useState<{ amount: number; count: number } | null>(null)
  // Ready for the next receipt: back to the amount once the form shows the cleared values.
  useEffect(() => {
    if (lastSaved) form.setFocus('amount')
  }, [lastSaved, form])

  const submit = (another: boolean) =>
    form.handleSubmit((values) => {
      if (frozen) return
      if (debtFloor && values.date < debtFloor) {
        form.setError('date', { message: 'errors.db.before_debt_opened' })
        return
      }
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
      return add.mutateAsync({ ...fields, clientId: request.id }).then(() => {
        request.renew()
        if (!another) {
          close()
          return
        }
        // Keep the kind, date and category; clear what differs from one receipt to the next.
        setLastSaved((saved) => ({ amount: values.amount, count: (saved?.count ?? 0) + 1 }))
        form.reset({ ...values, amount: null, description: '' })
        add.reset()
      }, request.afterFailure)
    })

  return (
    <form onSubmit={(event) => void submit(false)(event)} noValidate data-testid="transaction-form">
      <FieldGroup>
        {/* Frozen: every field is shown, none can be changed (the footer stays usable). */}
        <fieldset disabled={frozen} className="contents">
          <ConcurrentNotices
            adding={!transaction}
            gone={edit.gone}
            pending={sync.pending}
            updated={sync.updated}
            recovered={sync.recovered}
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
            description={
              debtFloor && debtFloor > range.min
                ? t('debts.payment.dateRange', {
                    name: chosenDebt?.name ?? '',
                    min: formatCalendarDate(debtFloor),
                    max: formatCalendarDate(range.max),
                  })
                : t(
                    ended ? 'transactions.fields.dateRangeEnded' : 'transactions.fields.dateRange',
                    {
                      min: formatCalendarDate(range.min),
                      max: formatCalendarDate(range.max),
                    },
                  )
            }
          />
          {frozen && (
            <Alert data-testid="frozen-payment">
              <LockIcon aria-hidden />
              <AlertDescription>
                {t('debts.frozenPayment', { name: frozenDebt?.name ?? '' })}
              </AlertDescription>
            </Alert>
          )}
          {!frozen &&
            !subscriptionLinked &&
            (kind === 'expense' || debtId !== '') &&
            payable.length > 0 && (
              <SelectField
                control={form.control}
                name="debtId"
                label={t('transactions.fields.debt')}
                description={
                  chosenDebt
                    ? t('debts.payment.opened', {
                        name: chosenDebt.name,
                        date: formatCalendarDate(chosenDebt.opened_on),
                      })
                    : t('transactions.fields.debtHelp')
                }
                options={[
                  { value: '', label: t('transactions.fields.noDebt') },
                  ...payable.map((debt) => ({
                    value: debt.id,
                    label: t('transactions.fields.paymentOn', { name: debt.name }),
                  })),
                ]}
              />
            )}
          {chosenDebt && !frozen && datePeriod && debtTerms.data?.inForce === false && (
            <p
              role="alert"
              className="-mt-3 text-sm text-destructive"
              data-testid="debt-not-in-force"
            >
              {t('debts.payment.notInForce', { name: chosenDebt.name })}
            </p>
          )}
          {!isExtra && (chosenDebt || frozen) ? (
            <p className="text-sm" data-testid="debt-category">
              <span className="text-muted-foreground">{t('transactions.fields.category')}: </span>
              <span className="font-medium">
                {(() => {
                  const choice = options.find((option) => option.category_id === categoryId)
                  return choice
                    ? path(choice.name, choice.parent_id ? choice.parent_name : null)
                    : (transaction?.category_name ?? t('common.loading'))
                })()}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t('debts.payment.categoryFollows', {
                  name: (chosenDebt ?? frozenDebt)?.name ?? '',
                })}
              </span>
            </p>
          ) : (
            !isExtra && (
              <CategorySelectField
                control={form.control}
                name="categoryId"
                label={t('transactions.fields.category')}
                options={options}
                loading={dateInRange && choices.isPending}
                description={
                  keptLost
                    ? t('transactions.fields.keptElsewhere', {
                        name: transaction.category_name ?? '',
                      })
                    : dateInRange && choices.data?.length === 0 && options.length === 0
                      ? t('transactions.fields.noCategoriesHelp')
                      : undefined
                }
              />
            )
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
          <TextField
            control={form.control}
            name="description"
            label={t('transactions.fields.description')}
            placeholder={t('transactions.fields.descriptionPlaceholder')}
            autoComplete="off"
            maxLength={DESCRIPTION_MAX_LENGTH}
          />
        </fieldset>
        <DialogFooter className="sticky -bottom-4 z-10 bg-popover sm:flex-wrap">
          <Button
            type="button"
            variant="outline"
            onClick={close}
            // The only way out of a frozen payment's view stays usable.
            disabled={false}
          >
            {frozen ? t('ui.close') : lastSaved ? t('transactions.done') : t('common.cancel')}
          </Button>
          {!transaction && (
            <Button
              type="button"
              variant="secondary"
              disabled={mutation.isPending || blocked}
              onClick={() => void submit(true)()}
            >
              {t('transactions.saveAndAdd')}
            </Button>
          )}
          {!frozen && (
            <Button
              type="submit"
              disabled={mutation.isPending || sync.pending !== null || edit.gone || blocked}
            >
              {mutation.isPending ? t('common.saving') : t('common.save')}
            </Button>
          )}
        </DialogFooter>
      </FieldGroup>
    </form>
  )
}
