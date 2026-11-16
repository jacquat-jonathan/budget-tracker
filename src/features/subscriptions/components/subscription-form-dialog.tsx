import { zodResolver } from '@hookform/resolvers/zod'
import { InfoIcon } from 'lucide-react'
import { useMemo } from 'react'
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
import { useStartFrom, useTermsAt } from '@/features/budgets/terms-at'
import { useCategoriesForDate } from '@/features/categories/category-queries'
import { ChargeDatesPreview } from '@/features/subscriptions/components/charge-dates-preview'
import { useSubscriptionViews } from '@/features/subscriptions/subscription-views'
import {
  useCreateSubscription,
  useUpdateSubscription,
  type TermsBase,
} from '@/features/subscriptions/subscription-mutations'
import {
  SUBSCRIPTION_CADENCES,
  useSubscriptionRecord,
  type Subscription,
  type SubscriptionCadence,
} from '@/features/subscriptions/subscription-queries'
import {
  CategorySelectField,
  type CategoryChoice,
} from '@/features/transactions/components/category-select-field'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { useConcurrentForm } from '@/hooks/use-concurrent-form'
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
  const errorMessage = useErrorMessage()
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
  const [cadence, chargeDate, fromPeriodId, correct, categoryId] = useWatch({
    control: form.control,
    name: ['cadence', 'chargeDate', 'fromPeriodId', 'correct', 'categoryId'],
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
    correcting ? fromPeriod.seq : null,
  )
  const periodTerms = correcting ? (termsAt.data ?? null) : null
  const base: (TermsBase & { anchor_date: string }) | null = subscription
    ? correcting
      ? periodTerms && {
          price: periodTerms.price,
          cadence: periodTerms.cadence,
          category_id: periodTerms.category_id,
          anchor_date: periodTerms.anchor_date,
        }
      : subscription
    : null
  useStartFrom(
    form,
    correcting ? `period-${fromPeriod.id}-${periodTerms?.id ?? ''}` : 'now',
    base && subscription
      ? { price: base.price, cadence: base.cadence, categoryId: base.category_id }
      : null,
  )

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
            <p className="text-sm text-muted-foreground" data-testid="correction-start">
              {periodTerms
                ? t('corrections.showsPeriodTerms')
                : termsAt.isError
                  ? errorMessage(termsAt.error)
                  : t('common.loading')}
            </p>
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
              { value: '', label: t('income.fields.fromCurrent') },
              ...earlier.map((period) => ({ value: period.id, label: periodLabel(period) })),
            ]}
          />
        )}
        <SchedulePreview
          subscription={subscription}
          cadence={cadence}
          chargeDate={chargeDate}
          firstPeriodStart={effective?.start_date ?? null}
          today={today}
          correctionAnchor={correcting ? (periodTerms?.anchor_date ?? null) : undefined}
        />
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

/**
 * Which dates the database will charge, for the schedule the form describes (D-170):
 *
 * - a new subscription: its schedule from the first charge date, from the start of the period
 *   it counts from (earlier dates are never charged); those up to today are created at once;
 * - a new next charge date: that date and the ones after it;
 * - a new cadence alone: it continues from the next charge of the current schedule;
 * - otherwise the schedule stays: its next charges.
 */
function SchedulePreview({
  subscription,
  cadence,
  chargeDate,
  firstPeriodStart,
  today,
  correctionAnchor,
}: {
  subscription: Subscription | undefined
  cadence: SubscriptionCadence
  chargeDate: string
  /** A correction: the date the chosen period's schedule counts from (undefined otherwise). */
  correctionAnchor?: string | null
  firstPeriodStart: string | null
  today: string | null
}) {
  const typed = isCalendarDate(chargeDate) ? chargeDate : null
  let anchor: string | null
  let from: string | null = null
  let note: 'new' | 'date' | 'cadence' | 'kept'
  if (!subscription) {
    anchor = typed
    from = firstPeriodStart
    note = 'new'
  } else if (chargeDate !== '') {
    anchor = typed
    note = 'date'
  } else if (correctionAnchor !== undefined) {
    // A correction keeps the date its schedule counts from (D-170): the charges still to come.
    anchor = correctionAnchor
    from = subscription.next_charge_date
    note = 'kept'
  } else if (cadence !== subscription.cadence) {
    anchor = subscription.next_charge_date
    note = 'cadence'
  } else {
    anchor = subscription.anchor_date
    from = subscription.next_charge_date
    note = 'kept'
  }
  if (subscription && subscription.next_charge_date === null && note !== 'date') return null
  return (
    <ChargeDatesPreview
      anchor={anchor}
      cadence={cadence}
      from={from}
      today={today}
      note={note}
      nextChargeDate={subscription?.next_charge_date ?? null}
    />
  )
}
