import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'
import { useId } from 'react'
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form'

import { FieldDescription, FieldLegend, FieldSet } from '@/components/ui/field'
import { cn } from '@/lib/utils'

export interface SegmentOption {
  value: string
  label: string
}

/**
 * A short choice shown as a row of segments (a radio group: arrow keys move, one tab stop),
 * for two or three options such as per month / per year, or the kind of a transaction.
 */
export function SegmentedField<TValues extends FieldValues, TOut extends FieldValues = TValues>({
  control,
  name,
  label,
  options,
  description,
}: {
  control: Control<TValues, unknown, TOut>
  name: FieldPath<TValues>
  label: string
  options: readonly SegmentOption[]
  description?: string
}) {
  const id = useId()
  const { field } = useController({ control, name })
  const value: unknown = field.value
  return (
    // Side by side when the form is wide enough, stacked on a phone (container query).
    <FieldSet className="@container">
      <FieldLegend variant="label" id={`${id}-legend`}>
        {label}
      </FieldLegend>
      <RadioGroupPrimitive.Root
        name={field.name}
        value={typeof value === 'string' ? value : ''}
        onValueChange={(next) => field.onChange(next)}
        aria-labelledby={`${id}-legend`}
        className="grid grid-cols-1 gap-1 rounded-lg bg-muted p-1 @sm:auto-cols-fr @sm:grid-flow-col @sm:grid-cols-none"
      >
        {options.map((option) => (
          <RadioGroupPrimitive.Item
            key={option.value}
            value={option.value}
            className={cn(
              'min-w-0 rounded-md px-2 py-1.5 text-center text-sm leading-tight font-medium text-balance break-words text-foreground/70 transition-colors outline-none',
              'hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
              'data-[state=checked]:bg-background data-[state=checked]:text-foreground data-[state=checked]:shadow-sm',
            )}
          >
            {option.label}
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>
      {description && <FieldDescription>{description}</FieldDescription>}
    </FieldSet>
  )
}
