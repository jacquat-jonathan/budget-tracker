import type { ParseKeys } from 'i18next'
import { EyeIcon, EyeOffIcon, TriangleAlertIcon } from 'lucide-react'
import { useId, useState, type ComponentProps } from 'react'
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { DISPLAY_NAME_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/features/auth/schemas'

interface TextFieldProps<
  TValues extends FieldValues,
  TOut extends FieldValues = TValues,
> extends Omit<ComponentProps<typeof Input>, 'name' | 'defaultValue' | 'value'> {
  control: Control<TValues, unknown, TOut>
  name: FieldPath<TValues>
  label: string
  /** A note that does not block saving (e.g. "this name is already used"), said in words. */
  warning?: string | null
}

/** A labelled input bound to react-hook-form; shows its translated validation error. */
export function TextField<TValues extends FieldValues, TOut extends FieldValues = TValues>({
  control,
  name,
  label,
  type = 'text',
  warning,
  ...inputProps
}: TextFieldProps<TValues, TOut>) {
  const { t } = useTranslation()
  const id = useId()
  const errorId = `${id}-error`
  const warningId = `${id}-warning`
  const { field, fieldState } = useController({ control, name })
  const [revealed, setRevealed] = useState(false)
  const isPassword = type === 'password'
  const message = fieldState.error?.message
  const value: unknown = field.value

  return (
    <Field data-invalid={fieldState.invalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <Input
          {...inputProps}
          {...field}
          value={typeof value === 'string' ? value : ''}
          id={id}
          type={isPassword && revealed ? 'text' : type}
          aria-invalid={fieldState.invalid || undefined}
          aria-describedby={
            [message ? errorId : null, warning ? warningId : null].filter(Boolean).join(' ') ||
            undefined
          }
          className={isPassword ? 'pr-9' : undefined}
        />
        {isPassword && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-1/2 right-0.5 -translate-y-1/2 text-muted-foreground"
            onClick={() => setRevealed((value) => !value)}
            aria-label={revealed ? t('fields.hidePassword') : t('fields.showPassword')}
            aria-pressed={revealed}
          >
            {revealed ? <EyeOffIcon /> : <EyeIcon />}
          </Button>
        )}
      </div>
      {/* Announced as it appears while typing; it never blocks saving. */}
      <div aria-live="polite" className="contents">
        {warning && (
          <p
            id={warningId}
            className="flex items-start gap-1.5 text-sm text-amber-800 dark:text-amber-200"
            data-testid="field-warning"
          >
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{warning}</span>
          </p>
        )}
      </div>
      {message && (
        <FieldError id={errorId}>
          {t(message as ParseKeys, { min: PASSWORD_MIN_LENGTH, max: DISPLAY_NAME_MAX_LENGTH })}
        </FieldError>
      )}
    </Field>
  )
}
