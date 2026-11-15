import { CompassIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { paths } from '@/app/paths'
import { StatusPage } from '@/components/status-page'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  const { t } = useTranslation()

  return (
    <StatusPage
      icon={CompassIcon}
      code="404"
      title={t('notFound.title')}
      description={t('notFound.description')}
      action={
        <Button asChild>
          <Link to={paths.dashboard}>{t('notFound.backHome')}</Link>
        </Button>
      }
    />
  )
}
