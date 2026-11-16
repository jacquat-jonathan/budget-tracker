import { MORE_VALUE, type MoreOption } from '@/components/form/select-field'
import { SelectItem } from '@/components/ui/select'

/** The same entry in a plain Select: its value is never a period. */
export function OlderPeriodsItem({ option }: { option: MoreOption | undefined }) {
  if (!option) return null
  return (
    <SelectItem value={MORE_VALUE} className="text-muted-foreground italic">
      {option.label}
    </SelectItem>
  )
}
