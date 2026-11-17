import { Fragment, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** One part of a metadata line; `className` (e.g. `sm:hidden`) hides it with its separator. */
export interface MetaPart {
  key: string
  content: ReactNode
  className?: string
}

/**
 * Parts of a metadata line joined by "·". The dot is glued to the part before it (a no-break
 * space), so a line that wraps never starts with it, and a part hidden on some widths takes
 * its own dot with it. Empty parts are left out.
 */
// R-APP-535: a metadata line never starts with a separator.
export function MetaLine({
  parts,
  className,
  testId,
}: {
  parts: (MetaPart | null | false | undefined)[]
  className?: string
  testId?: string
}) {
  const shown = parts.filter((part): part is MetaPart => Boolean(part))
  return (
    <span className={className} data-testid={testId}>
      {shown.map((part, index) => (
        <Fragment key={part.key}>
          <span className={cn(part.className)}>
            {part.content}
            {index < shown.length - 1 && (
              <span aria-hidden className="text-muted-foreground">
                {' ·'}
              </span>
            )}
            {index < shown.length - 1 && ' '}
          </span>
        </Fragment>
      ))}
    </span>
  )
}
