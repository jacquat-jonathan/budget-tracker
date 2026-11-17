import { zodResolver } from '@hookform/resolvers/zod'
import { InfoIcon, TriangleAlertIcon } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { useForm, useWatch, type Control } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { useOlderPeriodsOption } from '@/features/budgets/older-periods'
import { MoneyField } from '@/components/form/money-field'
import { SelectField, type MoreOption, type SelectOption } from '@/components/form/select-field'
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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { useAuth } from '@/features/auth/auth-context'
import { TextField } from '@/features/auth/components/text-field'
import {
  memberName,
  type BudgetMember,
  type IncomeOverview,
  type PeriodSummary,
} from '@/features/budgets/budget-queries'
import { PayDayField, WeekendRuleField } from '@/features/income/components/income-term-fields'
import { PayDatePreviewNotice } from '@/features/income/components/pay-date-preview-notice'
import {
  previousOf,
  useArrivedUnderNewTerms,
  useExpectedPayDatePreview,
} from '@/features/income/pay-date-preview'
import { IncomeAccountField } from '@/features/income/components/income-account-field'
import { useAddIncome, useEditIncome } from '@/features/income/income-mutations'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'
import { CorrectionReach } from '@/features/budgets/correction-reach'
import { useStartFrom, useTermsAt } from '@/features/budgets/terms-at'
import type { ArrivedOffer } from '@/features/periods/boundary-ranges'
import { ConcurrentNotices } from '@/components/changed-elsewhere'
import { NothingToSave } from '@/components/nothing-to-save'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { useClientId } from '@/hooks/use-client-id'
import { useRecord } from '@/features/budgets/record-queries'
import { useRecordViews } from '@/features/budgets/record-views'
import { useConcurrentForm } from '@/hooks/use-concurrent-form'
import { isRecordChanged, useEditBase } from '@/hooks/use-edit-base'
import { formatCalendarDate } from '@/lib/date'
import { dbErrorCode } from '@/lib/db-errors'
import { nameSchema, payDaySchema, rappenSchema, weekendRuleSchema } from '@/lib/form-schemas'
import { previewHolds } from '@/lib/preview'

const incomeSchema = z.object({
  name: nameSchema,
  amount: rappenSchema(),
  payDay: payDaySchema,
  weekendRule: weekendRuleSchema,
  userId: z.string(),
  /** The account it is paid into; "" for none (R-ACCOUNT-236). */
  accountId: z.string(),
  /** "" for the current period. */
  fromPeriodId: z.string(),
  /** Edit only: apply the terms from an earlier period, an explicit correction. */
  correct: z.boolean(),
})
type IncomeInput = z.input<typeof incomeSchema>
type IncomeValues = z.output<typeof incomeSchema>

interface IncomeFormDialogProps {
  budgetId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The income to edit; a new income when absent. */
  income?: IncomeOverview
  members: BudgetMember[]
  periods: PeriodSummary[]
  currentPeriod: PeriodSummary | null
  /** After saving new primary terms under which this month's salary is already due. */
  onSalaryMayHaveArrived?: (offer: ArrivedOffer) => void
}

