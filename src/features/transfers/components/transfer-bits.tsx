import { ArrowRightIcon, HandIcon, ZapIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'

/** Standing order or manual, in words and with an icon (never colour alone). */
export function ModeBadge({ automatic }: { automatic: boolean }) {
  const { t } = useTranslation()
  const Icon = automatic ? ZapIcon : HandIcon
  return (
    <Badge variant={automatic ? 'secondary' : 'outline'} className="shrink-0">
      <Icon aria-hidden />
      {t(automatic ? 'transfers.mode.automaticShort' : 'transfers.mode.manualShort')}
    </Badge>
  )
}

/** "Salary account → Savings", the arrow said in words to a screen reader. */
export function FromTo({ from, to }: { from: string; to: string }) {
  const { t } = useTranslation()
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className="truncate">{from}</span>
      <ArrowRightIcon className="size-3.5 shrink-0" aria-hidden />
      <span className="sr-only">{t('transfers.to')}</span>
      <span className="truncate">{to}</span>
    </span>
  )
}
