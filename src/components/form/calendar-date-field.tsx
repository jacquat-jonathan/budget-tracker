import type { ParseKeys } from 'i18next'
import { useEffect, useId, useRef, useState } from 'react'
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { formatCalendarDate, isCalendarDate, parseDate } from '@/lib/date'

interface CalendarDateFieldProps<TValues extends FieldValues, TOut extends FieldValues = TValues> {
  control: Control<TValues, unknown, TOut>
  name: FieldPath<TValues>
  label: string
  description?: string
  autoFocus?: boolean
}

function toText(value: unknown): string {
  return typeof value === 'string' && isCalendarDate(value) ? formatCalendarDate(value) : ''
}

/**
 * A calendar date typed as dd.mm.yyyy. The form value is the calendar date "YYYY-MM-DD"
 * ("" when empty, the raw text when it is not a date); it is parsed from the text and never
 * goes through a Date or a time zone (C-DATE-002).
 */
export function CalendarDateField<TValues extends FieldValues, TOut extends FieldValues = TValues>({
  control,
  name,
  label,
  description,
  autoFocus,
}: CalendarDateFieldProps<TValues, TOut>) {
  const { t } = useTranslation()
  const id = useId()
  const { field, fieldState } = useController({ control, name })
  const value: unknown = field.value
  const [text, setText] = useState(() => toText(value))
  const emitted = useRef<unknown>(value)

  useEffect(() => {
    if (!Object.is(value, emitted.current)) {
      emitted.current = value
      setText(toText(value))
    }
  }, [value])

  const message = fieldState.error?.message
  const describedBy = [description && `${id}-description`, message && `${id}-error`]
    .filter(Boolean)
    .join(' ')

  return (
    <Field data-invalid={fieldState.invalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        ref={field.ref}
        name={field.name}
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={t('fields.datePlaceholder')}
        className="tabular-nums sm:max-w-40"
        value={text}
        aria-invalid={fieldState.invalid || undefined}
        aria-describedby={describedBy || undefined}
        onChange={(event) => {
          const next = event.target.value
          setText(next)
          const trimmed = next.trim()
          const parsed = trimmed === '' ? '' : (parseDate(trimmed) ?? trimmed)
          emitted.current = parsed
          field.onChange(parsed)
        }}
        onBlur={field.onBlur}
      />
      {description && (
        <FieldDescription id={`${id}-description`}>{description}</FieldDescription>
      )}
      {message && <FieldError id={`${id}-error`}>{t(message as ParseKeys)}</FieldError>}
    </Field>
  )
}

/** A calendar date for display, dd.mm.yyyy, read from the string (C-DATE-002). */
export function CalendarDate({ value }: { value: string }) {
  return (
    <time dateTime={value} className="tabular-nums">
      {formatCalendarDate(value)}
    </time>
  )
}