/** Add or edit an income. Mount it only while open, so it starts from fresh values. */
export function IncomeFormDialog(props: IncomeFormDialogProps) {
  const { t } = useTranslation()
  const { open, onOpenChange, income } = props

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-8">
            {income ? t('income.editTitle') : t('income.addTitle')}
          </DialogTitle>
          <DialogDescription>
            {income ? t('income.editDescription') : t('income.addDescription')}
          </DialogDescription>
        </DialogHeader>
        {open && <IncomeForm {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function IncomeForm({
  budgetId,
  onOpenChange,
  income: opened,
  members,
  periods,
  currentPeriod,
  onSalaryMayHaveArrived,
}: IncomeFormDialogProps) {
  const { t } = useTranslation()
  const olderPeriods = useOlderPeriodsOption(budgetId)
  const { user } = useAuth()
  const { budget } = useCurrentBudget()
  // R-CONCURRENCY-150: a refused save over a change this form does not show says so (the shown fields that
  // changed have their own notice), in the save's own words.
  const errorMessage = useErrorMessage({ record_changed: 'corrections.changedNotShown' })
  const close = () => onOpenChange(false)
  const views = useRecordViews()
  // R-CONCURRENCY-091: saved over the version opened; the record is read by its id.
  const live = useRecord('income_overview', budgetId, opened?.id)
  const editBase = useEditBase(opened, live, views.income)
  const income = editBase.base

  const valuesOf = (from: IncomeOverview | undefined): IncomeInput => ({
    name: from?.name ?? '',
    amount: from?.amount ?? null,
    payDay: from?.pay_day ?? 25,
    weekendRule: from?.weekend_rule ?? 'nearest',
    // R-INCOME-002: any member's income; mine by default.
    userId: from?.user_id ?? user?.id ?? '',
    accountId: from?.account_id ?? '',
    fromPeriodId: '',
    correct: false,
  })
  const form = useForm<IncomeInput, unknown, IncomeValues>({
    resolver: zodResolver(incomeSchema),
    defaultValues: valuesOf(income),
  })
  const [correct, payDay, weekendRule, fromPeriodId] = useWatch({
    control: form.control,
    name: ['correct', 'payDay', 'weekendRule', 'fromPeriodId'],
  })
  // Before saving new terms for the primary income: what the database would then expect.
  // R-INCOME-150: previewed whenever the edit may move the current period's end (new pay day
  // or weekend rule, any correction, or the database asked for it: preview_required), and the
  // end it shows is always sent with the save.
  const [previewAsked, setPreviewAsked] = useState(false)
  const primaryTermsChanged =
    income?.is_primary === true &&
    currentPeriod !== null &&
    (previewAsked || correct || payDay !== income.pay_day || weekendRule !== income.weekend_rule)
  const preview = useExpectedPayDatePreview(
    budgetId,
    {
      kind: 'terms',
      incomeId: income?.id ?? '',
      payDay,
      weekendRule,
      fromPeriodId: correct ? fromPeriodId || null : null,
    },
    primaryTermsChanged,
  )
  const arrivedOffer = useArrivedUnderNewTerms({
    currentPeriod,
    previousPeriod: previousOf(periods, currentPeriod),
    endDateEntered: budget.end_date_entered,
    endAfterSave: preview.data?.end_date,
    payDay,
    weekendRule,
    enabled: primaryTermsChanged,
  })
  // Periods are identified by their dates.
  const periodLabel = (period: PeriodSummary) =>
    t('income.fields.fromPeriod', {
      start: formatCalendarDate(period.start_date),
      end: formatCalendarDate(period.end_date),
    })
  // Earlier periods this income already counted in: the ones a correction can start from.
  const correctable = income
    ? periods.filter((period) => !period.is_current && period.seq >= income.first_seq)
    : []
  // A correction starts from the terms in force in the period chosen (database's rows).
  const fromPeriod = periods.find((period) => period.id === fromPeriodId) ?? null
  const correcting = income !== undefined && correct && fromPeriod !== null
  const termsAt = useTermsAt('income', budgetId, income?.id, correcting ? fromPeriod.id : null)
  const periodTerms = correcting ? (termsAt.data?.terms ?? null) : null
  // Not in force in that period: nothing to correct there, nothing to save.
  const notInForce = correcting && termsAt.data?.inForce === false
  const base = income ? (correcting ? periodTerms : income) : null
  // The terms the form starts from: now, or the chosen period's (read from the database).
  const startValues =
    base && income
      ? {
          amount: base.amount,
          payDay: base.pay_day,
          weekendRule: base.weekend_rule,
          accountId: base.account_id ?? '',
        }
      : null
  const start = useStartFrom(
    form,
    correcting ? `period-${fromPeriod.id}-${termsAt.data?.termsFromPeriodId ?? ''}` : 'now',
    startValues,
  )

  const add = useAddIncome(budgetId, { onDone: close })
  const request = useClientId()
  const edit = useEditIncome(budgetId, income, {
    onDone: () => {
      close()
      // R-PERIOD-037: the salary under the corrected terms may already have arrived.
      if (arrivedOffer) onSalaryMayHaveArrived?.(arrivedOffer)
    },
  })
  const mutation = income ? edit : add
  const sync = useConcurrentForm(form, editBase, valuesOf, () => edit.reset(), {
    error: edit.error,
    // Whose income it is is chosen when it is added, not edited here.
    controls: ['correct', 'fromPeriodId', 'userId'],
    current: () => (correcting ? startValues : null),
  })

  const onSubmit = form.handleSubmit((values) => {
    const terms = {
      name: values.name,
      amount: values.amount,
      payDay: values.payDay,
      weekendRule: values.weekendRule,
      accountId: values.accountId || null,
    }
    if (correcting && (!periodTerms || notInForce)) return
    const done = income
      ? edit.mutateAsync({
          ...terms,
          base: base ?? income,
          revision: income.revision,
          // R-INCOME-055: refused if the period would now end on another day than shown.
          previewedEndDate: primaryTermsChanged ? (preview.data?.end_date ?? null) : null,
          fromPeriodId: values.correct ? values.fromPeriodId || null : null,
        })
      : add
          .mutateAsync({
            ...terms,
            userId: values.userId === user?.id ? null : values.userId,
            fromPeriodId: values.fromPeriodId || null,
            clientId: request.id,
          })
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
    return done.catch((error: unknown) => {
      // The edit moves the period's end after all: preview it, show it, and ask again.
      if (dbErrorCode(error) === 'preview_required') setPreviewAsked(true)
    })
  })

  const memberOptions = members.map((member) => ({
    value: member.user_id,
    label:
      member.user_id === user?.id
        ? t('members.you', { name: memberName(member) ?? t('members.unknownName') })
        : (memberName(member) ?? t('members.unknownName')),
  }))
  // Back-dating: the current period, or an earlier one (newest first).
  const periodOptions = [
    { value: '', label: t('income.fields.fromCurrent') },
    ...periods
      .filter((period) => !period.is_current)
      .map((period) => ({ value: period.id, label: periodLabel(period) })),
  ]

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate>
      <FieldGroup>
        <ConcurrentNotices
          adding={!income}
          gone={editBase.gone}
          pending={sync.pending}
          updated={sync.updated}
          recovered={sync.recovered}
          onUseTheirs={sync.useTheirs}
          onKeepMine={sync.keepMine}
          error={mutation.error}
          // A refusal for the period's end having moved meanwhile (an expected pay date set by
          // hand) names that cause rather than "something not shown".
          message={(error) =>
            primaryTermsChanged && isRecordChanged(error)
              ? t('income.endMovedMeanwhile')
              : errorMessage(error)
          }
        />
        <TextField
          control={form.control}
          name="name"
          label={t('income.fields.name')}
          placeholder={t('income.fields.namePlaceholder')}
          autoComplete="off"
          autoFocus
        />
        {!income && (
          <SelectField
            control={form.control}
            name="userId"
            label={t('income.fields.owner')}
            description={t('income.fields.ownerHelp')}
            options={memberOptions}
          />
        )}
        {income && correctable.length > 0 && (
          <CorrectionFields
            control={form.control}
            correct={correct}
            more={olderPeriods}
            reach={
              <CorrectionReach
                periods={periods}
                periodId={fromPeriodId}
                terms={termsAt.data}
                pending={termsAt.isPending}
                error={termsAt.isError ? errorMessage(termsAt.error) : null}
                kept={start.kept}
                views={editBase.describe(income)}
              />
            }
            options={correctable.map((period) => ({
              value: period.id,
              label: periodLabel(period),
            }))}
            onToggle={(next) => {
              form.setValue('correct', next)
              form.setValue('fromPeriodId', next ? (correctable[0]?.id ?? '') : '')
            }}
          />
        )}
        <MoneyField control={form.control} name="amount" label={t('income.fields.amount')} />
        <PayDayField control={form.control} name="payDay" />
        <WeekendRuleField control={form.control} name="weekendRule" />
        <IncomeAccountField
          control={form.control}
          budgetId={budgetId}
          period={
            income
              ? correcting
                ? fromPeriod
                : currentPeriod
              : (periods.find((period) => period.id === fromPeriodId) ?? currentPeriod)
          }
          keep={income?.account_id ?? null}
          keepName={income?.account_name ?? null}
        />
        {!income && periodOptions.length > 1 && (
          <SelectField
            control={form.control}
            name="fromPeriodId"
            more={olderPeriods}
            label={t('income.fields.from')}
            description={t('income.fields.fromHelp')}
            options={periodOptions}
          />
        )}
        {primaryTermsChanged && (
          <PayDatePreviewNotice
            preview={preview}
            offer={arrivedOffer}
            endDateEntered={budget.end_date_entered}
          />
        )}
        <Alert>
          <InfoIcon aria-hidden />
          <AlertDescription>
            {correct
              ? t('income.correctionAppliesFrom')
              : income
                ? currentPeriod
                  ? t('income.editAppliesFrom', {
                      date: formatCalendarDate(currentPeriod.start_date),
                    })
                  : t('income.editAppliesFromNoPeriod')
                : t('income.addAppliesFrom')}
            {income?.is_primary && <p className="mt-1">{t('income.editPrimaryNote')}</p>}
          </AlertDescription>
        </Alert>
        <NothingToSave show={edit.data === false && !edit.isPending} />
        <DialogFooter className="sticky -bottom-4 z-10 bg-popover">
          <Button type="button" variant="outline" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            disabled={
              mutation.isPending ||
              sync.pending !== null ||
              editBase.gone ||
              notInForce ||
              (primaryTermsChanged && previewHolds(preview))
            }
          >
            {mutation.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  )
}

// R-INCOME-051: corrections of the past are explicit, off by default, with a warning.
/** "Correct an earlier period": off by default, with a warning that past totals change. */
function CorrectionFields({
  control,
  correct,
  options,
  onToggle,
  reach,
  more,
}: {
  control: Control<IncomeInput, unknown, IncomeValues>
  reach: ReactNode
  more: MoreOption | undefined
  correct: boolean
  options: SelectOption[]
  onToggle: (next: boolean) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <Field orientation="horizontal">
        <Checkbox
          id={id}
          checked={correct}
          onCheckedChange={(checked) => onToggle(checked === true)}
        />
        <FieldContent>
          <FieldLabel htmlFor={id}>{t('income.correction.label')}</FieldLabel>
          <FieldDescription>{t('income.correction.help')}</FieldDescription>
        </FieldContent>
      </Field>
      {correct && (
        <>
          <SelectField
            control={control}
            name="fromPeriodId"
            more={more}
            label={t('corrections.period')}
            options={options}
          />
          {reach}
          <Alert variant="destructive">
            <TriangleAlertIcon aria-hidden />
            <AlertDescription>{t('income.correction.warning')}</AlertDescription>
          </Alert>
        </>
      )}
    </div>
  )
}
