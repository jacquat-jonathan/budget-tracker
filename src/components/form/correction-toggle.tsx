import { TriangleAlertIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field'

/**
 * An explicit correction of earlier periods: off by default, its period choice and its
 * warning shown only once it is ticked (as incomes and categories do it, R-CATEGORY-053).
 */
export function CorrectionToggle({
  checked,
  onCheckedChange,
  label,
  warning,
  children,
}: {
  checked: boolean
  onCheckedChange: (next: boolean) => void
  label: string
  warning: string
  /** The period choice. */
  children: ReactNode
}) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <Field orientation="horizontal">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(next) => onCheckedChange(next === true)}
        />
        <FieldContent>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <FieldDescription>{t('income.correction.help')}</FieldDescription>
        </FieldContent>
      </Field>
      {checked && (
        <>
          {children}
          <Alert variant="destructive">
            <TriangleAlertIcon aria-hidden />
            <AlertDescription>{warning}</AlertDescription>
          </Alert>
        </>
      )}
    </div>
  )
}
