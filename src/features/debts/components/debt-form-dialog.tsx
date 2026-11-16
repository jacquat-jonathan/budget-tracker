import { zodResolver } from '@hookform/resolvers/zod'
import { InfoIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { useBudgetEnded } from '@/features/budgets/budget-ended'
import { useOlderPeriodsOption } from '@/features/budgets/older-periods'
import { ConcurrentNotices } from '@/components/changed-elsewhere'
import { NothingToSave } from '@/components/nothing-to-save'
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
import { useCategoriesForDate } from '@/features/categories/category-queries'
import { useCreateDebt, useUpdateDebt } from '@/features/debts/debt-mutations'
import { useRecordSettled } from '@/features/budgets/record-settled'
import { CorrectionReach } from '@/features/budgets/correction-reach'
import { useStartFrom, useTermsAt } from '@/features/budgets/terms-at'
import { useDebtRecord, type Debt } from '@/features/debts/debt-queries'
import { useSubscriptionViews } from '@/features/subscriptions/subscription-views'
import {
  CategorySelectField,
  type CategoryChoice,
} from '@/features/transactions/components/category-select-field'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { useConcurrentForm } from '@/hooks/use-concurrent-form'
import { useEditBase } from '@/hooks/use-edit-base'
import { formatCalendarDate } from '@/lib/date'
import { nameSchema, rappenSchema } from '@/lib/form-schemas'
import { formatInterestRate, parseInterestRate } from '@/lib/interest-rate'

const debtSchema = z.object({
  name: nameSchema,
  categoryId: z.string().refine((value) => value !== '', { error: 'validation.categoryRequired' }),
  principal: rappenSchema(),
  rate: z
    .string()
    .refine((value) => parseInterestRate(value) !== null, { error: 'validation.interestRate' })
    .transform((value) => parseInterestRate(value) ?? '0'),
  monthlyPayment: rappenSchema({ min: 0, tooSmall: 'validation.amountNegative' }),
  fromPeriodId: z.string(),
  correct: z.boolean(),
})
type Input = z.input<typeof debtSchema>
type Values = z.output<typeof debtSchema>

interface Props {
  budgetId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  debt?: Debt
  periods: PeriodSummary[]
  currentPeriod: PeriodSummary | null
  /** After a new debt is saved: its id (to open it). */
  onCreated?: (id: string) => void
}

export function DebtFormDialog(props: Props) {
  const { t } = useTranslation()
  const { open, onOpenChange, debt } = props
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-8">
            {debt ? t('debts.editTitle') : t('debts.addTitle')}
          </DialogTitle>
          <DialogDescription>
            {debt ? t('debts.editDescription') : t('debts.addDescription')}
          </DialogDescription>
        </DialogHeader>
        {open && <DebtForm {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function DebtForm({
  budgetId,
  onOpenChange,
  debt: openedNow,
  periods,
  currentPeriod,
  onCreated,
}: Props) {
  const { t } = useTranslation()
  const olderPeriods = useOlderPeriodsOption(budgetId)
  // The version the dialog was opened on, kept: the page may pass newer ones while it is open.
  const [opened] = useState(openedNow)
  // A refused save over a change this form does not show says so (the shown fields that
  // changed have their own notice), in the save's own words.
  const errorMessage = useErrorMessage({
    record_changed: 'debts.changedNotShown',
    debt_ended: 'debts.endedErrors.edit',
  })
  const close = () => onOpenChange(false)
  const views = useSubscriptionViews()
  const live = useDebtRecord(budgetId, opened?.id)
  // Ended by someone else meanwhile: nothing can be saved from now (as step 3's forms).
  const endedElsewhere = (record: Debt) => opened?.end_seq === null && record.end_seq !== null
  const edit = useEditBase(opened, live, views.debt, endedElsewhere)
  const debt = edit.base
  const endedNow = live !== null && live !== undefined && edit.gone
  // R-DEBT-190: an ended debt is frozen: its form says so and offers no save.
  const frozen = !edit.gone && debt !== undefined && debt.end_seq !== null
  const settled = useRecordSettled(budgetId, 'debt_overview', opened?.id, live)

  const valuesOf = (from: Debt | undefined): Input => ({
    name: from?.name ?? '',
    categoryId: from?.category_id ?? '',
    principal: from?.principal ?? null,
    rate: from && from.interest_rate !== 0 ? formatInterestRate(from.interest_rate) : '',
    monthlyPayment: from?.monthly_payment ?? null,
    fromPeriodId: '',
    correct: false,
  })
  const form = useForm<Input, unknown, Values>({
    resolver: zodResolver(debtSchema),
    defaultValues: valuesOf(debt),
  })
  const [fromPeriodId, correct] = useWatch({
    control: form.control,
    name: ['fromPeriodId', 'correct'],
  })
  const create = useCreateDebt(budgetId, {
    onDone: (id) => {
      close()
      onCreated?.(id)
    },
  })
  const update = useUpdateDebt(budgetId, { onDone: close })
  const mutation = debt ? update : create
  const sync = useConcurrentForm(form, edit, valuesOf, () => update.reset(), {
    error: update.error,
    controls: ['correct', 'fromPeriodId'],
    current: () => (correcting ? startValues : null),
  })

  const label = (period: PeriodSummary) =>
    t('income.fields.fromPeriod', {
      start: formatCalendarDate(period.start_date),
      end: formatCalendarDate(period.end_date),
    })
  const earlier = periods.filter((period) => !period.is_current)
  const correctable = debt
    ? periods.filter(
        (period) =>
          !period.is_current &&
          period.seq >= debt.first_seq &&
          (debt.end_seq === null || period.seq < debt.end_seq),
      )
    : []

  // R-BUDGET-150: once the budget has ended, a change is only a correction of its periods.
  const mustCorrect = useBudgetEnded(budgetId)
  const firstCorrectable = correctable[0]?.id
  const firstEarlier = earlier[0]?.id
  useEffect(() => {
    if (!mustCorrect) return
    if (debt && !correct && firstCorrectable) {
      form.setValue('correct', true)
      form.setValue('fromPeriodId', firstCorrectable)
    }
    if (!debt && fromPeriodId === '' && firstEarlier) form.setValue('fromPeriodId', firstEarlier)
  }, [mustCorrect, debt, correct, fromPeriodId, firstCorrectable, firstEarlier, form])
  const fromPeriod = periods.find((period) => period.id === fromPeriodId) ?? null
  // A correction starts from the terms of the period chosen, read from the database.
  const correcting = debt !== undefined && correct && fromPeriod !== null
  const termsAt = useTermsAt('debt', budgetId, debt?.id, correcting ? fromPeriod.id : null)
  const periodTerms = correcting ? (termsAt.data?.terms ?? null) : null
  // Not in force in that period: nothing to correct there, nothing to save.
  const notInForce = correcting && termsAt.data?.inForce === false
  const base = debt ? (correcting ? periodTerms : debt) : null
  // The terms the form starts from: now, or the chosen period's (read from the database).
  const startValues =
    base && debt
      ? {
          rate: base.interest_rate !== 0 ? formatInterestRate(base.interest_rate) : '',
          monthlyPayment: base.monthly_payment,
          categoryId: base.category_id,
        }
      : null
  const start = useStartFrom(
    form,
    correcting ? `period-${fromPeriod.id}-${termsAt.data?.termsFromPeriodId ?? ''}` : 'now',
    startValues,
  )
  // A new debt's category is one in force in its first period; an edited one's, from now on
  // or from the period corrected.
  const effective =
    (debt ? (correcting ? fromPeriod : null) : fromPeriod) ?? currentPeriod ?? periods[0] ?? null
  const choices = useCategoriesForDate(budgetId, effective?.start_date ?? '')
  const options = useMemo((): CategoryChoice[] => {
    const list: CategoryChoice[] = choices.data ?? []
    if (!debt || list.some((choice) => choice.category_id === debt.category_id)) return list
    return [
      ...list,
      {
        category_id: debt.category_id,
        parent_id: debt.parent_category_id,
        name: debt.category_name ?? '',
        parent_name: debt.parent_category_name,
        display_order: list.length,
        kept: true,
      },
    ]
  }, [choices.data, debt])
  // A payment recorded meanwhile gives it a history without a new revision: read it live.
  const principalLocked = (live ?? debt)?.has_history === true

  const onSubmit = form.handleSubmit((values) => {
    if (debt && !base) return
    const done = debt
      ? update.mutateAsync({
          debt: { ...debt, has_history: principalLocked },
          base: base ?? debt,
          name: values.name,
          categoryId: values.categoryId,
          principal: values.principal,
          rate: values.rate,
          monthlyPayment: values.monthlyPayment,
          fromPeriodId: values.correct ? values.fromPeriodId || null : null,
        })
      : create.mutateAsync({
          name: values.name,
          principal: values.principal,
          categoryId: values.categoryId,
          monthlyPayment: values.monthlyPayment,
          rate: values.rate,
          fromPeriodId: values.fromPeriodId || null,
        })
    return done.catch(() => undefined)
  })

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate data-testid="debt-form">
      <FieldGroup>
        {frozen && (
          <Alert data-testid="debt-frozen">
            <InfoIcon aria-hidden />
            <AlertDescription>{t('debts.endedNoEdit')}</AlertDescription>
          </Alert>
        )}
        <ConcurrentNotices
          adding={!debt}
          gone={edit.gone}
          pending={sync.pending}
          updated={sync.updated}
          recovered={sync.recovered}
          onUseTheirs={sync.useTheirs}
          onKeepMine={sync.keepMine}
          error={mutation.error}
          message={errorMessage}
          ended={endedNow}
          endedText={t('debts.endedElsewhere')}
        />
        <TextField
          control={form.control}
          name="name"
          label={t('debts.fields.name')}
          placeholder={t('debts.fields.namePlaceholder')}
          autoComplete="off"
          autoFocus
        />
        {/* The period first: the terms below then show what was in force in it. */}
        {debt && correctable.length > 0 && (
          <CorrectionToggle
            checked={correct}
            onCheckedChange={(next) => {
              form.setValue('correct', next)
              form.setValue('fromPeriodId', next ? (correctable[0]?.id ?? '') : '')
            }}
            label={t('income.correction.label')}
            warning={t('debts.correctionWarning')}
            required={mustCorrect ? t('corrections.budgetEnded') : undefined}
          >
            <SelectField
              control={form.control}
              name="fromPeriodId"
              more={olderPeriods}
              label={t('corrections.period')}
              options={correctable.map((period) => ({ value: period.id, label: label(period) }))}
            />
            <CorrectionReach
              periods={periods}
              periodId={fromPeriodId}
              terms={termsAt.data}
              pending={termsAt.isPending}
              error={termsAt.isError ? errorMessage(termsAt.error) : null}
              kept={start.kept}
              views={edit.describe(debt)}
            />
          </CorrectionToggle>
        )}
        <CategorySelectField
          control={form.control}
          name="categoryId"
          label={t('debts.fields.category')}
          options={options}
          loading={choices.isPending && effective !== null}
          description={debt ? t('debts.fields.categoryEditHelp') : t('debts.fields.categoryHelp')}
        />
        {principalLocked ? (
          <Alert data-testid="principal-locked">
            <InfoIcon aria-hidden />
            <AlertDescription>{t('debts.fields.principalLocked')}</AlertDescription>
          </Alert>
        ) : (
          <MoneyField
            control={form.control}
            name="principal"
            label={t('debts.fields.principal')}
            description={t('debts.fields.principalHelp')}
          />
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="rate"
            label={t('debts.fields.rateOptional')}
            placeholder="0.000"
            inputMode="decimal"
            autoComplete="off"
          />
          <MoneyField
            control={form.control}
            name="monthlyPayment"
            label={t('debts.fields.payment')}
          />
        </div>
        <p className="-mt-3 text-xs text-muted-foreground">{t('debts.fields.termsHelp')}</p>
        {!debt && earlier.length > 0 && (
          <SelectField
            control={form.control}
            name="fromPeriodId"
            more={olderPeriods}
            label={t('debts.fields.from')}
            description={t('debts.fields.fromHelp')}
            options={[
              ...(mustCorrect ? [] : [{ value: '', label: t('income.fields.fromCurrent') }]),
              ...earlier.map((period) => ({ value: period.id, label: label(period) })),
            ]}
          />
        )}
        <Alert>
          <InfoIcon aria-hidden />
          <AlertDescription>
            {debt
              ? correct
                ? t('debts.correctionAppliesFrom')
                : currentPeriod
                  ? t('debts.editAppliesFrom', {
                      date: formatCalendarDate(currentPeriod.start_date),
                    })
                  : t('income.editAppliesFromNoPeriod')
              : t('debts.addAppliesFrom')}
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
              frozen ||
              (!!debt && !base)
            }
          >
            {mutation.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  )
}
