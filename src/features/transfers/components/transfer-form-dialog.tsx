import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronDownIcon, InfoIcon } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { useController, useForm, useWatch, type Control } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { ConcurrentNotices } from '@/components/changed-elsewhere'
import { CalendarDateField } from '@/components/form/calendar-date-field'
import { CorrectionToggle } from '@/components/form/correction-toggle'
import { MoneyField } from '@/components/form/money-field'
import { SegmentedField } from '@/components/form/segmented-field'
import { SelectField } from '@/components/form/select-field'
import { NothingToSave } from '@/components/nothing-to-save'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { inForceIn, type Account } from '@/features/accounts/account-queries'
import { TextField } from '@/features/auth/components/text-field'
import { useBudgetEnded } from '@/features/budgets/budget-ended'
import type { IncomeOverview, PeriodSummary } from '@/features/budgets/budget-queries'
import { CorrectionReach } from '@/features/budgets/correction-reach'
import { useOlderPeriodsOption } from '@/features/budgets/older-periods'
import { useRecordSettled } from '@/features/budgets/record-settled'
import { useStartFrom } from '@/features/budgets/terms-at'
import { useCategoriesForDate } from '@/features/categories/category-queries'
import { useChargeDayText } from '@/features/subscriptions/subscription-views'
import {
  CategorySelectField,
  type CategoryChoice,
} from '@/features/transactions/components/category-select-field'
import { previewHolds } from '@/lib/preview'
import { TransferPreviewBox } from '@/features/transfers/components/transfer-preview'
import { useCreateTransfer, useUpdateTransfer } from '@/features/transfers/transfer-mutations'
import {
  TRANSFER_CADENCES,
  TRANSFER_WEEKEND_RULES,
  usePreviewCreateTransfer,
  usePreviewUpdateTransfer,
  useTransferRecord,
  useTransferTermsAt,
  type Transfer,
  type TransferCadence,
} from '@/features/transfers/transfer-queries'
import {
  createArgs,
  editArgs,
  kindOf,
  needsFirstDate,
  TRANSFER_KINDS,
  type TransferTermsBase,
} from '@/features/transfers/transfer-terms'
import { useTransferViews } from '@/features/transfers/transfer-views'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { useClientId } from '@/hooks/use-client-id'
import { useConcurrentForm } from '@/hooks/use-concurrent-form'
import { useDebounced } from '@/hooks/use-debounced'
import { useEditBase } from '@/hooks/use-edit-base'
import { formatCalendarDate, isCalendarDate } from '@/lib/date'
import { nameSchema, rappenSchema } from '@/lib/form-schemas'

/** A transfer moves 1 rappen to CHF 10 million (invalid_amount). */
const MAX_TRANSFER = 1_000_000_000
/** The offset after a pay date: 0 to 31 days (R-ACCOUNT-070, D-357). */
const OFFSETS = Array.from({ length: 32 }, (_, day) => day)
const DAYS = Array.from({ length: 31 }, (_, day) => day + 1)

function transferSchema({
  editing,
  today,
  scheduleWasFixed,
}: {
  editing: boolean
  today: string | null
  /** Edit: the terms it starts from are already on a quarterly or yearly fixed day. */
  scheduleWasFixed: boolean
}) {
  return z
    .object({
      name: nameSchema,
      fromAccountId: z.string(),
      toAccountId: z.string(),
      amount: rappenSchema({ max: MAX_TRANSFER }),
      mode: z.enum(['automatic', 'manual']),
      kind: z.enum(['period', 'income_payday', 'fixed_day']),
      incomeId: z.string(),
      offsetDays: z.number().int().min(0).max(31),
      cadence: z.enum(['monthly', 'quarterly', 'yearly']),
      dayOfMonth: z.number().int().min(1).max(31),
      firstDate: z.string(),
      weekendRule: z.enum(['none', 'previous', 'next', 'nearest']),
      linked: z.boolean(),
      categoryId: z.string(),
      past: z.boolean(),
      fromPeriodId: z.string(),
    })
    .superRefine((values, ctx) => {
      if (values.fromAccountId === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['fromAccountId'],
          message: 'validation.accountRequired',
        })
      }
      if (values.toAccountId === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['toAccountId'],
          message: 'validation.accountRequired',
        })
      } else if (values.toAccountId === values.fromAccountId) {
        ctx.addIssue({ code: 'custom', path: ['toAccountId'], message: 'validation.sameAccount' })
      }
      // A named income's payday names its income.
      if (values.kind === 'income_payday' && values.incomeId === '') {
        ctx.addIssue({ code: 'custom', path: ['incomeId'], message: 'validation.incomeRequired' })
      }
      if (values.linked && values.categoryId === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['categoryId'],
          message: 'validation.categoryRequired',
        })
      }
      if (!needsFirstDate(values)) return
      const date = values.firstDate
      if (date === '') {
        // An edit keeps the schedule's phase; a new quarterly or yearly schedule needs its date.
        if (!editing || !scheduleWasFixed) {
          ctx.addIssue({ code: 'custom', path: ['firstDate'], message: 'validation.dateRequired' })
        }
      } else if (!isCalendarDate(date)) {
        ctx.addIssue({ code: 'custom', path: ['firstDate'], message: 'validation.dateInvalid' })
      } else if (!editing && !values.past && today !== null && date < today) {
        // R-ACCOUNT-315: nothing before today unless the member records what already happened.
        ctx.addIssue({
          code: 'custom',
          path: ['firstDate'],
          message: 'validation.dueNotBeforeToday',
        })
      }
    })
}
type Input = z.input<ReturnType<typeof transferSchema>>
type Values = z.output<ReturnType<typeof transferSchema>>

