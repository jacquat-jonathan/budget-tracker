import i18n, { currentLanguage, LANGUAGE_STORAGE_KEY } from '@/lib/i18n'

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('UI language [R-I18N-002]', () => {
  it('is remembered in the browser and set as the page language', async () => {
    await i18n.changeLanguage('fr')
    expect(currentLanguage()).toBe('fr')
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('fr')
    expect(document.documentElement.lang).toBe('fr')

    await i18n.changeLanguage('en')
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en')
    expect(document.documentElement.lang).toBe('en')
  })

  it('reduces a regional variant to a supported language', async () => {
    await i18n.changeLanguage('fr-CH')
    expect(currentLanguage()).toBe('fr')
    expect(document.documentElement.lang).toBe('fr')
  })
})
