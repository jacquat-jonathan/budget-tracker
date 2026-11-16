import { RefreshCwIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

/**
 * R-CONCURRENCY-091: another member changed the record while this form or confirmation was
 * open. What the user typed is kept; they choose: take the other version (the form is
 * refilled from it) or keep theirs (the next save replaces the other version). For a
 * removal there is nothing typed: they look at it again and confirm.
 */
export function ChangedElsewhere({
  kind = 'edit',
  onUseTheirs,
  onKeepMine,
}: {
  kind?: 'edit' | 'remove'
  onUseTheirs?: () => void
  onKeepMine: () => void
}) {
  const { t } = useTranslation()
  return (
    <Alert data-testid="changed-elsewhere" className="border-amber-500/50 bg-amber-500/5">
      <RefreshCwIcon aria-hidden />
      <AlertTitle>{t('concurrent.title')}</AlertTitle>
      <AlertDescription>
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

/**
 * The inline error of a form's write, unless it is a "changed by someone else" refusal
 * that ChangedElsewhere already explains.
 */
export function SaveError({
  error,
  changed,
  message,
}: {
  error: unknown
  changed: boolean
  message: (error: unknown) => string
}) {
  if (error === null || error === undefined || changed) return null
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription>{message(error)}</AlertDescription>
    </Alert>
  )
}
