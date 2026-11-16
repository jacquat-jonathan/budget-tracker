import type { ReactNode } from 'react'

import { formatMoney } from '@/lib/money'
import type { MoneyTone } from '@/lib/money-tone'
import { cn } from '@/lib/utils'

/**
 * A labelled amount, the figures of a summary row: tabular, right-sized, coloured by tone
 * with a word in the label or hint as well, never by colour alone.
 */
export function MoneyStat({
  label,
  amount,
  tone = 'neutral',
  hint,
  testId,
  emphasis = false,
}: {
  label: string
  amount: number
  tone?: MoneyTone
  hint?: ReactNode
  testId?: string
  emphasis?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1" data-testid={testId}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'font-semibold tracking-tight tabular-nums',
          emphasis ? 'text-2xl' : 'text-xl',
          tone === 'negative' && 'text-destructive',
          tone === 'positive' && 'text-positive',
        )}
      >
        {formatMoney(amount)}
      </dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  )
}
