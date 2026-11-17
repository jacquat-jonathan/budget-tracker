import { useTranslation } from 'react-i18next'

import { LanguageIcon, LanguageMenuItems } from '@/components/preferences/preference-options'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { currentLanguage } from '@/lib/i18n'

/** Compact language switcher for pages without the sidebar. */
export function LanguageSelect() {
  const { t } = useTranslation()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t('language.label')}>
          <LanguageIcon />
          <span className="uppercase">{currentLanguage()}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <LanguageMenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
