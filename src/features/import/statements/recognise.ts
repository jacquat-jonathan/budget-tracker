/**
 * Recognising a statement from the text of its first page (R-IMPORT-085), never from the file
 * name or the PDF metadata.
 */
import { MIGROS_ACCOUNT_HEADING, MIGROS_ACCOUNT_TITLE } from './migros-bank-account'
import { hasItems, type PageLines } from './text-lines'
import type { StatementSource, UnsupportedLanguage } from './types'

export type Recognition =
  | { kind: 'source'; source: StatementSource }
  | { kind: 'other-language'; language: UnsupportedLanguage }
  | { kind: 'unrecognised' }

function has(texts: readonly string[], test: RegExp | string): boolean {
  return texts.some((text) => (typeof test === 'string' ? text.includes(test) : test.test(text)))
}

/** Names of the banks behind the three statements, in any language. */
const BANK_MARKERS = [
  /\bMigros ?Bank\b/i,
  /\bBanque Migros\b/,
  /\bBanca Migros\b/,
  /\bViseca\b/,
  /\bYuh\b/,
  /\bSwissquote\b/,
]

/** Words typical of each language's statement labels, counted once each. */
const LANGUAGE_WORDS: Record<'fr' | Exclude<UnsupportedLanguage, 'unknown'>, RegExp[]> = {
  fr: [
    /\bExtrait de compte\b/,
    /\bFacture\b/,
    /\bRelevé\b/,
    /\bSolde\b/,
    /\bDébits?\b/,
    /\bCrédits?\b/,
    /\bMontant\b/,
    /\bValeur\b/,
    /\bPage\b/,
    /\bCase postale\b/,
    /\bdu\b/,
    /\bde la\b/,
  ],
  de: [
    /\bKontoauszug\b/,
    /\bRechnung\b/,
    /\bSaldo\b/,
    /\bBelastung(en)?\b/,
    /\bGutschrift(en)?\b/,
    /\bBetrag\b/,
    /\bValuta\b/,
    /\bSeite\b/,
    /\bPostfach\b/,
    /\bDatum\b/,
    /\bder\b/,
    /\bund\b/,
  ],
  it: [
    /\bEstratto conto\b/,
    /\bFattura\b/,
    /\bAddebit[oi]\b/,
    /\bAccredit[oi]\b/,
    /\bImporto\b/,
    /\bValuta\b/,
    /\bPagina\b/,
    /\bCasella postale\b/,
    /\bdella\b/,
    /\bdel\b/,
    /\bSaldo\b/,
    /\bData\b/,
  ],
  en: [
    /\bAccount statement\b/i,
    /\bStatement\b/,
    /\bInvoice\b/,
    /\bBalance\b/,
    /\bDebits?\b/,
    /\bCredits?\b/,
    /\bAmount\b/,
    /\bValue date\b/i,
    /\bPage\b/,
    /\bthe\b/,
    /\band\b/,
    /\bDate\b/,
  ],
}

function detectLanguage(texts: readonly string[]): 'fr' | UnsupportedLanguage {
  const score = (words: RegExp[]) => words.filter((word) => has(texts, word)).length
  const french = score(LANGUAGE_WORDS.fr)
  const others = (['de', 'it', 'en'] as const)
    .map((language) => ({ language, score: score(LANGUAGE_WORDS[language]) }))
    .sort((a, b) => b.score - a.score)
  const [best, second] = others
  // French wins ties: a French document is never refused for its language.
  if (!best || best.score <= french) return 'fr'
  return best.score === second?.score ? 'unknown' : best.language
}

export function recognise(pages: PageLines[]): Recognition {
  const first = pages[0]
  if (!first) return { kind: 'unrecognised' }
  const texts = first.lines.map((line) => line.text)

  if (
    has(texts, 'Banque Migros SA') &&
    has(texts, MIGROS_ACCOUNT_TITLE) &&
    first.lines.some((line) => hasItems(line, MIGROS_ACCOUNT_HEADING))
  ) {
    return { kind: 'source', source: 'migros-bank-account' }
  }
  if (
    has(texts, 'Banque Migros SA') &&
    has(texts, /\bFacture du \d{2}\.\d{2}\.\d{4}\b/) &&
    has(texts, /\bNo du compte de la carte\b/) &&
    has(texts, /Recouvrement de la créance par/) &&
    has(texts, /Viseca Payment Services SA,/)
  ) {
    return { kind: 'source', source: 'migros-bank-credit-card' }
  }
  if (
    has(texts, 'Relevé de ton compte') &&
    first.lines.some((line) => line.items.some((item) => item.str === 'Yuh account')) &&
    has(texts, /©.*\bYuh Ltd\b/)
  ) {
    return { kind: 'source', source: 'yuh-account' }
  }

  // One of the three banks in another language: refuse with the language (D-134, Q-061).
  const allTexts = pages.flatMap((page) => page.lines.map((line) => line.text))
  if (BANK_MARKERS.some((marker) => has(allTexts, marker))) {
    const language = detectLanguage(allTexts)
    if (language !== 'fr') return { kind: 'other-language', language }
  }
  return { kind: 'unrecognised' }
}
