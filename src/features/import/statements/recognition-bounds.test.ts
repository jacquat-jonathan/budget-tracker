import { documentFromLines, loadFixture } from '@/test/statement-fixtures'

import { parseStatementDocument } from './parse-statement'
import type { StatementTextDocument, TextItemTuple } from './types'

function removeText(
  document: StatementTextDocument,
  page: number,
  test: (text: string) => boolean,
) {
  const target = document.pages.find((candidate) => candidate.page === page)
  if (!target) throw new Error('page')
  const before = target.items.length
  target.items = target.items.filter((item) => !test(item[0]))
  expect(target.items.length).toBeLessThan(before)
}

describe('each part of a signature is needed [R-IMPORT-085]', () => {
  it.each([
    ['migros-bank-account', 'the bank name', (text: string) => text === 'Banque Migros SA'],
    ['migros-bank-account', 'the title', (text: string) => text.startsWith('Extrait de compte ')],
    ['migros-bank-account', 'the table heading', (text: string) => text === 'Valeur'],
    ['migros-bank-credit-card', 'the bank name', (text: string) => text === 'Banque Migros SA'],
    ['migros-bank-credit-card', 'the bill date', (text: string) => text === 'Facture du'],
    [
      'migros-bank-credit-card',
      'the card account',
      (text: string) => text === 'No du compte de la carte',
    ],
    [
      'migros-bank-credit-card',
      'the collection footer',
      (text: string) => text === 'Recouvrement de la créance par',
    ],
    [
      'migros-bank-credit-card',
      'the Viseca footer',
      (text: string) => text === 'Viseca Payment Services SA,',
    ],
    ['yuh-account', 'the title', (text: string) => text === 'Relevé de ton compte'],
    ['yuh-account', 'the account name', (text: string) => text === 'Yuh account'],
    ['yuh-account', 'the footer', (text: string) => text === '2022 Yuh Ltd'],
  ] as const)('%s is not recognised without %s', (name, _part, test) => {
    const document = loadFixture(name)
    removeText(document, 1, test)
    expect(parseStatementDocument(document)).toEqual({
      ok: false,
      refusal: { reason: 'unrecognised-document' },
    })
  })

  it('takes a document of one of the banks for French when the language scores tie', () => {
    const tie = documentFromLines([['Migros Bank', 'Solde', 'Saldo']])
    expect(parseStatementDocument(tie)).toEqual({
      ok: false,
      refusal: { reason: 'unrecognised-document' },
    })
  })
})

describe('bounds on the text layer [R-IMPORT-216]', () => {
  it('refuses a page far from A4', () => {
    const document = loadFixture('yuh-account')
    const page = document.pages[1]
    if (page) page.height = 360_000
    expect(parseStatementDocument(document)).toEqual({
      ok: false,
      refusal: { reason: 'unexpected-page-size', page: 2, width: 595, height: 360_000 },
    })
  })

  it('refuses a page of more than 5000 items and a document of more than 20 000', () => {
    const crowded = loadFixture('yuh-account')
    const filler: TextItemTuple[] = Array.from({ length: 5_001 }, () => [
      'a',
      10,
      10,
      1,
      1,
      'f1',
      0,
    ])
    crowded.pages[0]?.items.push(...filler)
    expect(parseStatementDocument(crowded)).toEqual({
      ok: false,
      refusal: {
        reason: 'too-many-text-items',
        maxPerPage: 5_000,
        maxPerDocument: 20_000,
        page: 1,
      },
    })
    const long = documentFromLines(
      Array.from({ length: 5 }, () => Array.from({ length: 4_500 }, () => 'x')),
    )
    expect(parseStatementDocument(long)).toEqual({
      ok: false,
      refusal: {
        reason: 'too-many-text-items',
        maxPerPage: 5_000,
        maxPerDocument: 20_000,
        page: null,
      },
    })
  })

  it('refuses more than 50 pages', () => {
    const document = documentFromLines(Array.from({ length: 51 }, () => ['x']))
    expect(parseStatementDocument(document)).toEqual({
      ok: false,
      refusal: { reason: 'too-many-pages', maxPages: 50, pages: 51 },
    })
  })

  it('groups 5000 items on distinct baselines in one sorted pass', () => {
    const document = documentFromLines([Array.from({ length: 5_000 }, (_, i) => `ligne ${i}`)])
    for (const [i, item] of (document.pages[0]?.items ?? []).entries()) item[2] = 840 - i * 0.16
    const started = performance.now()
    expect(parseStatementDocument(document)).toEqual({
      ok: false,
      refusal: { reason: 'unrecognised-document' },
    })
    expect(performance.now() - started).toBeLessThan(1_000)
  })
})
