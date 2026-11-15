import type { ParseKeys } from 'i18next'
import { useEffect, useId, useRef, useState } from 'react'
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { formatMoney, parseMoney } from '@/lib/money'

interface MoneyFieldProps<TValues extends FieldValues, TOut extends FieldValues = TValues> {
  control: Control<TValues, unknown, TOut>
  name: FieldPath<TValues>
  label: string
  description?: string
  autoFocus?: boolean
}

function toText(value: unknown): string {
  return typeof value === 'number' && Number.isSafeInteger(value)
    ? formatMoney(value, { currency: false })
    : ''
}

/**
 * An amount in CHF, bound to integer rappen: the form value is the rappen (null when empty,
 * NaN when the text is not an amount). Typed text is parsed with parseMoney (Swiss and
 * French ways of writing amounts) and shown again with formatMoney once the field is left.
 */
export function MoneyField<TValues extends FieldValues, TOut extends FieldValues = TValues>({
  control,
  name,
  label,
  description,
  autoFocus,
}: MoneyFieldProps<TValues, TOut>) {
  const { t } = useTranslation()
  const id = useId()
  const { field, fieldState } = useController({ control, name })
  const value: unknown = field.value
  const [text, setText] = useState(() => toText(value))
  // The value this field last emitted; anything else came from outside (form.reset).
  const emitted = useRef<unknown>(value)

  useEffect(() => {
    if (!Object.is(value, emitted.current)) {
      emitted.current = value
      setText(toText(value))
    }
  }, [value])

  const emit = (next: number | null) => {
    emitted.current = next
    field.onChange(next)
  }

  const message = fieldState.error?.message
  const describedBy = [description && `${id}-description`, message && `${id}-error`]
    .filter(Boolean)
    .join(' ')

  return (
    <Field data-invalid={fieldState.invalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <span
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground"
          aria-hidden
        >
          CHF
        </span>
        <Input
          id={id}
          ref={field.ref}
          name={field.name}
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          className="pl-11 text-right tabular-nums"
          value={text}
          placeholder="0.00"
          aria-invalid={fieldState.invalid || undefined}
          aria-describedby={describedBy || undefined}
          onChange={(event) => {
            const next = event.target.value
            setText(next)
            emit(next.trim() === '' ? null : (parseMoney(next) ?? Number.NaN))
          }}
          onBlur={() => {
            const parsed = text.trim() === '' ? null : parseMoney(text)
            if (parsed !== null) setText(toText(parsed))
            field.onBlur()
          }}
        />
      </div>
      {description && (
        <FieldDescription id={`${id}-description`}>{description}</FieldDescription>
      )}
      {message && <FieldError id={`${id}-error`}>{t(message as ParseKeys)}</FieldError>}
    </Field>
  )
}
