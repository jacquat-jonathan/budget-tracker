import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
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
import { useCreateBudget } from '@/features/budgets/budget-mutations'
import { monthLabel, useStartMonths } from '@/features/budgets/start-months'
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
import { isSameName } from '@/lib/same-name'
import { useBudgets } from '@/features/budgets/current-budget-context'

const createBudgetSchema = z.object({
  name: nameSchema,
  endDate: optionalCalendarDateSchema,
  incomeName: nameSchema,
  amount: rappenSchema(),
  payDay: payDaySchema,
  weekendRule: weekendRuleSchema,
  /** "" for the default (the current period's month), else a month from get_start_months. */
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
  const { budgets } = useBudgets()
  const typedName = useWatch({ control: form.control, name: 'name' })
  const nameTaken = budgets.some((other) => isSameName(other.name, typedName))
  const [payDay, weekendRule, startMonth] = useWatch({
    control: form.control,
    name: ['payDay', 'weekendRule', 'startMonth'],
  })
  // The months depend on the pay day and weekend rule: the database works them out.
  const startMonths = useStartMonths(payDay, weekendRule)

  const create = useCreateBudget({ onCreated })

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
  const months = startMonths.data ?? []
  const optionLabel = (option: (typeof months)[number]) =>
    t(option.is_default ? 'budgets.create.startMonthCurrent' : 'budgets.create.startMonthOption', {
      month: monthLabel(option.month, language),
    })
  // The default month is sent as null ("the current period"), the others as their month.
  const startOptions = months.map((option) => ({
    value: option.is_default ? '' : option.month,
    label: optionLabel(option),
  }))
  const chosen = months.find((option) =>
    startMonth ? option.month === startMonth : option.is_default,
  )

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
            warning={nameTaken ? t('budgets.nameTaken', { name: typedName.trim() }) : null}
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
          {startMonths.isError ? (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(startMonths.error)}</AlertDescription>
            </Alert>
          ) : (
            <SelectField
              control={form.control}
              name="startMonth"
              label={t('budgets.fields.startMonth')}
              description={t('budgets.create.earlierHelp')}
              options={startOptions}
              disabled={months.length === 0}
            />
          )}
          {chosen && (
            <p className="text-sm" data-testid="first-period-start">
              {t('budgets.create.firstPeriodStarts', {
                date: formatCalendarDate(chosen.start_date),
              })}
            </p>
          )}
        </FieldSet>
        <Button type="submit" className="w-full sm:w-auto" disabled={create.isPending}>
          {create.isPending ? t('common.saving') : (submitLabel ?? t('budgets.create.submit'))}
        </Button>
      </FieldGroup>
    </form>
  )
}
