import { useTranslation } from 'react-i18next'

import { allNavItems, type NavKey } from '@/app/navigation'

/** Title and "coming soon" empty state for a section that is not built yet. */
export function PlaceholderPage({ nav }: { nav: NavKey }) {
  const { t } = useTranslation()
  const Icon = allNavItems.find((item) => item.key === nav)?.icon

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t(`nav.${nav}`)}</h1>
        <p className="text-muted-foreground">{t(`pages.${nav}.description`)}</p>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-center">
        {Icon && (
          <span className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Icon className="size-6 text-muted-foreground" aria-hidden />
          </span>
        )}
        <h2 className="text-lg font-medium">{t('common.comingSoon.title')}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          {t('common.comingSoon.description')}
        </p>
      </div>
    </div>
  )
}
