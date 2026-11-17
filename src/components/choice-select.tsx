import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface Choice {
  value: string
  label: string
}

/** Radix Select reads "" as "nothing chosen"; a real "" choice ("none") travels as this. */
const EMPTY = '__empty__'
const toSelect = (value: string) => (value === '' ? EMPTY : value)
const fromSelect = (value: string) => (value === EMPTY ? '' : value)

/**
 * The app's styled select for a plain choice outside a form library (the import's preview
 * rows, the CSV mapper, the merchant rules): the same look and keyboard behaviour as every
 * other select of the app.
 */
// R-IMPORT-532: the import uses the app's styled selects.
export function ChoiceSelect({
  id,
  value,
  onValueChange,
  options,
  className,
  label,
  describedBy,
  disabled,
  size = 'default',
}: {
  id?: string
  value: string
  onValueChange: (value: string) => void
  options: readonly Choice[]
  className?: string
  /** The accessible name when no <Label htmlFor> names it. */
  label?: string
  describedBy?: string
  disabled?: boolean
  size?: 'sm' | 'default'
}) {
  return (
    <Select
      value={toSelect(value)}
      onValueChange={(next) => onValueChange(fromSelect(next))}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        size={size}
        aria-label={label}
        aria-describedby={describedBy}
        className={cn('w-full min-w-0', className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-72">
        {options.map((option) => (
          <SelectItem key={option.value} value={toSelect(option.value)}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
