import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

/** Set the browser tab title to "<page> · <app name>". */
export function useDocumentTitle(title: string | undefined): void {
  const { t } = useTranslation()
  const appName = t('app.name')

  useEffect(() => {
    document.title = title ? `${title} · ${appName}` : appName
  }, [title, appName])
}
