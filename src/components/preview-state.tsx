import { RotateCwIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useErrorMessage } from '@/hooks/use-app-mutation'

/**
 * The preview failed to load: say so and offer to try again. The button stays in place (and
 * keeps the focus) while the preview is read again.
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
  return (
    <div className="flex flex-col items-start gap-2" role="alert" data-testid="preview-failed">
      <p className="text-destructive">
        {t('states.previewFailed', { reason: errorMessage(error) })}
      </p>
      <Button
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
