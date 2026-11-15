import { useId } from 'react'
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { SelectField } from '@/components/form/select-field'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { WEEKEND_RULES, type WeekendRule } from '@/features/budgets/budget-queries'

const PAY_DAYS = Array.from({ length: 31 }, (_, index) => String(index + 1))

/** Nominal pay day of the month, 1 to 31. */
export function PayDayField<TValues extends FieldValues, TOut extends FieldValues = TValues>({
  control,
  name,
}: {
  control: Control<TValues, unknown, TOut>
  name: FieldPath<TValues>
}) {
  const { t } = useTranslation()
  return (
    <SelectField
      control={control}
      name={name}
      numeric
      label={t('income.fields.payDay')}
      description={t('income.fields.payDayHelp')}
      options={PAY_DAYS.map((day) => ({ value: day, label: t('income.payDayOption', { day }) }))}
    />
  )
}

/** The weekend rule, each choice explained in plain words. */
export function WeekendRuleField<TValues extends FieldValues, TOut extends FieldValues = TValues>({
  control,
  name,
}: {
  control: Control<TValues, unknown, TOut>
  name: FieldPath<TValues>
}) {
  const { t } = useTranslation()
  const id = useId()
  const { field } = useController({ control, name })
  const value: unknown = field.value

  return (
    <FieldSet>
      <FieldLegend variant="label">{t('income.fields.weekendRule')}</FieldLegend>
      <FieldDescription>{t('income.fields.weekendRuleHelp')}</FieldDescription>
      <RadioGroup
        name={field.name}
        value={typeof value === 'string' ? value : 'nearest'}
        onValueChange={(next) => field.onChange(next as WeekendRule)}
        className="gap-2"
      >
        {WEEKEND_RULES.map((rule) => (
          <FieldLabel key={rule} htmlFor={`${id}-${rule}`} className="font-normal">
            <Field orientation="horizontal">
              <RadioGroupItem value={rule} id={`${id}-${rule}`} />
              <FieldContent>
                <span className="font-medium">{t(`income.weekendRule.${rule}.label`)}</span>
                <FieldDescription>{t(`income.weekendRule.${rule}.description`)}</FieldDescription>
              </FieldContent>
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
    </FieldSet>
  )
}
