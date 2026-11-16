import { zodResolver } from '@hookform/resolvers/zod'
import { InfoIcon } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { ConcurrentNotices } from '@/components/changed-elsewhere'
import { CalendarDateField } from '@/components/form/calendar-date-field'
import { CorrectionToggle } from '@/components/form/correction-toggle'
import { MoneyField } from '@/components/form/money-field'
import { SelectField } from '@/components/form/select-field'
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
import type { PeriodSummary } from '@/features/budgets/budget-queries'
import { useRecordSettled } from '@/features/budgets/record-settled'
import { CorrectionReach } from '@/features/budgets/correction-reach'
import { useStartFrom, useTermsAt } from '@/features/budgets/terms-at'
import { useCategoriesForDate } from '@/features/categories/category-queries'
import { ChargeDatesPreview } from '@/features/subscriptions/components/charge-dates-preview'
import { useChargeDayText, useSubscriptionViews } from '@/features/subscriptions/subscription-views'
import {
  useCreateSubscription,
  useUpdateSubscription,
  termsArgs,
  type TermsBase,
} from '@/features/subscriptions/subscription-mutations'
import {
  SUBSCRIPTION_CADENCES,
  usePreviewCreate,
  usePreviewUpdate,
  useSubscriptionRecord,
  type Subscription,
} from '@/features/subscriptions/subscription-queries'
import {
  CategorySelectField,
  type CategoryChoice,
} from '@/features/transactions/components/category-select-field'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { useConcurrentForm } from '@/hooks/use-concurrent-form'
import { useDebounced } from '@/hooks/use-debounced'
import { useEditBase } from '@/hooks/use-edit-base'
import { formatCalendarDate, isCalendarDate } from '@/lib/date'
import { nameSchema, rappenSchema } from '@/lib/form-schemas'

function subscriptionSchema({ editing, today }: { editing: boolean; today: string | null }) {
  return z
    .object({
      name: nameSchema,
      price: rappenSchema(),
      cadence: z.enum(['monthly', 'quarterly', 'half_yearly', 'yearly']),
      categoryId: z.string().refine((value) => value !== '', {
        error: 'validation.categoryRequired',
      }),
      /** Create: the first charge date. Edit: a new next charge date, "" to keep the schedule. */
      chargeDate: z.string(),
      fromPeriodId: z.string(),
      correct: z.boolean(),
    })
    .superRefine((values, ctx) => {
      const date = values.chargeDate
      if (date === '') {
        if (!editing) {
          ctx.addIssue({ code: 'custom', path: ['chargeDate'], message: 'validation.dateRequired' })
        }
        return
      }
      if (!isCalendarDate(date)) {
        ctx.addIssue({ code: 'custom', path: ['chargeDate'], message: 'validation.dateInvalid' })
      } else if (editing && !values.correct && today !== null && date <= today) {
        // R-SUBSCRIPTION-114: a new schedule from now starts after today.
        ctx.addIssue({
          code: 'custom',
          path: ['chargeDate'],
          message: 'validation.nextChargeAfterToday',
        })
      }
    })
}
type Input = z.input<ReturnType<typeof subscriptionSchema>>
type Values = z.output<ReturnType<typeof subscriptionSchema>>

interface Props {
  budgetId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The subscription to edit; a new one when absent. */
  subscription?: Subscription
  periods: PeriodSummary[]
  currentPeriod: PeriodSummary | null
}

/** Add or edit a subscription. Its form mounts only while open. */
export function SubscriptionFormDialog(props: Props) {
  const { t } = useTranslation()
  const { open, onOpenChange, subscription } = props
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-8">
            {subscription ? t('subscriptions.editTitle') : t('subscriptions.addTitle')}
          </DialogTitle>
          <DialogDescription>
            {subscription ? t('subscriptions.editDescription') : t('subscriptions.addDescription')}
          </DialogDescription>
        </DialogHeader>
        {open && <SubscriptionForm {...props} />}
      </DialogContent>
    </Dialog>
  )
}

