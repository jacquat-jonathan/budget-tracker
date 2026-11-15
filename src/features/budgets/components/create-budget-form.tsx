import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo } from 'react'
import { useController, useForm, useWatch, type Control } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { CalendarDateField } from '@/components/form/calendar-date-field'
import { MoneyField } from '@/components/form/money-field'
import { SelectField } from '@/components/form/select-field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from '@/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { TextField } from '@/features/auth/components/text-field'
import { useCreateBudget, type CreateBudgetResult } from '@/features/budgets/budget-mutations'
import { PayDayField, WeekendRuleField } from '@/features/income/components/income-term-fields'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { toCalendarDate } from '@/lib/date'
import {
  nameSchema,
  optionalCalendarDateSchema,
  payDaySchema,
  rappenSchema,
  weekendRuleSchema,
} from '@/lib/form-schemas'
import { currentLanguage } from '@/lib/i18n'

/** How far back the month picker goes; the database enforces the real limit (60 months). */
const YEARS_BACK = 5

const createBudgetSchema = z.object({
  name: nameSchema,
  endDate: optionalCalendarDateSchema,
  incomeName: nameSchema,
  amount: rappenSchema(),
  payDay: payDaySchema,
  weekendRule: weekendRuleSchema,
  start: z.enum(['current', 'earlier']),
  startYear: z.number().int(),
  startMonth: z.number().int().min(1).max(12),
})
type CreateBudgetInput = z.input<typeof createBudgetSchema>
type CreateBudgetValues = z.output<typeof createBudgetSchema>

/**
 * The browser's month, used only to offer a sensible range of months in the picker. Which
 * month is "current" and how far back one may go are decided by the database
 * (R-PERIOD-017); "current period" itself is sent as null.
 */
function browserMonth(): { year: number; month: number } {
  const [year, month] = toCalendarDate(new Date()).split('-').map(Number)
  return { year: year ?? 2026, month: month ?? 1 }
}

function monthName(month: number, language: string): string {
  // A fixed UTC instant, formatted in UTC: no time zone can move it to another month.
  return new Intl.DateTimeFormat(language, { month: 'long', timeZone: 'UTC' }).format(
    Date.UTC(2000, month - 1, 1),
  )
}

const pad = (value: number) => String(value).padStart(2, '0')

export function CreateBudgetForm({
  onCreated,
  submitLabel,
}: {
  onCreated: (budgetId: string) => void
  submitLabel?: string
}) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const now = useMemo(browserMonth, [])
  const previous =
    now.month === 1 ? { year: now.year - 1, month: 12 } : { year: now.year, month: now.month - 1 }

  const form = useForm<CreateBudgetInput, unknown, CreateBudgetValues>({
    resolver: zodResolver(createBudgetSchema),
    defaultValues: {
      name: '',
      endDate: '',
      incomeName: '',
      amount: null,
      payDay: 25,
      weekendRule: 'nearest',
      start: 'current',
      startYear: previous.year,
      startMonth: previous.month,
    },
  })
  const start = useWatch({ control: form.control, name: 'start' })

  const create = useCreateBudget({
    onCreated: (result: CreateBudgetResult) => {
      if (result.endDateError) {
        toast.error(t('budgets.create.endDateFailed', { reason: errorMessage(result.endDateError) }))
      }
      onCreated(result.budgetId)
    },
  })

  const onSubmit = form.handleSubmit((values) =>
    create.mutateAsync({
      name: values.name,
      endDate: values.endDate,
      incomeName: values.incomeName,
      amount: values.amount,
      payDay: values.payDay,
      weekendRule: values.weekendRule,
      startMonth:
        values.start === 'earlier' ? `${values.startYear}-${pad(values.startMonth)}-01` : null,
    }).catch(() => undefined),
  )

  const language = currentLanguage()
  const years = Array.from({ length: YEARS_BACK + 1 }, (_, index) => String(now.year - index))
  const months = Array.from({ length: 12 }, (_, index) => ({
    value: String(index + 1),
    label: monthName(index + 1, language),
  }))

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate>
      <FieldGroup>
        {create.isError && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(create.error)}</AlertDescription>
          </Alert>
        )}
        <FieldSet>
          <FieldLegend>{t('budgets.create.budgetSection')}</FieldLegend>
          <TextField
            control={form.control}
            name="name"
            label={t('budgets.fields.name')}
            placeholder={t('budgets.fields.namePlaceholder')}
            autoComplete="off"
          />
          <CalendarDateField
            control={form.control}
            name="endDate"
            label={t('budgets.fields.endDateOptional')}
            description={t('budgets.fields.endDateHelp')}
          />
        </FieldSet>
        <FieldSeparator />
        <FieldSet>
          <FieldLegend>{t('budgets.create.incomeSection')}</FieldLegend>
          <FieldDescription>{t('budgets.create.incomeHelp')}</FieldDescription>
          <TextField
            control={form.control}
            name="incomeName"
            label={t('income.fields.name')}
            placeholder={t('income.fields.namePlaceholder')}
            autoComplete="off"
          />
          <MoneyField control={form.control} name="amount" label={t('income.fields.amount')} />
          <PayDayField control={form.control} name="payDay" />
          <WeekendRuleField control={form.control} name="weekendRule" />
        </FieldSet>
        <FieldSeparator />
        <FieldSet>
          <FieldLegend>{t('budgets.create.startSection')}</FieldLegend>
          <StartChoice control={form.control} />
          {start === 'earlier' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField
                control={form.control}
                name="startMonth"
                numeric
                label={t('budgets.fields.month')}
                options={months}
              />
              <SelectField
                control={form.control}
                name="startYear"
                numeric
                label={t('budgets.fields.year')}
                options={years.map((year) => ({ value: year, label: year }))}
              />
            </div>
          )}
          {start === 'earlier' && (
            <FieldDescription>{t('budgets.create.earlierHelp')}</FieldDescription>
          )}
        </FieldSet>
        <Button type="submit" className="w-full sm:w-auto" disabled={create.isPending}>
          {create.isPending ? t('common.saving') : (submitLabel ?? t('budgets.create.submit'))}
        </Button>
      </FieldGroup>
    </form>
  )
}

function StartChoice({
  control,
}: {
  control: Control<CreateBudgetInput, unknown, CreateBudgetValues>
}) {
  const { t } = useTranslation()
  const { field } = useController({ control, name: 'start' })
  return (
    <RadioGroup
      aria-label={t('budgets.create.startSection')}
      name={field.name}
      value={field.value}
      onValueChange={(next) => field.onChange(next)}
      className="gap-2"
    >
      {(['current', 'earlier'] as const).map((choice) => (
        <FieldLabel key={choice} htmlFor={`start-${choice}`} className="font-normal">
          <Field orientation="horizontal">
            <RadioGroupItem value={choice} id={`start-${choice}`} />
            <FieldContent>
              <span className="font-medium">
                {choice === 'current'
                  ? t('budgets.create.startCurrent')
                  : t('budgets.create.startEarlier')}
              </span>
              <FieldDescription>
                {choice === 'current'
                  ? t('budgets.create.startCurrentHelp')
                  : t('budgets.create.startEarlierHelp')}
              </FieldDescription>
            </FieldContent>
          </Field>
        </FieldLabel>
      ))}
    </RadioGroup>
  )
}
