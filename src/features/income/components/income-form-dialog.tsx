import { zodResolver } from '@hookform/resolvers/zod'
import { InfoIcon, TriangleAlertIcon } from 'lucide-react'
import { useId } from 'react'
import { useForm, useWatch, type Control } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { MoneyField } from '@/components/form/money-field'
import { SelectField, type SelectOption } from '@/components/form/select-field'
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
  useArrivedUnderNewTerms,
  useExpectedPayDatePreview,
} from '@/features/income/pay-date-preview'
import { useAddIncome, useEditIncome } from '@/features/income/income-mutations'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { formatCalendarDate } from '@/lib/date'
import { nameSchema, payDaySchema, rappenSchema, weekendRuleSchema } from '@/lib/form-schemas'

const incomeSchema = z.object({
  name: nameSchema,
  amount: rappenSchema(),
  payDay: payDaySchema,
  weekendRule: weekendRuleSchema,
  userId: z.string(),
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
  onSalaryMayHaveArrived?: (dueDate: string) => void
}

/** Add or edit an income. Mount it only while open, so it starts from fresh values. */
export function IncomeFormDialog(props: IncomeFormDialogProps) {
  const { t } = useTranslation()
  const { open, onOpenChange, income } = props

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-8">{income ? t('income.editTitle') : t('income.addTitle')}</DialogTitle>
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
  income,
  members,
  periods,
  currentPeriod,
  onSalaryMayHaveArrived,
}: IncomeFormDialogProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const errorMessage = useErrorMessage()
  const close = () => onOpenChange(false)

  const form = useForm<IncomeInput, unknown, IncomeValues>({
    resolver: zodResolver(incomeSchema),
    defaultValues: {
      name: income?.name ?? '',
      amount: income?.amount ?? null,
      payDay: income?.pay_day ?? 25,
      weekendRule: income?.weekend_rule ?? 'nearest',
      // R-INCOME-002: any member's income; mine by default.
      userId: income?.user_id ?? user?.id ?? '',
      fromPeriodId: '',
      correct: false,
    },
  })
  const [correct, payDay, weekendRule] = useWatch({
    control: form.control,
    name: ['correct', 'payDay', 'weekendRule'],
  })
  // Before saving new terms for the primary income: what the database would then expect.
  const primaryTermsChanged =
    income?.is_primary === true &&
    currentPeriod !== null &&
    (payDay !== income.pay_day || weekendRule !== income.weekend_rule)
  const preview = useExpectedPayDatePreview(
    budgetId,
    { kind: 'terms', payDay, weekendRule },
    primaryTermsChanged,
  )
  const arrivedDue = useArrivedUnderNewTerms({
    currentPeriod,
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

  const add = useAddIncome(budgetId, { onDone: close })
  const edit = useEditIncome(budgetId, income, {
    onDone: () => {
      close()
      // R-PERIOD-037: the salary under the corrected terms may already have arrived.
      if (arrivedDue) onSalaryMayHaveArrived?.(arrivedDue)
    },
  })
  const mutation = income ? edit : add

  const onSubmit = form.handleSubmit((values) => {
    const terms = {
      name: values.name,
      amount: values.amount,
      payDay: values.payDay,
      weekendRule: values.weekendRule,
    }
    const done = income
      ? edit.mutateAsync({
          ...terms,
          fromPeriodId: values.correct ? values.fromPeriodId || null : null,
        })
      : add.mutateAsync({
          ...terms,
          userId: values.userId === user?.id ? null : values.userId,
          fromPeriodId: values.fromPeriodId || null,
        })
    return done.catch(() => undefined)
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
        {mutation.isError && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(mutation.error)}</AlertDescription>
          </Alert>
        )}
        <TextField
          control={form.control}
          name="name"
          label={t('income.fields.name')}
          placeholder={t('income.fields.namePlaceholder')}
          autoComplete="off"
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
        <MoneyField control={form.control} name="amount" label={t('income.fields.amount')} />
        <PayDayField control={form.control} name="payDay" />
        <WeekendRuleField control={form.control} name="weekendRule" />
        {!income && periodOptions.length > 1 && (
          <SelectField
            control={form.control}
            name="fromPeriodId"
            label={t('income.fields.from')}
            description={t('income.fields.fromHelp')}
            options={periodOptions}
          />
        )}
        {income && correctable.length > 0 && (
          <CorrectionFields
            control={form.control}
            correct={correct}
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
        {primaryTermsChanged && <PayDatePreviewNotice preview={preview} arrivedDue={arrivedDue} />}
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
        <DialogFooter className="sticky -bottom-4 z-10 bg-popover">
          <Button type="button" variant="outline" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
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
}: {
  control: Control<IncomeInput, unknown, IncomeValues>
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
            label={t('income.correction.from')}
            options={options}
          />
          <Alert variant="destructive">
            <TriangleAlertIcon aria-hidden />
            <AlertDescription>{t('income.correction.warning')}</AlertDescription>
          </Alert>
        </>
      )}
    </div>
  )
}
