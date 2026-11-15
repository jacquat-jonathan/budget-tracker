import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { CalendarDateField } from '@/components/form/calendar-date-field'
import { MoneyField } from '@/components/form/money-field'
import { SelectField } from '@/components/form/select-field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from '@/components/ui/field'
import { TextField } from '@/features/auth/components/text-field'
import { useCreateBudget, type CreateBudgetResult } from '@/features/budgets/budget-mutations'
import { monthLabel, useStartMonthOptions } from '@/features/budgets/start-months'
import { PayDayField, WeekendRuleField } from '@/features/income/components/income-term-fields'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { formatCalendarDate } from '@/lib/date'
import {
  nameSchema,
  optionalCalendarDateSchema,
  payDaySchema,
  rappenSchema,
  weekendRuleSchema,
} from '@/lib/form-schemas'
import { currentLanguage } from '@/lib/i18n'

const createBudgetSchema = z.object({
  name: nameSchema,
  endDate: optionalCalendarDateSchema,
  incomeName: nameSchema,
  amount: rappenSchema(),
  payDay: payDaySchema,
  weekendRule: weekendRuleSchema,
  /** "" for the current period, else a month offered by the database. */
  startMonth: z.string(),
})
type CreateBudgetInput = z.input<typeof createBudgetSchema>
type CreateBudgetValues = z.output<typeof createBudgetSchema>

export function CreateBudgetForm({
  onCreated,
  submitLabel,
}: {
  onCreated: (budgetId: string) => void
  submitLabel?: string
}) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()

  const form = useForm<CreateBudgetInput, unknown, CreateBudgetValues>({
    resolver: zodResolver(createBudgetSchema),
    defaultValues: {
      name: '',
      endDate: '',
      incomeName: '',
      amount: null,
      payDay: 25,
      weekendRule: 'nearest',
      startMonth: '',
    },
  })
  const startMonths = useStartMonthOptions()

  const create = useCreateBudget({
    onCreated: (result: CreateBudgetResult) => {
      if (result.endDateError) {
        toast.error(
          t('budgets.create.endDateFailed', { reason: errorMessage(result.endDateError) }),
        )
      }
      onCreated(result.budgetId)
    },
  })

  const onSubmit = form.handleSubmit((values) =>
    create
      .mutateAsync({
        name: values.name,
        endDate: values.endDate,
        incomeName: values.incomeName,
        amount: values.amount,
        payDay: values.payDay,
        weekendRule: values.weekendRule,
        startMonth: values.startMonth || null,
      })
      .catch(() => undefined),
  )

  const language = currentLanguage()
  const startOptions = [
    { value: '', label: t('budgets.create.startCurrent') },
    ...(startMonths ?? []).map((option) => ({
      value: option.month,
      label: t('budgets.create.startMonthOption', {
        month: monthLabel(option.month, language),
        date: formatCalendarDate(option.startDate),
      }),
    })),
  ]

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
          {startMonths ? (
            <SelectField
              control={form.control}
              name="startMonth"
              label={t('budgets.fields.startMonth')}
              description={t('budgets.create.earlierHelp')}
              options={startOptions}
            />
          ) : (
            <FieldDescription>{t('budgets.create.startCurrentOnly')}</FieldDescription>
          )}
        </FieldSet>
        <Button type="submit" className="w-full sm:w-auto" disabled={create.isPending}>
          {create.isPending ? t('common.saving') : (submitLabel ?? t('budgets.create.submit'))}
        </Button>
      </FieldGroup>
    </form>
  )
}
