import type { ParseKeys } from 'i18next'
import { useId } from 'react'
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CategoryForDate } from '@/features/categories/category-queries'

/** The leaves of list_categories_for_date, grouped under their category when they have one. */
function groups(options: readonly CategoryForDate[]) {
  const result: { parent: string | null; items: CategoryForDate[] }[] = []
  for (const option of options) {
    const parent = option.parent_id ? option.parent_name : null
    const last = result.at(-1)
    if (last && last.parent === parent && parent !== null) last.items.push(option)
    else result.push({ parent, items: [option] })
  }
  return result
}

/**
 * The category of a transaction: only the leaves the database allows for its date
 * (R-TRANSACTION-091), subcategories under their category's name.
 */
export function CategorySelectField<
  TValues extends FieldValues,
  TOut extends FieldValues = TValues,
>({
  control,
  name,
  label,
  options,
  loading,
  description,
}: {
  control: Control<TValues, unknown, TOut>
  name: FieldPath<TValues>
  label: string
  options: readonly CategoryForDate[]
  loading: boolean
  description?: string
}) {
  const { t } = useTranslation()
  const id = useId()
  const {
    field: { ref: inputRef, name: fieldName, onChange, onBlur, value: fieldValue },
    fieldState,
  } = useController({ control, name })
  const value: unknown = fieldValue
  const message = fieldState.error?.message
  return (
    <Field data-invalid={fieldState.invalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        name={fieldName}
        value={typeof value === 'string' ? value : ''}
        onValueChange={(next) => onChange(next)}
        disabled={loading || options.length === 0}
      >
        <SelectTrigger
          id={id}
          ref={inputRef}
          onBlur={onBlur}
          className="w-full"
          aria-invalid={fieldState.invalid || undefined}
        >
          <SelectValue
            placeholder={
              loading
                ? t('common.loading')
                : options.length === 0
                  ? t('transactions.fields.noCategories')
                  : t('transactions.fields.chooseCategory')
            }
          />
        </SelectTrigger>
        <SelectContent position="popper" className="max-h-80">
          {groups(options).map((group) =>
            group.parent ? (
              <SelectGroup key={`group-${group.items[0]?.category_id ?? ''}`}>
                <SelectLabel>{group.parent}</SelectLabel>
                {group.items.map((item) => (
                  <SelectItem key={item.category_id} value={item.category_id} className="pl-5">
                    {item.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : (
              group.items.map((item) => (
                <SelectItem key={item.category_id} value={item.category_id}>
                  {item.name}
                </SelectItem>
              ))
            ),
          )}
        </SelectContent>
      </Select>
      {description && <FieldDescription>{description}</FieldDescription>}
      {message && <FieldError>{t(message as ParseKeys)}</FieldError>}
    </Field>
  )
}
