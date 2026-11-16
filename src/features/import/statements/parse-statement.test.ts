import { isCalendarDate } from '@/lib/date'
import {
  documentFromLines,
  FIXTURE_NAMES,
  loadExpected,
  loadFixture,
  replaceText,
} from '@/test/statement-fixtures'

import { parseStatementDocument as parseStatementText } from './parse-statement'
import type { StatementParse as ParsedStatement, StatementTextDocument } from './types'

function parsed(document: StatementTextDocument): ParsedStatement {
  const result = parseStatementText(document)
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.refusal)}`)
  return result.statement
}

describe('statement recognition [R-IMPORT-084] [R-IMPORT-085]', () => {
  it.each(FIXTURE_NAMES)(
    'recognises %s from its content, not from any label in the file',
    (name) => {
      const document = loadFixture(name)
      document.source = 'something-else'
      expect(parsed(document).source).toBe(name)
    },
  )

  it('identifies each statement for the user by its period or bill date, without personal data', () => {
    expect(FIXTURE_NAMES.map((name) => parsed(loadFixture(name)).identity)).toEqual([
      { kind: 'period', from: '2025-04-01', to: '2025-04-30' },
      { kind: 'bill', billDate: '2025-06-12', dueDate: '2025-06-27' },
      { kind: 'period', from: '2024-08-01', to: '2024-08-31' },
    ])
  })

  it('refuses a PDF without a text layer', () => {
    const scan = documentFromLines([[], []])
    expect(parseStatementText(scan)).toEqual({ ok: false, refusal: { reason: 'no-text-layer' } })
    const whitespaceOnly = documentFromLines([[' ', '   '], ['']])
    expect(parseStatementText(whitespaceOnly)).toEqual({
      ok: false,
      refusal: { reason: 'no-text-layer' },
    })
  })

  it('refuses a document that is none of the three', () => {
    const letter = documentFromLines([
      ['Madame, Monsieur,', 'Veuillez trouver ci-joint votre facture du mois.', 'Page 1 / 1'],
    ])
    expect(parseStatementText(letter)).toEqual({
      ok: false,
      refusal: { reason: 'unrecognised-document' },
    })
    // Another French document of the same bank is not a statement this import reads.
    const other = documentFromLines([
      ['Banque Migros SA', 'Relevé de fortune au 31.12.2025', 'Solde total CHF 1.00'],
    ])
    expect(parseStatementText(other)).toEqual({
      ok: false,
      refusal: { reason: 'unrecognised-document' },
    })
    // A German document of another bank is not refused for its language: it is not a statement here.
    const german = documentFromLines([
      ['Kontoauszug 01.04.2025 - 30.04.2025', 'Datum Text Valuta Saldo', 'Seite 1'],
    ])
    expect(parseStatementText(german)).toEqual({
      ok: false,
      refusal: { reason: 'unrecognised-document' },
    })
  })

  it('refuses a fixture whose signature is gone', () => {
    const document = loadFixture('migros-bank-account')
    replaceText(
      document,
      1,
      'Extrait de compte 01.04.2025 - 30.04.2025',
      'Relevé 01.04.2025 - 30.04.2025',
    )
    expect(parseStatementText(document)).toEqual({
      ok: false,
      refusal: { reason: 'unrecognised-document' },
    })
  })
})

describe('the parsers read French statements only [R-IMPORT-098]', () => {
  it.each([
    [
      'de',
      [
        'Migros Bank AG',
        'Postfach',
        'Kontoauszug 01.04.2025 - 30.04.2025',
        'Datum Text Valuta Belastungen Gutschriften Saldo CHF',
        'Saldovortrag 1000.00',
        'Seite 1 / 2',
      ],
    ],
    [
      'it',
      [
        'Banca Migros SA',
        'Casella postale',
        'Fattura del 12.06.2025',
        'Numero del conto della carta 2209 4471 3086 5512',
        'Data Valuta Dettagli Importo CHF',
        'Pagina 1/3',
      ],
    ],
    [
      'en',
      [
        'Your account statement',
        'Account statement from 01.08.2024 to 31.08.2024',
        'Yuh account',
        'Opening balance 178.75 CHF',
        'This statement and the transactions are governed by the general terms of Yuh Ltd',
        'Page 1 / 3',
      ],
    ],
  ] as const)(
    'refuses a %s statement with a reason naming the language limit (Q-061)',
    (language, lines) => {
      expect(parseStatementText(documentFromLines([[...lines]]))).toEqual({
        ok: false,
        refusal: { reason: 'unsupported-language', language, supportedLanguages: ['fr'] },
      })
    },
  )
})

// Properties every parse must have, checked against the statement's own figures rather than
// against expected.json.
describe.each(FIXTURE_NAMES)('%s: properties of the parse', (name) => {
  const statement = parsed(loadFixture(name))
  const { entries } = statement
  const signed = (direction: 'debit' | 'credit', amount: number) =>
    direction === 'debit' ? amount : -amount

  it('has one entry per entry of the transaction table, and nothing else [R-IMPORT-087]', () => {
    const expected = loadExpected(name)
    expect(entries).toHaveLength((expected.transactions as unknown[]).length)
    const notEntries =
      /^(Report|Solde|Total|Montant total|Montant dû|Votre paiement|Limite de carte|\d{4} [\dX]{4} [\dX]{4} \d{4} )/
    for (const entry of entries) {
      expect(entry.textLines[0]).not.toMatch(notEntries)
      expect(Number.isSafeInteger(entry.amount) && entry.amount >= 0).toBe(true)
    }
    const skipped = statement.document.skipped.map((line) => line.text)
    for (const entry of entries) expect(skipped).not.toContain(entry.textLines.join(' '))
  })

  it('adds up to the totals the statement prints [R-IMPORT-088]', () => {
    const total = entries.reduce((sum, entry) => sum + signed(entry.direction, entry.amount), 0)
    const { document } = statement
    if (document.source === 'migros-bank-account') {
      expect(total).toBe(document.statement.totalDebits - document.statement.totalCredits)
      expect(document.statement.openingBalance - total).toBe(document.statement.closingBalance)
    } else if (document.source === 'yuh-account') {
      expect(total).toBe(document.statement.totalDebit - document.statement.totalCredit)
      expect(document.statement.openingBalance - total).toBe(document.statement.closingBalance)
    } else {
      const { previousBillTotal, paymentReceived, billTotal } = document.statement
      expect((previousBillTotal ?? 0) - (paymentReceived ?? 0) + total).toBe(billTotal)
    }
    expect(statement.controls.length).toBeGreaterThan(0)
    for (const control of statement.controls) {
      const difference = Math.abs(control.printed - control.computed)
      expect(control.tolerance === 0 ? difference === 0 : difference < control.tolerance).toBe(true)
    }
  })

  it('books every entry inside the statement period [R-IMPORT-087]', () => {
    const { identity } = statement
    for (const entry of entries) {
      expect(isCalendarDate(entry.date)).toBe(true)
      if (identity.kind === 'period') {
        expect(
          entry.details.bookingDate >= identity.from && entry.details.bookingDate <= identity.to,
        ).toBe(true)
      } else {
        expect(entry.details.bookingDate <= identity.billDate).toBe(true)
        expect(entry.details.bookingDate >= '2025-05-12').toBe(true) // previous bill date
      }
    }
  })

  it('dates every entry by its purchase date when the statement gives one [R-IMPORT-090]', () => {
    for (const entry of entries) {
      expect(entry.date).toBe(entry.details.purchaseDate ?? entry.details.bookingDate)
    }
  })
})
