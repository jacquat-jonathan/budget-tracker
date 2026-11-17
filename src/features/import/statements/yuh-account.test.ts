import {
  adjustColumn,
  copyLines,
  loadExpected,
  loadFixture,
  moveLines,
  removeLines,
  removeLinesBetween,
  replaceText,
} from '@/test/statement-fixtures'

import { parseStatementDocument as parseStatementText } from './parse-statement'
import type { StatementParse, StatementRefusal, StatementTextDocument, YuhDocument } from './types'

function parsed(document: StatementTextDocument): StatementParse & { document: YuhDocument } {
  const result = parseStatementText(document)
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.refusal)}`)
  const { statement } = result
  if (statement.document.source !== 'yuh-account') throw new Error(statement.source)
  return { ...statement, document: statement.document }
}

function refusal(document: StatementTextDocument): StatementRefusal {
  const result = parseStatementText(document)
  if (result.ok) throw new Error('expected a refusal')
  return result.refusal
}

const expected = loadExpected('yuh-account')

/** A second currency section on page 3, copied from the CHF one, with no movements. */
function addEmptyEuroSection(document: StatementTextDocument): void {
  copyLines(
    document,
    2,
    [742.32, 720.72, 703.68, 689.52, 675.36, 649.44, 632.88].map((y) => ({ from: y, to: y })),
    3,
  )
  copyLines(document, 2, [{ from: 170.88, to: 616 }], 3)
  replaceText(document, 3, 'Extrait de compte en CHF', 'Extrait de compte en EUR', 742.32)
  for (const [from, y] of [
    ['178.75', 720.72],
    ['180.28', 703.68],
    ['284.00', 689.52],
    ['282.47', 675.36],
    ['178.75', 632.88],
    ['282.47', 616],
  ] as const) {
    replaceText(document, 3, from, '0.00', y)
  }
  for (const y of [720.72, 703.68, 689.52, 675.36]) replaceText(document, 3, 'CHF', 'EUR', y)
}

describe('Yuh account: layout variants [R-IMPORT-087]', () => {
  it('reads amounts of a thousand francs and more', () => {
    const document = loadFixture('yuh-account')
    replaceText(document, 2, '284.00', "1'284.00", 412.32)
    expect(adjustColumn(document, [{ page: 2, below: 413 }], 558.6, 100_000)).toBe(4)
    replaceText(document, 2, '284.00', "1'284.00", 689.52)
    replaceText(document, 2, '282.47', "1'282.47", 675.36)
    replaceText(document, 1, '282.47', "1'282.47", 632.64)
    replaceText(document, 1, '282.47', "1'282.47", 480.24)
    const statement = parsed(document)
    expect(statement.entries[2]?.amount).toBe(128_400)
    expect(statement.document.statement.closingBalance).toBe(128_247)
  })

  it('reads an entry that continues on the next page', () => {
    const document = loadFixture('yuh-account')
    // The heading repeats on page 3; the last purchase's last lines and the closing row move there.
    copyLines(document, 2, [{ from: 649.44, to: 740 }], 3)
    moveLines(
      document,
      2,
      [
        { from: 211.2, to: 730 },
        { from: 202.56, to: 721.36 },
        { from: 193.92, to: 712.72 },
        { from: 185.28, to: 704.08 },
        { from: 170.88, to: 690 },
      ],
      3,
    )
    const statement = parsed(document)
    expect(statement.document.transactions).toStrictEqual(expected.transactions)
    expect(statement.document.statement).toStrictEqual(expected.statement)
  })

  it('reads a statement without securities purchases', () => {
    const document = loadFixture('yuh-account')
    for (const [top, bottom] of [
      [597, 518],
      [505, 426],
      [355, 277],
      [264, 185],
    ] as const) {
      removeLinesBetween(document, 2, top, bottom)
    }
    replaceText(document, 2, '372.61', '462.75', 412.32)
    replaceText(document, 2, '282.47', '462.75', 170.88)
    replaceText(document, 2, '282.47', '462.75', 675.36)
    replaceText(document, 2, '180.28', '0.00', 703.68)
    replaceText(document, 1, '282.47', '462.75', 632.64)
    replaceText(document, 1, '282.47', '462.75', 480.24)
    const statement = parsed(document)
    expect(statement.entries.map((entry) => [entry.amount, entry.direction])).toEqual([
      [28400, 'credit'],
    ])
    expect(statement.document.checks.purchaseDebitIsAmountPlusCommissionPlusTax).toBeNull()
    expect(statement.document.statement.totalDebit).toBe(0)
  })

  it('reads a statement with a second currency section without movements', () => {
    const document = loadFixture('yuh-account')
    addEmptyEuroSection(document)
    const statement = parsed(document)
    expect(statement.document.statement.currencySections).toEqual(['CHF', 'EUR'])
    expect(statement.document.transactions).toStrictEqual(expected.transactions)
  })

  it('refuses movements in another currency than CHF [R-IMPORT-084]', () => {
    const document = loadFixture('yuh-account')
    addEmptyEuroSection(document)
    copyLines(document, 2, [{ from: 412.32, to: 624 }], 3)
    expect(refusal(document)).toEqual({
      reason: 'unsupported-currency',
      source: 'yuh-account',
      currency: 'EUR',
    })
  })

  it('keeps an entry of a type not in the sample as printed, proposed for review [R-IMPORT-211]', () => {
    const document = loadFixture('yuh-account')
    replaceText(document, 2, 'Virement de', 'Paiement reçu', 412.32)
    expect(parsed(document).entries[2]).toMatchObject({
      direction: 'credit',
      hint: null,
      handling: 'review-credit',
      merchant: null,
      bankTransactionId: '3011063676',
    })
  })

  it('refuses a securities purchase without its ISIN [R-IMPORT-211]', () => {
    const document = loadFixture('yuh-account')
    removeLines(document, 2, [518.64])
    expect(refusal(document)).toMatchObject({
      reason: 'unreadable-layout',
      problem: 'malformed-entry',
      page: 2,
    })
  })
})

describe('Yuh account: it must add up [R-IMPORT-088]', () => {
  it('refuses a misread balance', () => {
    const document = loadFixture('yuh-account')
    replaceText(document, 2, '133.68', '133.86', 596.4)
    expect(refusal(document)).toMatchObject({
      reason: 'does-not-add-up',
      control: { id: 'running-balance', printed: 13386, computed: 13368 },
    })
  })

  it('refuses a purchase whose debit is not amount plus commission plus tax', () => {
    const document = loadFixture('yuh-account')
    replaceText(document, 2, 'Taxe: CHF 0.07', 'Taxe: CHF 0.08', 544.56)
    expect(refusal(document)).toMatchObject({
      control: { id: 'securities-amount', entry: 1, printed: 4507, computed: 4508 },
    })
  })

  it('refuses a quantity that does not match amount and price', () => {
    const document = loadFixture('yuh-account')
    replaceText(document, 2, 'Quantité: 0.6849', 'Quantité: 0.6949', 579.12)
    expect(refusal(document)).toMatchObject({
      control: { id: 'securities-quantity', entry: 1, printed: 4500 },
    })
  })

  it('refuses a section total that differs from the rows', () => {
    const document = loadFixture('yuh-account')
    replaceText(document, 2, '180.28', '180.38', 703.68)
    expect(refusal(document)).toMatchObject({
      control: { id: 'debits-total', printed: 18038, computed: 18028 },
    })
  })
})

describe('Yuh account: what the statement says a line is', () => {
  it('imports a securities purchase as an ordinary transaction, with the security [R-IMPORT-095] [R-IMPORT-214]', () => {
    const entry = parsed(loadFixture('yuh-account')).entries[0]
    expect(entry).toMatchObject({
      amount: 4507,
      direction: 'debit',
      hint: 'securities-purchase',
      handling: 'import',
      description: 'Exempla Glb Eq Fund (EXWE)',
      details: {
        valueDate: '2024-08-08',
        security: {
          isin: 'ZZX7F3Q9K2B8',
          quantity: '0.6849',
          price: 6570,
          grossAmount: 4500,
          tax: 7,
        },
      },
    })
  })

  it('keeps the Yuh reference as the bank transaction id [R-IMPORT-101]', () => {
    const entries = parsed(loadFixture('yuh-account')).entries
    expect(entries.map((entry) => entry.bankTransactionId)).toEqual([
      '3005893855',
      '3008262728',
      '3011063676',
      '3015110363',
      '3016394923',
    ])
  })

  it('flags a transfer from the holder at the holder address, skipped by default [R-IMPORT-212]', () => {
    const entry = parsed(loadFixture('yuh-account')).entries[2]
    expect(entry).toMatchObject({ hint: 'own-account-transfer', handling: 'skip-by-default' })
  })

  it('proposes a transfer from another person for review [R-IMPORT-213]', () => {
    const document = loadFixture('yuh-account')
    replaceText(document, 2, 'Mustermann Jonas', 'Exemple Anna', 403.68)
    expect(parsed(document).entries[2]).toMatchObject({ hint: null, handling: 'review-credit' })
  })
})
