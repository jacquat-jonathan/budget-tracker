import { LanguagesIcon, MonitorIcon, MoonIcon, SunIcon, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useTheme, type Theme } from '@/components/theme/theme-context'
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'
import { currentLanguage, isLanguage, SUPPORTED_LANGUAGES } from '@/lib/i18n'

export const THEME_ICONS: Record<Theme, LucideIcon> = {
  light: SunIcon,
  dark: MoonIcon,
  system: MonitorIcon,
}

export const LanguageIcon = LanguagesIcon

const THEMES: Theme[] = ['light', 'dark', 'system']

/** Radio items for choosing the UI language; place inside a DropdownMenuContent. */
export function LanguageMenuItems() {
  const { t, i18n } = useTranslation()

  return (
    <>
      <DropdownMenuLabel>{t('language.label')}</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={currentLanguage()}
        onValueChange={(value) => {
          if (isLanguage(value)) void i18n.changeLanguage(value)
        }}
      >
        {SUPPORTED_LANGUAGES.map((language) => (
          <DropdownMenuRadioItem key={language} value={language} lang={language}>
            {t(`language.${language}`)}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  )
}

/** Radio items for choosing light, dark or system theme; place inside a DropdownMenuContent. */
export function ThemeMenuItems() {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()

  return (
    <>
      <DropdownMenuLabel>{t('theme.label')}</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
        {THEMES.map((option) => {
          const Icon = THEME_ICONS[option]
          return (
            <DropdownMenuRadioItem key={option} value={option}>
              <Icon />
              {t(`theme.${option}`)}
            </DropdownMenuRadioItem>
          )
        })}
      </DropdownMenuRadioGroup>
    </>
  )
}
