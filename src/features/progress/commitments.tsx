import { TriangleAlertIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { isOverCommitted, type Commitment } from '@/features/progress/commitment'

function hasCommitment({ subscriptions, transfers }: Commitment): boolean {
  return subscriptions > 0 || transfers > 0
}

/** The words of a commitment above the plan, naming each figure and the plan. */
function OverSentence({ commitment }: { commitment: Commitment }) {
  const { t } = useTranslation()
  const values = {
    subscriptions: formatMoney(commitment.subscriptions),
    transfers: formatMoney(commitment.transfers),
    planned: formatMoney(commitment.planned),
  }
  const key =
    commitment.subscriptions > 0 && commitment.transfers > 0
      ? 'progress.overCommittedBoth'
      : commitment.transfers > 0
        ? 'progress.overCommittedTransfers'
        : 'progress.overCommittedSubscriptions'
  return (
    <span
      className="flex items-start gap-1 text-red-700 dark:text-red-300"
      data-testid="committed-over"
    >
      <TriangleAlertIcon className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{t(key, values)}</span>
    </span>
  )
}

/**
 * Under a period's planned total (the budget's totals, the period progress): what the
 * subscriptions and the planned transfers commit inside it, each on its own line, or, when
 * more is committed than planned, one sentence that says so.
 */
// R-PROGRESS-530: the transfers' committed amount shown apart from the subscriptions'.
// R-PROGRESS-533: "up to" when a category's commitment exceeds its own plan.
export function CommittedTotal({
  commitment,
  someCategoryOver = false,
}: {
  commitment: Commitment
  /**
   * A category is committed above its own plan: part of a committed figure is then not inside the
   * planned total, so it is said as "up to", never as all inside it.
   */
  someCategoryOver?: boolean
}) {
  const { t } = useTranslation()
  if (!hasCommitment(commitment)) return null
  if (isOverCommitted(commitment)) {
    return (
      <span className="block" data-testid="progress-committed">
        <OverSentence commitment={commitment} />
      </span>
    )
  }
  return (
    <span className="block" data-testid="progress-committed">
      {commitment.subscriptions > 0 && (
        <span className="block" data-testid="committed-subscriptions">
          {t(someCategoryOver ? 'progress.plannedIncludesUpTo' : 'progress.plannedIncludes', {
            amount: formatMoney(commitment.subscriptions),
          })}
        </span>
      )}
      {commitment.transfers > 0 && (
        <span className="block" data-testid="committed-transfers">
          {t(
            someCategoryOver
              ? 'progress.plannedIncludesTransfersUpTo'
              : 'progress.plannedIncludesTransfers',
            { amount: formatMoney(commitment.transfers) },
          )}
        </span>
      )}
    </span>
  )
}

/** A narrow row: sentences that name the planned amount the commitments are part of. */
export function CommittedSentence({
  commitment,
  className,
  testId,
}: {
  commitment: Commitment
  className?: string
  testId?: string
}) {
  const { t } = useTranslation()
  if (!hasCommitment(commitment)) return null
  const expected = formatMoney(commitment.planned)
  return (
    <span className={cn('flex flex-col tabular-nums', className)} data-testid={testId}>
      {isOverCommitted(commitment) ? (
        <OverSentence commitment={commitment} />
      ) : (
        <>
          {commitment.subscriptions > 0 && (
            <span data-testid="committed-subscriptions">
              {t('progress.rowPlannedIncludes', {
                expected,
                amount: formatMoney(commitment.subscriptions),
              })}
            </span>
          )}
          {commitment.transfers > 0 && (
            <span data-testid="committed-transfers">
              {t('progress.rowPlannedIncludesTransfers', {
                expected,
                amount: formatMoney(commitment.transfers),
              })}
            </span>
          )}
        </>
      )}
    </span>
  )
}

/**
 * Under an amount in its column (the budget's rows, a wide progress row): short lines, "incl."
 * while inside the plan; above the plan each figure is named as committed, the badge beside the
 * name says the rest.
 */
export function CommittedCell({
  commitment,
  className,
  testId,
}: {
  commitment: Commitment
  className?: string
  testId?: string
}) {
  const { t } = useTranslation()
  if (!hasCommitment(commitment)) return null
  const over = isOverCommitted(commitment)
  return (
    <span className={cn('flex flex-col items-end tabular-nums', className)} data-testid={testId}>
      {commitment.subscriptions > 0 && (
        <span data-testid="committed-subscriptions">
          {t(over ? 'progress.committedSubscriptions' : 'progress.includes', {
            amount: formatMoney(commitment.subscriptions),
          })}
        </span>
      )}
      {commitment.transfers > 0 && (
        <span data-testid="committed-transfers">
          {t(over ? 'progress.committedTransfers' : 'progress.includesTransfers', {
            amount: formatMoney(commitment.transfers),
          })}
        </span>
      )}
    </span>
  )
}

/** Beside a name, like "Overspent": words, not colour alone. */
export function OverCommittedBadge() {
  const { t } = useTranslation()
  return (
    <Badge
      variant="outline"
      className="border-transparent bg-red-500/10 text-red-700 dark:bg-red-400/15 dark:text-red-300"
      data-testid="over-committed-badge"
    >
      {t('progress.overCommitted')}
    </Badge>
  )
}