// R-SUBSCRIPTION-121: the schedule is previewed by the database; edits apply from now.
function SubscriptionForm({
  budgetId,
  onOpenChange,
  subscription: opened,
  periods,
  currentPeriod,
}: Props) {
  const { t } = useTranslation()
  // A refused save over a change this form does not show says so (the shown fields that
  // changed have their own notice), in the save's own words.
  const errorMessage = useErrorMessage({ record_changed: 'subscriptions.changedNotShown' })
  const close = () => onOpenChange(false)
  const views = useSubscriptionViews()
  // R-CONCURRENCY-091: saved over the version opened; the record is read by its id.
  const live = useSubscriptionRecord(budgetId, opened?.id)
  // Ended by someone else meanwhile: nothing can be saved from now (as step 3's forms).
  const endedElsewhere = (record: Subscription) => opened?.is_active === true && !record.is_active
  const edit = useEditBase(opened, live, views.subscription, endedElsewhere)
  const endedNow = live !== null && live !== undefined && edit.gone
  const settled = useRecordSettled(budgetId, 'subscription_overview', opened?.id, live)
  const subscription = edit.base
  const editing = subscription !== undefined
  const today = currentPeriod?.today ?? periods[0]?.today ?? null
  const schema = useMemo(() => subscriptionSchema({ editing, today }), [editing, today])

  const valuesOf = (from: Subscription | undefined): Input => ({
    name: from?.name ?? '',
    price: from?.price ?? null,
    cadence: from?.cadence ?? 'monthly',
    categoryId: from?.category_id ?? '',
    chargeDate: '',
    fromPeriodId: '',
    correct: false,
  })
  const form = useForm<Input, unknown, Values>({
    resolver: zodResolver(schema),
    defaultValues: valuesOf(subscription),
  })
  const [cadence, chargeDate, fromPeriodId, correct, categoryId, price] = useWatch({
    control: form.control,
    name: ['cadence', 'chargeDate', 'fromPeriodId', 'correct', 'categoryId', 'price'],
  })

  const create = useCreateSubscription(budgetId, { onDone: close })
  const update = useUpdateSubscription(budgetId, { onDone: close })
  const mutation = editing ? update : create
  const sync = useConcurrentForm(form, edit, valuesOf, () => update.reset())

  const periodLabel = (period: PeriodSummary) =>
    t('income.fields.fromPeriod', {
      start: formatCalendarDate(period.start_date),
      end: formatCalendarDate(period.end_date),
    })
  const earlier = periods.filter((period) => !period.is_current)
  const correctable = subscription
    ? periods.filter(
        (period) =>
          !period.is_current &&
          period.seq >= subscription.first_seq &&
          (subscription.end_seq === null || period.seq < subscription.end_seq),
      )
    : []

  // R-BUDGET-150: once the budget has ended, a change is only a correction of its periods.
  const mustCorrect = currentPeriod === null
  const firstCorrectable = correctable[0]?.id
  const firstEarlier = earlier[0]?.id
  useEffect(() => {
    if (!mustCorrect) return
    if (editing && !correct && firstCorrectable) {
      form.setValue('correct', true)
      form.setValue('fromPeriodId', firstCorrectable)
    }
    if (!editing && fromPeriodId === '' && firstEarlier) form.setValue('fromPeriodId', firstEarlier)
  }, [mustCorrect, editing, correct, fromPeriodId, firstCorrectable, firstEarlier, form])
  // The period the terms take effect in: the categories offered are those in force then.
  const fromPeriod = periods.find((period) => period.id === fromPeriodId) ?? null
  const effective = (editing ? (correct ? fromPeriod : null) : fromPeriod) ?? currentPeriod
  const choices = useCategoriesForDate(budgetId, effective?.start_date ?? '')

  // R-SUBSCRIPTION-140: a correction starts from the terms of the period chosen, read from the
  // database, and sends only what the user changes from them.
  const correcting = editing && correct && fromPeriod !== null
  const termsAt = useTermsAt(
    'subscription',
    budgetId,
    subscription?.id,
    correcting ? fromPeriod.id : null,
  )
  const periodTerms = correcting ? (termsAt.data?.terms ?? null) : null
  // Not in force in that period: nothing to correct there, nothing to save.
  const notInForce = correcting && termsAt.data?.inForce === false
  const base: (TermsBase & { charge_day: number }) | null = subscription
    ? correcting
      ? periodTerms && {
          price: periodTerms.price,
          cadence: periodTerms.cadence,
          category_id: periodTerms.category_id,
          charge_day: periodTerms.charge_day,
        }
      : subscription
    : null
  useStartFrom(
    form,
    correcting ? `period-${fromPeriod.id}-${termsAt.data?.termsFromPeriodId ?? ''}` : 'now',
    base && subscription
      ? { price: base.price, cadence: base.cadence, categoryId: base.category_id }
      : null,
  )

  // The preview: the database's answer for exactly the arguments the save will send.
  const typedPrice = typeof price === 'number' && Number.isSafeInteger(price) ? price : null
  const updateArgs = useDebounced(
    base && typedPrice !== null
      ? termsArgs({
          base,
          price: typedPrice,
          cadence,
          categoryId,
          nextChargeDate: isCalendarDate(chargeDate) ? chargeDate : null,
          fromPeriodId: correct ? fromPeriodId || null : null,
        })
      : null,
  )
  const createArgs = useDebounced({
    cadence,
    firstChargeDate: isCalendarDate(chargeDate) ? chargeDate : '',
    fromPeriodId: fromPeriodId || null,
  })
  const createPreview = usePreviewCreate(budgetId, createArgs)
  const updatePreview = usePreviewUpdate(
    budgetId,
    subscription?.id,
    updateArgs ?? {},
    editing &&
      updateArgs !== null &&
      !notInForce &&
      (chargeDate === '' || isCalendarDate(chargeDate)),
  )
  const preview = editing ? updatePreview : createPreview
  const dayText = useChargeDayText()
  const typedDay = isCalendarDate(chargeDate) ? Number(chargeDate.slice(8, 10)) : null
  const scheduleNote = editing
    ? typedDay !== null
      ? dayText(typedDay)
      : cadence !== subscription.cadence && !correcting
        ? t('subscriptions.preview.cadenceKeepsDay', { day: dayText(base?.charge_day ?? 1) })
        : dayText(base?.charge_day ?? subscription.charge_day)
    : typedDay !== null
      ? dayText(typedDay)
      : null

  const options = useMemo((): CategoryChoice[] => {
    const list: CategoryChoice[] = choices.data ?? []
    if (!subscription || list.some((choice) => choice.category_id === subscription.category_id)) {
      return list
    }
    return [
      ...list,
      {
        category_id: subscription.category_id,
        parent_id: subscription.parent_category_id,
        name: subscription.category_name ?? '',
        parent_name: subscription.parent_category_name,
        display_order: list.length,
        kept: true,
      },
    ]
  }, [choices.data, subscription])

  const onSubmit = form.handleSubmit((values) => {
    if (subscription && !base) return
    const done = subscription
      ? update.mutateAsync({
          subscription,
          base: base ?? subscription,
          name: values.name,
          price: values.price,
          cadence: values.cadence,
          categoryId: values.categoryId,
          nextChargeDate: values.chargeDate === '' ? null : values.chargeDate,
          fromPeriodId: values.correct ? values.fromPeriodId || null : null,
        })
      : create.mutateAsync({
          name: values.name,
          price: values.price,
          cadence: values.cadence,
          categoryId: values.categoryId,
          firstChargeDate: values.chargeDate,
          fromPeriodId: values.fromPeriodId || null,
        })
    return done.catch(() => undefined)
  })

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate data-testid="subscription-form">
      <FieldGroup>
        <ConcurrentNotices
          gone={edit.gone}
          pending={sync.pending}
          updated={sync.updated}
          onUseTheirs={sync.useTheirs}
          onKeepMine={sync.keepMine}
          error={mutation.error}
          message={errorMessage}
          ended={endedNow}
          endedText={t('subscriptions.endedElsewhere')}
        />
        <TextField
          control={form.control}
          name="name"
          label={t('subscriptions.fields.name')}
          placeholder={t('subscriptions.fields.namePlaceholder')}
          autoComplete="off"
          autoFocus
        />
        {/* The period first: the terms below then show what was in force in it. */}
        {subscription && correctable.length > 0 && (
          <CorrectionToggle
            checked={correct}
            onCheckedChange={(next) => {
              form.setValue('correct', next)
              form.setValue('fromPeriodId', next ? (correctable[0]?.id ?? '') : '')
            }}
            label={t('income.correction.label')}
            warning={t('subscriptions.correctionWarning')}
            required={mustCorrect ? t('corrections.budgetEnded') : undefined}
          >
            <SelectField
              control={form.control}
              name="fromPeriodId"
              label={t('corrections.period')}
              options={correctable.map((period) => ({
                value: period.id,
                label: periodLabel(period),
              }))}
            />
            <CorrectionReach
              periods={periods}
              periodId={fromPeriodId}
              terms={termsAt.data}
              pending={termsAt.isPending}
              error={termsAt.isError ? errorMessage(termsAt.error) : null}
            />
          </CorrectionToggle>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MoneyField control={form.control} name="price" label={t('subscriptions.fields.price')} />
          <SelectField
            control={form.control}
            name="cadence"
            label={t('subscriptions.fields.cadence')}
            options={SUBSCRIPTION_CADENCES.map((value) => ({
              value,
              label: t(`subscriptions.cadence.${value}`),
            }))}
          />
        </div>
        <CategorySelectField
          control={form.control}
          name="categoryId"
          label={t('subscriptions.fields.category')}
          options={options}
          loading={choices.isPending && effective !== null}
          description={categoryId === '' ? t('subscriptions.fields.categoryHelp') : undefined}
        />
        <CalendarDateField
          control={form.control}
          name="chargeDate"
          label={
            editing ? t('subscriptions.fields.nextCharge') : t('subscriptions.fields.firstCharge')
          }
          description={
            editing
              ? t('subscriptions.fields.nextChargeHelp')
              : t('subscriptions.fields.firstChargeHelp')
          }
        />
        {!editing && earlier.length > 0 && (
          <SelectField
            control={form.control}
            name="fromPeriodId"
            label={t('subscriptions.fields.from')}
            description={t('subscriptions.fields.fromHelp')}
            options={[
              ...(mustCorrect ? [] : [{ value: '', label: t('income.fields.fromCurrent') }]),
              ...earlier.map((period) => ({ value: period.id, label: periodLabel(period) })),
            ]}
          />
        )}
        {!notInForce && (
          <ChargeDatesPreview
            charges={preview.data}
            pending={preview.isPending || (editing && updateArgs === null)}
            error={preview.error}
            needsDate={!editing && !isCalendarDate(chargeDate)}
            note={scheduleNote}
          />
        )}
        <Alert>
          <InfoIcon aria-hidden />
          <AlertDescription>
            {subscription
              ? correct
                ? t('subscriptions.correctionAppliesFrom')
                : currentPeriod
                  ? t('subscriptions.editAppliesFrom', {
                      date: formatCalendarDate(currentPeriod.start_date),
                    })
                  : t('income.editAppliesFromNoPeriod')
              : t('subscriptions.addAppliesFrom')}
          </AlertDescription>
        </Alert>
        <DialogFooter className="sticky -bottom-4 z-10 bg-popover">
          <Button type="button" variant="outline" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            disabled={
              mutation.isPending ||
              sync.pending !== null ||
              edit.gone ||
              !settled ||
              notInForce ||
              (editing && !base)
            }
          >
            {mutation.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  )
}