interface Props {
  budgetId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  transfer?: Transfer
  accounts: Account[]
  incomes: IncomeOverview[]
  periods: PeriodSummary[]
  currentPeriod: PeriodSummary | null
}

export function TransferFormDialog(props: Props) {
  const { t } = useTranslation()
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="pr-8">
            {props.transfer ? t('transfers.editTitle') : t('transfers.addTitle')}
          </DialogTitle>
          <DialogDescription>
            {props.transfer ? t('transfers.editDescription') : t('transfers.addDescription')}
          </DialogDescription>
        </DialogHeader>
        {props.open && <TransferForm {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function baseOf(transfer: Transfer): TransferTermsBase {
  return {
    from_account_id: transfer.from_account_id,
    to_account_id: transfer.to_account_id,
    amount: transfer.amount,
    schedule: transfer.schedule,
    offset_days: transfer.offset_days,
    day_of_month: transfer.day_of_month,
    income_id: transfer.income_id,
    is_automatic: transfer.is_automatic,
    category_id: transfer.category_id,
    cadence: transfer.cadence,
    first_date: transfer.first_date,
    weekend_rule: transfer.weekend_rule,
  }
}

/** The form's terms fields for a set of terms (now, or a corrected period's). */
function termsValues(base: TransferTermsBase) {
  return {
    fromAccountId: base.from_account_id,
    toAccountId: base.to_account_id,
    amount: base.amount,
    mode: base.is_automatic ? ('automatic' as const) : ('manual' as const),
    kind: kindOf(base),
    incomeId: base.income_id ?? '',
    offsetDays: base.offset_days ?? 0,
    cadence: base.cadence ?? 'monthly',
    dayOfMonth: base.day_of_month ?? 1,
    firstDate: '',
    weekendRule: base.weekend_rule ?? ('none' as const),
    linked: base.category_id !== null,
    categoryId: base.category_id ?? '',
  }
}

// R-ACCOUNT-002 R-ACCOUNT-233: a transfer's schedule and what saving does, as the database says.
function TransferForm({
  budgetId,
  onOpenChange,
  transfer: opened,
  accounts,
  incomes,
  periods,
  currentPeriod,
}: Props) {
  const { t } = useTranslation()
  const close = () => onOpenChange(false)
  const errorMessage = useErrorMessage({
    record_changed: 'transfers.changedNotShown',
    category_to_categorise: 'transfers.errors.toCategorise',
  })
  const views = useTransferViews()
  const live = useTransferRecord(budgetId, opened?.id)
  const endedElsewhere = (record: Transfer) => opened?.is_active === true && !record.is_active
  const edit = useEditBase(opened, live, views, endedElsewhere)
  const settled = useRecordSettled(budgetId, 'transfer_overview', opened?.id, live)
  const transfer = edit.base
  const editing = transfer !== undefined
  const today = currentPeriod?.today ?? periods[0]?.today ?? null
  const olderPeriods = useOlderPeriodsOption(budgetId)
  const mustCorrect = useBudgetEnded(budgetId)
  const dayText = useChargeDayText()
  const schema = useMemo(
    () =>
      transferSchema({
        editing,
        today,
        scheduleWasFixed:
          transfer?.schedule === 'day_of_month' && (transfer.cadence ?? 'monthly') !== 'monthly',
      }),
    [editing, today, transfer?.schedule, transfer?.cadence],
  )

  const valuesOf = (from: Transfer | undefined): Input => ({
    name: from?.name ?? '',
    ...(from
      ? termsValues(baseOf(from))
      : {
          fromAccountId: '',
          toAccountId: '',
          amount: null,
          mode: 'automatic',
          kind: 'period',
          incomeId: '',
          offsetDays: 0,
          cadence: 'monthly',
          dayOfMonth: 1,
          firstDate: '',
          weekendRule: 'none',
          linked: false,
          categoryId: '',
        }),
    past: false,
    fromPeriodId: '',
  })
  const form = useForm<Input, unknown, Values>({
    resolver: zodResolver(schema),
    defaultValues: valuesOf(transfer),
  })
  const watched = useWatch({ control: form.control }) as Partial<Input>
  const kind = watched.kind ?? 'period'
  const cadence = watched.cadence ?? 'monthly'
  const past = watched.past === true
  const fromPeriodId = watched.fromPeriodId ?? ''
  const linked = watched.linked === true

  const create = useCreateTransfer(budgetId, { onDone: close })
  const update = useUpdateTransfer(budgetId, { onDone: close })
  const request = useClientId()
  const mutation = editing ? update : create

  // Periods a correction can start from: those it was in force in, before the current one.
  const correctable = transfer
    ? periods.filter(
        (period) =>
          !period.is_current &&
          period.seq >= transfer.first_seq &&
          (transfer.end_seq === null || period.seq < transfer.end_seq),
      )
    : []
  const earlier = periods.filter((period) => !period.is_current)
  // R-BUDGET-150: once the budget has ended, a change is only a correction of its periods.
  const firstCorrectable = correctable[0]?.id
  const firstEarlier = earlier[0]?.id
  useEffect(() => {
    if (!mustCorrect || past) return
    const first = editing ? firstCorrectable : firstEarlier
    if (first) {
      form.setValue('past', true)
      form.setValue('fromPeriodId', first)
    }
  }, [mustCorrect, editing, past, firstCorrectable, firstEarlier, form])

  const fromPeriod = periods.find((period) => period.id === fromPeriodId) ?? null
  const correcting = editing && past && fromPeriod !== null
  const termsAt = useTransferTermsAt(budgetId, transfer?.id, correcting ? fromPeriod.id : null)
  const notInForce = correcting && termsAt.data?.inForce === false
  const periodTerms = correcting ? (termsAt.data?.terms ?? null) : null
  const base: TransferTermsBase | null = transfer
    ? correcting
      ? periodTerms && {
          from_account_id: periodTerms.from_account_id,
          to_account_id: periodTerms.to_account_id,
          amount: periodTerms.amount,
          schedule: periodTerms.schedule,
          offset_days: periodTerms.offset_days,
          day_of_month: periodTerms.day_of_month,
          income_id: periodTerms.income_id,
          is_automatic: periodTerms.is_automatic,
          category_id: periodTerms.category_id,
          cadence: periodTerms.cadence as TransferCadence | null,
          first_date: periodTerms.first_date,
          weekend_rule: periodTerms.weekend_rule,
        }
      : baseOf(transfer)
    : null
  const startValues = base ? termsValues(base) : null
  const start = useStartFrom(
    form,
    correcting ? `period-${fromPeriod.id}-${termsAt.data?.termsFromPeriodId ?? ''}` : 'now',
    startValues,
  )
  const sync = useConcurrentForm(form, edit, valuesOf, () => update.reset(), {
    error: update.error,
    controls: ['past', 'fromPeriodId'],
    current: () => (correcting ? startValues : null),
  })

  // The period the terms take effect in: the accounts and categories offered are those then.
  const effective = (past ? fromPeriod : null) ?? currentPeriod ?? periods[0] ?? null
  const accountChoices = accounts.filter(
    (account) =>
      inForceIn(account, effective) ||
      account.id === transfer?.from_account_id ||
      account.id === transfer?.to_account_id,
  )
  const accountOptions = accountChoices.map((account) => ({
    value: account.id,
    label: account.name,
  }))
  // A named income: one in force now, or the one the transfer names (D-426).
  const incomeOptions = incomes
    .filter((income) => income.is_active || income.id === transfer?.income_id)
    .map((income) => ({ value: income.id, label: income.name }))
  const choices = useCategoriesForDate(budgetId, linked ? (effective?.start_date ?? '') : '')
  const categoryOptions = useMemo((): CategoryChoice[] => {
    const list: CategoryChoice[] = choices.data ?? []
    if (!transfer?.category_id || list.some((c) => c.category_id === transfer.category_id)) {
      return list
    }
    return [
      ...list,
      {
        category_id: transfer.category_id,
        parent_id: transfer.parent_category_id,
        name: transfer.category_name ?? '',
        parent_name: transfer.parent_category_name,
        display_order: list.length,
        kept: true,
      },
    ]
  }, [choices.data, transfer])

  // The preview: the database's answer for exactly the arguments the save will send.
  const current = { ...(watched as Values) }
  const typedAmount =
    typeof watched.amount === 'number' && Number.isSafeInteger(watched.amount) && watched.amount > 0
  const firstDateOk = !needsFirstDate(current) || isCalendarDate(current.firstDate)
  // R-ACCOUNT-315: a date before today is not sent without "It already ran"; said at the field.
  const firstDateInPast =
    !editing &&
    needsFirstDate(current) &&
    isCalendarDate(current.firstDate) &&
    !past &&
    today !== null &&
    current.firstDate < today
  const typedFirstDate = needsFirstDate(current) ? current.firstDate : ''
  useEffect(() => {
    if (isCalendarDate(typedFirstDate)) void form.trigger('firstDate')
  }, [typedFirstDate, past, form])
  const ready =
    typedAmount &&
    current.fromAccountId !== '' &&
    current.toAccountId !== '' &&
    current.fromAccountId !== current.toAccountId &&
    (current.kind !== 'income_payday' || current.incomeId !== '') &&
    (!linked || current.categoryId !== '')
  const createNow =
    !editing && ready && firstDateOk && !firstDateInPast && (!past || fromPeriodId !== '')
      ? createArgs(current)
      : null
  const updateNow =
    editing && base && ready && (current.firstDate === '' || isCalendarDate(current.firstDate))
      ? editArgs(base, current, correcting ? fromPeriod.id : null)
      : null
  const createInput = useDebounced(createNow)
  const updateInput = useDebounced(updateNow)
  const createPreview = usePreviewCreateTransfer(budgetId, createInput.value)
  const updatePreview = usePreviewUpdateTransfer(
    budgetId,
    transfer?.id,
    notInForce ? null : updateInput.value,
  )
  const preview = editing ? updatePreview : createPreview
  const previewBehind = (editing ? updateInput.stale : createInput.stale) || preview.isFetching
  // What is typed now, not what was last asked: a save never goes ahead of its preview.
  const needsInput = (editing ? updateNow : createNow) === null
  // Save waits for the preview of exactly what it will send (D-502).
  const previewWaits = !needsInput && (previewBehind || previewHolds(preview))

  const onSubmit = form.handleSubmit((values) => {
    const typed = values
    if (editing && !base) return
    const done =
      transfer && base
        ? update.mutateAsync({
            transfer,
            name: values.name,
            args: editArgs(base, typed, correcting ? fromPeriod.id : null),
          })
        : create
            .mutateAsync({ name: values.name, args: createArgs(typed), clientId: request.id })
            .then(
              (id) => {
                request.renew()
                return id
              },
              (error: unknown) => {
                request.afterFailure(error)
                throw error
              },
            )
    return done.catch(() => undefined)
  })

  const periodLabel = (period: PeriodSummary) =>
    t('income.fields.fromPeriod', {
      start: formatCalendarDate(period.start_date),
      end: formatCalendarDate(period.end_date),
    })

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate data-testid="transfer-form">
      <FieldGroup>
        <ConcurrentNotices
          adding={!editing}
          gone={edit.gone}
          pending={sync.pending}
          updated={sync.updated}
          recovered={sync.recovered}
          onUseTheirs={sync.useTheirs}
          onKeepMine={sync.keepMine}
          error={mutation.error}
          message={errorMessage}
          ended={live !== null && live !== undefined && edit.gone}
          endedText={t('transfers.endedElsewhere')}
        />
        <TextField
          control={form.control}
          name="name"
          label={t('transfers.fields.name')}
          placeholder={t('transfers.fields.namePlaceholder')}
          autoComplete="off"
          autoFocus
        />
        {transfer && correctable.length > 0 && (
          <CorrectionToggle
            checked={past}
            onCheckedChange={(next) => {
              form.setValue('past', next)
              form.setValue('fromPeriodId', next ? (correctable[0]?.id ?? '') : '')
            }}
            label={t('income.correction.label')}
            warning={t('transfers.correctionWarning')}
            required={mustCorrect ? t('corrections.budgetEnded') : undefined}
          >
            <SelectField
              control={form.control}
              name="fromPeriodId"
              more={olderPeriods}
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
              kept={start.kept}
              views={edit.describe(transfer)}
            />
          </CorrectionToggle>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            control={form.control}
            name="fromAccountId"
            label={t('transfers.fields.from')}
            options={accountOptions}
          />
          <SelectField
            control={form.control}
            name="toAccountId"
            label={t('transfers.fields.to')}
            options={accountOptions}
          />
        </div>
        <MoneyField
          control={form.control}
          name="amount"
          label={
            kind === 'fixed_day' && cadence !== 'monthly'
              ? t(`transfers.fields.amountPer.${cadence}`)
              : t('transfers.fields.amountEach')
          }
        />
        <SegmentedField
          control={form.control}
          name="mode"
          label={t('transfers.fields.mode')}
          options={[
            { value: 'automatic', label: t('transfers.mode.automatic') },
            { value: 'manual', label: t('transfers.mode.manual') },
          ]}
          description={t(
            watched.mode === 'manual'
              ? 'transfers.mode.manualHelp'
              : 'transfers.mode.automaticHelp',
          )}
        />
        <KindField control={form.control} />
        {kind !== 'fixed_day' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField
              control={form.control}
              name="offsetDays"
              numeric
              label={t('transfers.fields.offset')}
              options={OFFSETS.map((day) => ({
                value: String(day),
                label:
                  day === 0
                    ? t('transfers.when.payday')
                    : t('transfers.when.after', { count: day }),
              }))}
            />
            {kind === 'income_payday' && (
              <SelectField
                control={form.control}
                name="incomeId"
                label={t('transfers.fields.namedIncome')}
                description={t('transfers.fields.namedIncomeHelp')}
                options={incomeOptions}
              />
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField
                control={form.control}
                name="cadence"
                label={t('transfers.fields.cadence')}
                options={TRANSFER_CADENCES.map((value) => ({
                  value,
                  label: t(`transfers.cadence.${value}`),
                }))}
              />
              {cadence === 'monthly' ? (
                <SelectField
                  control={form.control}
                  name="dayOfMonth"
                  numeric
                  label={t('transfers.fields.day')}
                  description={
                    (watched.dayOfMonth ?? 1) > 28 ? dayText(watched.dayOfMonth ?? 29) : undefined
                  }
                  options={DAYS.map((day) => ({ value: String(day), label: String(day) }))}
                />
              ) : (
                <CalendarDateField
                  control={form.control}
                  name="firstDate"
                  label={editing ? t('transfers.fields.newNextDue') : t('transfers.fields.nextDue')}
                  description={
                    editing
                      ? t('transfers.fields.newNextDueHelp')
                      : t('transfers.fields.nextDueHelp')
                  }
                />
              )}
            </div>
            {/* R-ACCOUNT-550: the weekend rule belongs to a fixed day only. */}
            <SelectField
              control={form.control}
              name="weekendRule"
              label={t('transfers.weekendRule.label')}
              description={t('transfers.weekendRule.help')}
              options={TRANSFER_WEEKEND_RULES.map((rule) => ({
                value: rule,
                label: t(`transfers.weekendRule.${rule}`),
              }))}
            />
          </>
        )}
        <LinkedField control={form.control} />
        {linked && (
          <CategorySelectField
            control={form.control}
            name="categoryId"
            label={t('transfers.fields.category')}
            options={categoryOptions}
            loading={choices.isPending && effective !== null}
            description={t('transfers.fields.categoryHelp')}
          />
        )}
        {!editing && (
          <PastField
            control={form.control}
            periods={[...(currentPeriod ? [currentPeriod] : []), ...earlier]}
            label={periodLabel}
            more={olderPeriods}
            mustCorrect={mustCorrect}
            past={past}
            onToggle={(next) => {
              form.setValue('past', next)
              form.setValue('fromPeriodId', next ? (currentPeriod?.id ?? firstEarlier ?? '') : '')
            }}
          />
        )}
        {!notInForce && (
          <TransferPreviewBox
            preview={preview.data}
            pending={preview.isPending || previewBehind}
            error={preview.error}
            needsInput={needsInput}
            creating={!editing}
            recordsPast={past}
            firstDateInPast={firstDateInPast}
            fetching={preview.isFetching}
            onRetry={() => void preview.refetch()}
            incomeName={
              kind === 'income_payday'
                ? (incomes.find((income) => income.id === watched.incomeId)?.name ?? null)
                : null
            }
          />
        )}
        <Alert>
          <InfoIcon aria-hidden />
          <AlertDescription>
            {editing
              ? past
                ? t('transfers.correctionAppliesFrom')
                : currentPeriod
                  ? t('transfers.editAppliesFrom', {
                      date: formatCalendarDate(currentPeriod.start_date),
                    })
                  : t('income.editAppliesFromNoPeriod')
              : past
                ? t('transfers.addRecordsPast')
                : t('transfers.addFromToday')}
          </AlertDescription>
        </Alert>
        <NothingToSave show={update.data === false && !update.isPending} />
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
              (editing && !base) ||
              firstDateInPast ||
              previewWaits
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
 * When it runs: three plain choices (D-610), each with what it means, then the difference
 * between the main income and a named income in a few words and, on request, its example.
 */
// R-ACCOUNT-553: the three kinds, the main-versus-named paragraph and its example (Q-358).
function KindField({ control }: { control: Control<Input, unknown, Values> }) {
  const { t } = useTranslation()
  const id = useId()
  const { field } = useController({ control, name: 'kind' })
  const value: unknown = field.value
  const [open, setOpen] = useState(false)
  return (
    <FieldSet data-testid="transfer-kind">
      <FieldLegend variant="label">{t('transfers.kinds.label')}</FieldLegend>
      <RadioGroup
        name={field.name}
        value={typeof value === 'string' ? value : 'period'}
        onValueChange={(next) => field.onChange(next)}
        className="gap-2"
      >
        {TRANSFER_KINDS.map((option) => (
          <FieldLabel key={option} htmlFor={`${id}-${option}`} className="font-normal">
            <Field orientation="horizontal">
              <RadioGroupItem value={option} id={`${id}-${option}`} />
              <FieldContent>
                <span className="font-medium">{t(`transfers.kinds.${option}`)}</span>
                <FieldDescription>{t(`transfers.kinds.${option}Help`)}</FieldDescription>
              </FieldContent>
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
        <p data-testid="transfer-kind-explain">{t('transfers.kinds.explain')}</p>
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="link" size="sm" className="h-auto p-0 text-sm">
              <ChevronDownIcon
                className={open ? 'rotate-180 transition-transform' : 'transition-transform'}
                aria-hidden
              />
              {t('transfers.kinds.exampleTitle')}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <p className="mt-1" data-testid="transfer-kind-example">
              {t('transfers.kinds.example')}
            </p>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </FieldSet>
  )
}

/** "Count it as spending in a category" (R-ACCOUNT-072). */
function LinkedField({ control }: { control: Control<Input, unknown, Values> }) {
  const { t } = useTranslation()
  const id = useId()
  const { field } = useController({ control, name: 'linked' })
  return (
    <Field orientation="horizontal">
      <Checkbox
        id={id}
        checked={field.value}
        onCheckedChange={(next) => field.onChange(next === true)}
        onBlur={field.onBlur}
      />
      <FieldContent>
        <FieldLabel htmlFor={id}>{t('transfers.fields.linked')}</FieldLabel>
        <FieldDescription>{t('transfers.fields.linkedHelp')}</FieldDescription>
      </FieldContent>
    </Field>
  )
}

/**
 * "It already ran: record what happened since…" (D-493): off by default, so a new transfer
 * records nothing dated before today; on, it names the period the earlier occurrences start in.
 */
function PastField({
  control,
  periods,
  label,
  more,
  mustCorrect,
  past,
  onToggle,
}: {
  control: Control<Input, unknown, Values>
  periods: PeriodSummary[]
  label: (period: PeriodSummary) => string
  more: ReturnType<typeof useOlderPeriodsOption>
  mustCorrect: boolean
  past: boolean
  onToggle: (next: boolean) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <Field orientation="horizontal">
        <Checkbox
          id={id}
          checked={past}
          disabled={mustCorrect}
          onCheckedChange={(next) => onToggle(next === true)}
        />
        <FieldContent>
          <FieldLabel htmlFor={id}>{t('transfers.fields.past')}</FieldLabel>
          <FieldDescription>{t('transfers.fields.pastHelp')}</FieldDescription>
        </FieldContent>
      </Field>
      {past && (
        <SelectField
          control={control}
          name="fromPeriodId"
          more={more}
          label={t('transfers.fields.pastFrom')}
          options={periods.map((period) => ({
            value: period.id,
            label: period.is_current ? t('transfers.fields.thisPeriod') : label(period),
          }))}
        />
      )}
    </div>
  )
}
