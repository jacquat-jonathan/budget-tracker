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
  /** A last entry that is an action, not a value (e.g. "Older periods…"): the value stays. */
  more?: MoreOption
  /**
   * Shown while nothing is chosen: with a placeholder, "" means "nothing chosen" (no option
   * may then have the value "").
   */
  placeholder?: string
}

export interface MoreOption {
  label: string
  onSelect: () => void
}

/** The value of the action entry: never a form value. */
export const MORE_VALUE = '__more__'

/**
 * Radix Select treats "" as "nothing selected" and shows an empty box, but forms use "" for
 * a real choice ("the current period"). It travels through the select as this stand-in.
 */
const EMPTY_VALUE = '__empty__'
const toSelect = (value: string) => (value === '' ? EMPTY_VALUE : value)
const fromSelect = (value: string) => (value === EMPTY_VALUE ? '' : value)

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
  more,
  placeholder,
}: SelectFieldProps<TValues, TOut>) {
  const { t } = useTranslation()
  const id = useId()
  const {
    field: { ref: inputRef, name: fieldName, onChange, onBlur, value: fieldValue },
    fieldState,
  } = useController({ control, name })
  const value: unknown = fieldValue
  const message = fieldState.error?.message

  return (
    <Field data-invalid={fieldState.invalid || undefined} className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        name={fieldName}
        value={
          placeholder !== undefined && value === ''
            ? ''
            : typeof value === 'string' || typeof value === 'number'
              ? toSelect(String(value))
              : ''
        }
        disabled={disabled}
        onValueChange={(next) => {
          if (next === MORE_VALUE) {
            more?.onSelect()
            return
          }
          const chosen = fromSelect(next)
          onChange(numeric ? Number(chosen) : chosen)
        }}
      >
        <SelectTrigger
          id={id}
          ref={inputRef}
          onBlur={onBlur}
          className={cn('w-full')}
          aria-invalid={fieldState.invalid || undefined}
          aria-describedby={description ? `${id}-description` : undefined}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent position="popper" className="max-h-72">
          {options.map((option) => (
            <SelectItem key={option.value} value={toSelect(option.value)}>
              {option.label}
            </SelectItem>
          ))}
          {more && (
            <SelectItem value={MORE_VALUE} className="text-muted-foreground italic">
              {more.label}
            </SelectItem>
          )}
        </SelectContent>
      </Select>
      {description && <FieldDescription id={`${id}-description`}>{description}</FieldDescription>}
      {message && <FieldError>{t(message as ParseKeys)}</FieldError>}
    </Field>
  )
}
