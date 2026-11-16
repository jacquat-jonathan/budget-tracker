import { ChevronDownIcon } from 'lucide-react'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/**
 * A browser select styled like the inputs: light enough for a list of hundreds of rows, and
 * fully usable with the keyboard and a screen reader as it is.
 */
export function NativeSelect({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <span className={cn('relative inline-flex min-w-0', className)}>
      <select
        {...props}
        className="h-8 w-full min-w-0 appearance-none truncate rounded-lg border border-input bg-transparent py-1 pr-8 pl-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 [&>option]:bg-popover [&>option]:text-popover-foreground"
      >
        {children}
      </select>
      <ChevronDownIcon
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </span>
  )
}
