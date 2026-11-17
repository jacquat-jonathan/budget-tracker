import { RotateCwIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useErrorMessage } from '@/hooks/use-app-mutation'

/** Where the focus goes in a dialog once its "Try again" is gone: its first field, else Save. */
function focusInDialog(dialog: Element | null) {
  if (!dialog?.isConnected) return
  const field = dialog.querySelector<HTMLElement>(
    'input:not([type=hidden]):not([disabled]), textarea:not([disabled]), button[role=combobox]:not([disabled])',
  )
  const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('button:not([disabled])')]
  // The confirmation is the last button of the dialog's footer.
  ;(field ?? buttons.at(-1))?.focus()
}

/**
 * The preview failed to load: say so and offer to try again. The button stays in place (and
 * keeps the focus) while the preview is read again; once it is shown, the button goes and the
 * focus moves to the form's first field, or its confirmation, never to the dialog itself.
 */
export function PreviewLoadFailed({
  error,
  fetching,
  onRetry,
}: {
  error: unknown
  fetching: boolean
  onRetry: () => void
}) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const element = button.current
    const dialog = element?.closest('[role=dialog], [role=alertdialog]') ?? null
    const lost = () => {
      const active = document.activeElement
      return active === null || active === element || active === document.body || active === dialog
    }
    return () => {
      // R-APP-481: the retry that had the focus is gone; the focus goes somewhere useful.
      if (!lost()) return
      window.setTimeout(() => {
        if (lost()) focusInDialog(dialog)
      }, 0)
    }
  }, [])
  return (
    <div className="flex flex-col items-start gap-2" role="alert" data-testid="preview-failed">
      <p className="text-destructive">
        {t('states.previewFailed', { reason: errorMessage(error) })}
      </p>
      <Button
        ref={button}
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          if (!fetching) onRetry()
        }}
        aria-disabled={fetching}
        data-testid="preview-retry"
      >
        <RotateCwIcon className={fetching ? 'animate-spin' : undefined} aria-hidden />
        {fetching ? t('common.loading') : t('states.retry')}
      </Button>
    </div>
  )
}
