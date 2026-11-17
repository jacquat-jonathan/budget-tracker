import i18n from '@/lib/i18n'
import { refusalText } from '@/features/import/statement-words'
import type { StatementRefusal, StatementRefusalReason } from '@/features/import/statements/types'

const control = {
  id: 'closing-balance' as const,
  page: 2,
  entry: null,
  currency: 'CHF',
  printed: 123_450,
  computed: 123_440,
  tolerance: 0,
}

/** One refusal of every reason the reader gives. */
const EVERY: Record<StatementRefusalReason, StatementRefusal> = {
  'no-text-layer': { reason: 'no-text-layer' },
  'unrecognised-document': { reason: 'unrecognised-document' },
  'unsupported-language': {
    reason: 'unsupported-language',
    language: 'de',
    supportedLanguages: ['fr'],
  },
  'unreadable-layout': {
    reason: 'unreadable-layout',
    source: 'migros-bank-account',
    problem: 'unreadable-amount',
    page: 3,
    text: 'Achat SECRET LINE 12.3X',
  },
  'implausible-date': {
    reason: 'implausible-date',
    source: 'migros-bank-credit-card',
    control: 'purchase-after-booking',
    entry: 7,
    page: 1,
    purchaseDate: '2025-05-20',
    bookingDate: '2025-05-19',
  },
  'does-not-add-up': { reason: 'does-not-add-up', source: 'yuh-account', control },
  'unsupported-currency': {
    reason: 'unsupported-currency',
    source: 'yuh-account',
    currency: 'EUR',
  },
  'not-a-pdf': { reason: 'not-a-pdf' },
  'password-protected': { reason: 'password-protected' },
  'corrupt-file': { reason: 'corrupt-file' },
  'file-too-large': { reason: 'file-too-large', maxBytes: 10_485_760, bytes: 12_582_912 },
  'too-many-pages': { reason: 'too-many-pages', maxPages: 50, pages: 61 },
  'too-many-text-items': {
    reason: 'too-many-text-items',
    maxPerPage: 5000,
    maxPerDocument: 20_000,
    page: 4,
  },
  'unexpected-page-size': { reason: 'unexpected-page-size', page: 1, width: 300.4, height: 400 },
  'timed-out': { reason: 'timed-out', limitMs: 20_000 },
  'reader-unavailable': { reason: 'reader-unavailable' },
  'unexpected-error': { reason: 'unexpected-error' },
}

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('a refused statement is explained in words [R-IMPORT-085] [R-IMPORT-320]', () => {
  it('has its own text for every reason, in English and French, with its figures', async () => {
    for (const language of ['en', 'fr'] as const) {
      await i18n.changeLanguage(language)
      const texts = Object.values(EVERY).map((refusal) => refusalText(i18n.t, refusal))
      for (const text of texts) {
        expect(text).not.toMatch(/import\.|{{/)
        expect(text.length).toBeGreaterThan(20)
      }
      // Every reason reads differently.
      expect(new Set(texts).size).toBe(texts.length)
    }
    await i18n.changeLanguage('en')
    const t = i18n.t
    expect(refusalText(t, EVERY['unsupported-language'])).toContain('German')
    const sums = refusalText(t, EVERY['does-not-add-up']).replace(/\u00a0/g, ' ')
    expect(sums).toContain('the closing balance')
    expect(sums).toContain("CHF 1'234.50")
    expect(sums).toContain("CHF 1'234.40")
    expect(sums).toContain('page 2')
    expect(refusalText(t, EVERY['file-too-large'])).toContain('12.0 MB')
    expect(refusalText(t, EVERY['too-many-text-items'])).toContain("20'000")
    expect(refusalText(t, EVERY['implausible-date'])).toContain('20.05.2025')
    await i18n.changeLanguage('fr')
    expect(refusalText(i18n.t, EVERY['unsupported-language'])).toContain('allemand')
  })

  it('never carries the line in question: that is shown apart, on the device only', () => {
    const text = refusalText(i18n.t, EVERY['unreadable-layout'])
    expect(text).not.toContain('SECRET LINE')
    expect(text).toContain('an amount that cannot be read')
  })
})
