import { useTranslation } from 'react-i18next'

import {
  LanguageIcon,
  LanguageMenuItems,
  THEME_ICONS,
  ThemeMenuItems,
} from '@/components/preferences/preference-options'
import { useTheme } from '@/components/theme/theme-context'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { currentLanguage } from '@/lib/i18n'

/** Language and theme switchers for the sidebar footer; they collapse to icons with it. */
export function NavPreferences() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { isMobile } = useSidebar()
  const ThemeIcon = THEME_ICONS[theme]
  const menuSide = isMobile ? 'top' : 'right'

  return (
    <>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton tooltip={t('language.label')}>
              <LanguageIcon />
              <span>{t('language.label')}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {t(`language.${currentLanguage()}`)}
              </span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={menuSide} align="end" className="min-w-40">
            <LanguageMenuItems />
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton tooltip={t('theme.label')}>
              <ThemeIcon />
              <span>{t('theme.label')}</span>
              <span className="ml-auto text-xs text-muted-foreground">{t(`theme.${theme}`)}</span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={menuSide} align="end" className="min-w-40">
            <ThemeMenuItems />
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </>
  )
}
