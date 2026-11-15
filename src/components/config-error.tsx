import { SettingsIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { StatusPage } from '@/components/status-page'

/** Shown instead of the app when required build-time variables are missing. */
export function ConfigError({ missing }: { missing: readonly string[] }) {
  const { t } = useTranslation()

  return (
    <StatusPage
      icon={SettingsIcon}
      title={t('config.missingTitle')}
      description={t('config.missingDescription', { names: missing.join(', ') })}
    />
  )
}
