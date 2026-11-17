import { ArrowRightLeftIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * The transactions a change removes and moves, as its preview counts them: a transaction moved
 * to its new due date is counted once in removed and once in created (D-614), so when every
 * removal and creation is a move it is said once, as a move; otherwise the removals are said,
 * then how many of them are moves. Equalities only: no count is worked out here.
 */
// R-ACCOUNT-554: a moved transaction is said as one move, never as a loss and a new one.
export function TransferMoves({
  removed,
  created,
  moved,
  words,
}: {
  removed: number
  created: number
  moved: number
  /** The transfer form's preview says "it removes"; the other previews say what happens. */
  words: 'preview' | 'counts'
}) {
  const { t } = useTranslation()
  const onlyMoves = moved > 0 && removed === moved && created === moved
  return (
    <>
      {onlyMoves ? (
        <p data-testid="transactions-moved">
          {t(`transfers.${words}.movedOnly`, { count: moved })}
        </p>
      ) : (
        <>
          {removed > 0 && (
            <p data-testid="transactions-removed">
              {words === 'preview'
                ? t('transfers.preview.transactionsRemoved', { count: removed })
                : t('transfers.counts.removed', { count: removed })}
            </p>
          )}
          {words === 'counts' && created > 0 && (
            <p data-testid="transactions-created">
              {t('transfers.counts.created', { count: created })}
            </p>
          )}
          {moved > 0 && (
            <p className="text-muted-foreground" data-testid="transactions-moved">
              {t(`transfers.${words}.movedOf`, { count: moved })}
            </p>
          )}
        </>
      )}
      {/* Q-356: a member's edit does not keep a transaction whose occurrence itself goes. */}
      {removed > 0 && (
        <p className="text-muted-foreground" data-testid="edited-goes">
          {t(`transfers.${words}.editedGoes`)}
        </p>
      )}
    </>
  )
}

/**
 * What a change the catch-up follows does to the planned transfers, as its preview counts it
 * (R-ACCOUNT-303): the app's own transactions removed, created and moved, the members' ticks
 * whose occurrence is no longer planned. Nothing when all are 0: no transfer is touched.
 */
export function TransferCounts({
  removed,
  created,
  unplanned,
  moved: movedCount,
  startMoved = false,
}: {
  removed: number | null | undefined
  created: number | null | undefined
  unplanned: number | null | undefined
  /** Of those removed and created, one occurrence's transaction re-dated. */
  moved: number | null | undefined
  /** A moved start: only what nobody touched moves (D-491, R-ACCOUNT-425). */
  startMoved?: boolean
}) {
  const { t } = useTranslation()
  const r = removed ?? 0
  const c = created ?? 0
  const u = unplanned ?? 0
  const m = movedCount ?? 0
  if (r === 0 && c === 0 && u === 0 && m === 0) return null
  return (
    <div className="flex gap-2 rounded-lg border p-3 text-sm" data-testid="transfer-counts">
      <ArrowRightLeftIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="flex flex-col gap-1">
        <p className="font-medium">{t('transfers.counts.title')}</p>
        <TransferMoves removed={r} created={c} moved={m} words="counts" />
        {/* R-ACCOUNT-425: only what the app recorded by itself and nobody touched moves. */}
        {startMoved && (
          <p className="text-muted-foreground" data-testid="moved-keeps">
            {t('transfers.counts.movedKeeps')}
          </p>
        )}
        {u > 0 && <p>{t('transfers.counts.unplanned', { count: u })}</p>}
      </div>
    </div>
  )
}
