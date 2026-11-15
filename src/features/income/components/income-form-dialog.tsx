import { zodResolver } from '@hookform/resolvers/zod'
import { InfoIcon, TriangleAlertIcon } from 'lucide-react'
import { useId } from 'react'
import { useForm, useWatch, type Control } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { MoneyField } from '@/components/form/money-field'
import { SelectField, type SelectOption } from '@/components/form/select-field'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
  usePayDate,
  type BudgetMember,
  type IncomeOverview,
  type PeriodSummary,
  type WeekendRule,
} from '@/features/budgets/budget-queries'
import { monthLabel } from '@/features/budgets/start-months'
import { PayDayField, WeekendRuleField } from '@/features/income/components/income-term-fields'
import { useAddIncome, useEditIncome } from '@/features/income/income-mutations'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { addMonths, formatCalendarDate } from '@/lib/date'
import { currentLanguage } from '@/lib/i18n'
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
}

/** Add or edit an income. Mount it only while open, so it starts from fresh values. */
export function IncomeFormDialog(props: IncomeFormDialogProps) {
  const { t } = useTranslation()
  const { open, onOpenChange, income } = props

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{income ? t('income.editTitle') : t('income.addTitle')}</DialogTitle>
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
      // A new income is mine unless I pick another member (D-045).
      userId: income?.user_id ?? user?.id ?? '',
      fromPeriodId: '',
      correct: false,
    },
  })
  const [payDay, weekendRule, correct] = useWatch({
    control: form.control,
    name: ['payDay', 'weekendRule', 'correct'],
  })
  const language = currentLanguage()
  const periodLabel = (period: PeriodSummary) =>
    t('income.fields.fromPeriod', {
      month: monthLabel(period.month, language),
      start: formatCalendarDate(period.start_date),
      end: formatCalendarDate(period.end_date),
    })
  // Earlier periods this income already counted in: the ones a correction can start from.
  const correctable = income
    ? periods.filter((period) => !period.is_current && period.seq >= income.first_seq)
    : []
  const closesNow = useClosesCurrentPeriod({
    enabled: income?.is_primary === true,
    changed:
      income !== undefined && (payDay !== income.pay_day || weekendRule !== income.weekend_rule),
    currentPeriod,
    payDay,
    weekendRule,
  })

  const add = useAddIncome(budgetId, { onDone: close })
  const edit = useEditIncome(budgetId, income, { onDone: close })
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
        {closesNow && (
          <Alert variant="destructive" data-testid="closes-current-period">
            <TriangleAlertIcon aria-hidden />
            <AlertTitle>{t('income.closesNowTitle')}</AlertTitle>
            <AlertDescription>
              {t('income.closesNow', {
                month: monthLabel(closesNow.month, language),
                date: formatCalendarDate(closesNow.payDate),
              })}
            </AlertDescription>
          </Alert>
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

/**
 * For the primary income: would these terms close the current period at once? That is the
 * case when the next month's pay date under the new terms is already today or past. The pay
 * date comes from the database (pay_date) and so does today; nothing is computed here.
 */
function useClosesCurrentPeriod({
  enabled,
  changed,
  currentPeriod,
  payDay,
  weekendRule,
}: {
  enabled: boolean
  changed: boolean
  currentPeriod: PeriodSummary | null
  payDay: number
  weekendRule: WeekendRule
}): { month: string; payDate: string } | null {
  const nextMonth = currentPeriod ? addMonths(currentPeriod.month, 1) : null
  const payDate = usePayDate(nextMonth, payDay, weekendRule, enabled && changed)
  const today = currentPeriod?.today
  if (!enabled || !changed || !nextMonth || !payDate.data || !today) return null
  return payDate.data <= today ? { month: nextMonth, payDate: payDate.data } : null
}
