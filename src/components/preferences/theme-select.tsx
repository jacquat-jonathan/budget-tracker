import { useTranslation } from 'react-i18next'

import { THEME_ICONS, ThemeMenuItems } from '@/components/preferences/preference-options'
import { useTheme } from '@/components/theme/theme-context'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/** Compact theme switcher for pages without the sidebar. */
export function ThemeSelect() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const Icon = THEME_ICONS[theme]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('theme.label')}>
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <ThemeMenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
