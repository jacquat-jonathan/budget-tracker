import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import { formatCount } from '@/lib/money'
import { en } from '@/locales/en/translation'
import { fr } from '@/locales/fr/translation'

export const SUPPORTED_LANGUAGES = ['en', 'fr'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

export const LANGUAGE_STORAGE_KEY = 'budget-tracker-language'

export const resources = {
  en: { translation: en },
  fr: { translation: fr },
} as const

export function isLanguage(value: string | undefined): value is Language {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value ?? '')
}

/** The active language, reduced to one of the supported ones ("fr-CH" -> "fr"). */
export function currentLanguage(): Language {
  const language = i18n.resolvedLanguage ?? i18n.language
  return isLanguage(language) ? language : 'en'
}

/**
 * Every {{count}} is shown as counts are everywhere (12'345), by the one helper; the plural is
 * still chosen from the number itself. Other values are left as they are.
 */
// R-APP-282: counts grouped like amounts (12'345), by one helper.
const countFormatter = {
  type: 'formatter' as const,
  init() {},
  add() {},
  addCached() {},
  format(
    value: unknown,
    format: string | undefined,
    _lng: string | undefined,
    options?: { interpolationkey?: string },
  ) {
    if (!format && options?.interpolationkey === 'count' && typeof value === 'number') {
      return Number.isInteger(value) ? formatCount(value) : value
    }
    return value
  },
}

void i18n
  .use(countFormatter)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES,
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    interpolation: { escapeValue: false, alwaysFormat: true },
    // R-I18N-002: the chosen language is remembered in the browser.
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
    returnNull: false,
  })

function syncDocumentLanguage(): void {
  document.documentElement.lang = currentLanguage()
}

syncDocumentLanguage()
i18n.on('languageChanged', syncDocumentLanguage)

export default i18n
