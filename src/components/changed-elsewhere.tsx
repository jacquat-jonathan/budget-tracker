import { InfoIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { FieldView } from '@/hooks/use-edit-base'
import { dbErrorKey } from '@/lib/db-errors'

function Changes({ changes }: { changes: FieldView[] }) {
  return (
    <dl className="my-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-foreground">
      {changes.map((change) => (
        <div key={change.key} className="contents">
          <dt className="text-muted-foreground">{change.label}</dt>
          <dd className="font-medium break-words">{change.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * R-CONCURRENCY-091: another member changed what this form or confirmation shows, while it
 * was open and something was typed. Says what they changed, field by field, with their
 * values; the user loads their version or keeps theirs (only the fields they edited are
 * then saved). For a removal: look at their change, then continue.
 */
export function ChangedElsewhere({
  kind = 'edit',
  changes,
  onUseTheirs,
  onKeepMine,
}: {
  kind?: 'edit' | 'remove'
  changes: FieldView[]
  onUseTheirs?: () => void
  onKeepMine: () => void
}) {
  const { t } = useTranslation()
  return (
    <Alert data-testid="changed-elsewhere" className="border-amber-500/50 bg-amber-500/5">
      <RefreshCwIcon aria-hidden />
      <AlertTitle>{t('concurrent.title')}</AlertTitle>
      <AlertDescription>
        <p>{t('concurrent.theirVersion')}</p>
        <Changes changes={changes} />
        <p>{kind === 'edit' ? t('concurrent.edit') : t('concurrent.remove')}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {onUseTheirs && (
            <Button type="button" size="sm" variant="outline" onClick={onUseTheirs}>
              {t('concurrent.useTheirs')}
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" onClick={onKeepMine}>
            {kind === 'edit' ? t('concurrent.keepMine') : t('concurrent.confirmAgain')}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}

/** Nothing was typed, so the form took the other member's change; says which. */
export function UpdatedElsewhere({ changes }: { changes: FieldView[] }) {
  const { t } = useTranslation()
  return (
    <Alert data-testid="updated-elsewhere" role="status">
      <InfoIcon aria-hidden />
      <AlertTitle>{t('concurrent.updatedTitle')}</AlertTitle>
      <AlertDescription>
        <Changes changes={changes} />
      </AlertDescription>
    </Alert>
  )
}

/**
 * The record was deleted, or ended (removed from the current period), by someone else while
 * this was open: nothing can be saved here any more.
 */
export function GoneElsewhere({
  ended = false,
  endedText,
}: {
  ended?: boolean
  /** What an ended record of this kind still offers, when the default (restore) is not it. */
  endedText?: string
}) {
  const { t } = useTranslation()
  return (
    <Alert data-testid="gone-elsewhere" variant="destructive">
      <Trash2Icon aria-hidden />
      <AlertTitle>{ended ? t('concurrent.endedTitle') : t('concurrent.goneTitle')}</AlertTitle>
      <AlertDescription>
        {ended ? (endedText ?? t('concurrent.ended')) : t('concurrent.gone')}
      </AlertDescription>
    </Alert>
  )
}

/**
 * The inline error of a form's write, unless the record changed or is gone: the banners
 * above say that better.
 */
export function SaveError({
  error,
  hidden,
  message,
}: {
  error: unknown
  hidden: boolean
  message: (error: unknown) => string
}) {
  if (error === null || error === undefined || hidden) return null
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription>{message(error)}</AlertDescription>
    </Alert>
  )
}

/**
 * Everything a form says about concurrent edits and its own write, in one place: the record
 * was deleted, another member changed it (with the choice), it was updated in silence, or
 * the save failed.
 */
export function ConcurrentNotices({
  gone,
  ended = false,
  endedText,
  pending,
  updated,
  onUseTheirs,
  onKeepMine,
  error,
  message,
  recovered = false,
}: {
  gone: boolean
  /** Gone because another member ended it, not deleted. */
  ended?: boolean
  endedText?: string
  pending: FieldView[] | null
  updated: FieldView[] | null
  onUseTheirs: () => void
  onKeepMine: () => void
  error: unknown
  message: (error: unknown) => string
  /** The save's answer was lost but the record holds what was sent: it was saved. */
  recovered?: boolean
}) {
  const { t } = useTranslation()
  // A lost answer is never "someone else": saved (recovered), or not saved (the connection).
  const say = (failure: unknown) =>
    dbErrorKey(failure) === 'errors.network' ? t('errors.networkSave') : message(failure)
  return (
    <>
      {recovered && (
        <Alert data-testid="saved-after-loss" role="status">
          <AlertDescription>{t('concurrent.savedAfterLoss')}</AlertDescription>
        </Alert>
      )}
      {gone && <GoneElsewhere ended={ended} endedText={endedText} />}
      {!gone && pending && (
        <ChangedElsewhere changes={pending} onUseTheirs={onUseTheirs} onKeepMine={onKeepMine} />
      )}
      {!gone && !pending && updated && updated.length > 0 && <UpdatedElsewhere changes={updated} />}
      <SaveError error={error} hidden={gone || pending !== null || recovered} message={say} />
    </>
  )
}
