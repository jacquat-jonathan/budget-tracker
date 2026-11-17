import { TriangleAlertIcon } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useRouteError } from 'react-router'

import { StatusPage } from '@/components/status-page'
import { Button } from '@/components/ui/button'

/** Router error boundary: unexpected render errors and failed lazy page loads. */
export function RouteError() {
  const { t } = useTranslation()
  const error = useRouteError()

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <StatusPage
      icon={TriangleAlertIcon}
      title={t('errorPage.title')}
      description={t('errorPage.description')}
      action={<Button onClick={() => window.location.reload()}>{t('errorPage.reload')}</Button>}
    />
  )
}
