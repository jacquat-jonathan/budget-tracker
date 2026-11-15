import { Loader2Icon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

/** Loading indicator; fills the viewport unless `inline` is set. */
export function FullPageSpinner({ inline = false }: { inline?: boolean }) {
  const { t } = useTranslation()

  return (
    <div
      role="status"
      className={cn(
        'flex items-center justify-center text-muted-foreground',
        inline ? 'flex-1 py-24' : 'min-h-svh',
      )}
    >
      <Loader2Icon className="size-6 animate-spin" aria-hidden />
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  )
}
