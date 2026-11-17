import { WifiOffIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useOffline } from '@/lib/online'

/**
 * While the browser is offline, a notice across the app, read out politely when it appears.
 * The live region is always there, so the change is announced.
 */
// R-APP-530: "You are offline" on every page while the browser is offline.
export function OfflineNotice() {
  const { t } = useTranslation()
  const offline = useOffline()
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-center"
    >
      {offline && (
        <p
          className="pointer-events-auto flex max-w-xl items-start gap-2 rounded-lg border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg"
          data-testid="offline-notice"
        >
          <WifiOffIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <strong className="font-medium">{t('offline.notice')}</strong>{' '}
            {t('offline.noticeDetail')}
          </span>
        </p>
      )}
    </div>
  )
}
