import { InfoIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'

/**
 * A save that had nothing to send: the window stays open and says so, never "saved".
 */
// R-APP-280: a save that sends nothing neither closes nor says "saved".
export function NothingToSave({ show }: { show: boolean }) {
  const { t } = useTranslation()
  if (!show) return null
  return (
    <Alert data-testid="nothing-to-save" role="status">
      <InfoIcon aria-hidden />
      <AlertDescription>{t('corrections.nothingToSave')}</AlertDescription>
    </Alert>
  )
}
