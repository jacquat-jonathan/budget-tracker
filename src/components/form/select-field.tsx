import type { ParseKeys } from 'i18next'
import { useId } from 'react'
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface SelectOption {
  value: string
  label: string
}

interface SelectFieldProps<TValues extends FieldValues, TOut extends FieldValues = TValues> {
  control: Control<TValues, unknown, TOut>
  name: FieldPath<TValues>
  label: string
  options: readonly SelectOption[]
  description?: string
  disabled?: boolean
  /** The form value is a number (e.g. a pay day): options' values are its digits. */
  numeric?: boolean
  className?: string
}

/** A labelled select bound to react-hook-form. */
export function SelectField<TValues extends FieldValues, TOut extends FieldValues = TValues>({
  control,
  name,
  label,
  options,
  description,
  disabled,
  numeric = false,
  className,
}: SelectFieldProps<TValues, TOut>) {
  const { t } = useTranslation()
  const id = useId()
  const { field, fieldState } = useController({ control, name })
  const value: unknown = field.value
  const message = fieldState.error?.message

  return (
    <Field data-invalid={fieldState.invalid || undefined} className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        name={field.name}
        value={value === null || value === undefined ? '' : String(value)}
        disabled={disabled}
        onValueChange={(next) => field.onChange(numeric ? Number(next) : next)}
      >
        <SelectTrigger
          id={id}
          ref={field.ref}
          onBlur={field.onBlur}
          className={cn('w-full')}
          aria-invalid={fieldState.invalid || undefined}
          aria-describedby={description ? `${id}-description` : undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" className="max-h-72">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description && (
        <FieldDescription id={`${id}-description`}>{description}</FieldDescription>
      )}
      {message && <FieldError>{t(message as ParseKeys)}</FieldError>}
    </Field>
  )
}
