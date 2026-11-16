import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

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

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES,
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    interpolation: { escapeValue: false },
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
