import { ArrowRightLeftIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * What a change the catch-up follows does to the planned transfers, as its preview counts it
 * (R-ACCOUNT-303): the app's own transactions removed and created, the members' ticks whose
 * occurrence is no longer planned. Nothing when all are 0: no transfer is touched.
 */
export function TransferCounts({
  removed,
  created,
  unplanned,
  moved = false,
}: {
  removed: number | null | undefined
  created: number | null | undefined
  unplanned: number | null | undefined
  /** A moved start: a transaction made again on its new date counts once each way (D-491). */
  moved?: boolean
}) {
  const { t } = useTranslation()
  const r = removed ?? 0
  const c = created ?? 0
  const u = unplanned ?? 0
  if (r === 0 && c === 0 && u === 0) return null
  return (
    <div className="flex gap-2 rounded-lg border p-3 text-sm" data-testid="transfer-counts">
      <ArrowRightLeftIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="flex flex-col gap-1">
        <p className="font-medium">{t('transfers.counts.title')}</p>
        {r > 0 && <p>{t('transfers.counts.removed', { count: r })}</p>}
        {c > 0 && <p>{t('transfers.counts.created', { count: c })}</p>}
        {moved && r > 0 && c > 0 && (
          <p className="text-muted-foreground">{t('transfers.counts.movedNote')}</p>
        )}
        {/* R-ACCOUNT-425: only what the app recorded by itself and nobody touched moves. */}
        {moved && (
          <p className="text-muted-foreground" data-testid="moved-keeps">
            {t('transfers.counts.movedKeeps')}
          </p>
        )}
        {u > 0 && <p>{t('transfers.counts.unplanned', { count: u })}</p>}
      </div>
    </div>
  )
}
