import {
  addItem,
  duplicatePage,
  loadExpected,
  loadFixture,
  moveLines,
  removeLines,
  removeLinesBetween,
  replaceText,
  shiftLines,
} from '@/test/statement-fixtures'

import { parseStatementDocument as parseStatementText } from './parse-statement'
import type {
  CardBillDocument,
  StatementParse,
  StatementRefusal,
  StatementTextDocument,
} from './types'

function parsed(document: StatementTextDocument): StatementParse & { document: CardBillDocument } {
  const result = parseStatementText(document)
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.refusal)}`)
  const { statement } = result
  if (statement.document.source !== 'migros-bank-credit-card') throw new Error(statement.source)
  return { ...statement, document: statement.document }
}

function refusal(document: StatementTextDocument): StatementRefusal {
  const result = parseStatementText(document)
  if (result.ok) throw new Error('expected a refusal')
  return result.refusal
}

/** Change the bill total, the amount due and both amounts of the payment slip. */
function setBillTotal(
  document: StatementTextDocument,
  total: string,
  ys = { total: 222.9, due: 207.1 },
): void {
  replaceText(document, 2, '818.35', total, ys.total)
  replaceText(document, 2, '818.35', total, ys.due)
  replaceText(document, 4, '818.35', total, 90.8)
  replaceText(document, 4, '818.35', total, 86.7)
}

const expected = loadExpected('migros-bank-credit-card')

describe('card bill: layout variants [R-IMPORT-087]', () => {
  it('reads a bill without a payment received and without interest', () => {
    const document = loadFixture('migros-bank-credit-card')
    removeLines(document, 1, [408.45, 393.35, 383.15])
    replaceText(document, 1, '454.70', "2'811.95", 78)
    replaceText(document, 2, '454.70', "2'811.95", 636.5)
    setBillTotal(document, "3'175.60")
    const statement = parsed(document)
    expect(statement.entries).toHaveLength(17)
    expect(statement.entries.some((entry) => entry.hint === 'interest')).toBe(false)
    expect(statement.document.statement).toMatchObject({
      previousBillTotal: 236300,
      paymentReceived: null,
      interest: 0,
      billTotal: 317560,
      paymentSlip: { amount: 317560 },
    })
  })

  it('reads a refund (trailing minus) as a credit proposed for review [R-IMPORT-213]', () => {
    const document = loadFixture('migros-bank-credit-card')
    replaceText(document, 1, '0.40', '0.40 -', 260.35)
    replaceText(document, 1, '448.95', '448.15', 102.3)
    replaceText(document, 1, '454.70', '453.90', 78)
    replaceText(document, 2, '454.70', '453.90', 636.5)
    replaceText(document, 2, '448.95', '448.15', 594.45)
    replaceText(document, 2, '812.60', '811.80', 238.7)
    setBillTotal(document, '817.55')
    const entry = parsed(document).entries[3]
    expect(entry).toMatchObject({
      amount: 40,
      direction: 'credit',
      hint: 'refund',
      handling: 'review-credit',
      merchant: 'CABZ *RIDE',
    })
  })

  it('reads several cards on one bill, one of them without purchases', () => {
    const document = loadFixture('migros-bank-credit-card')
    shiftLines(document, 2, 230, -100)
    const add = (str: string, x: number, y: number, width: number) => {
      addItem(document, 2, str, x, y, width, 'f3')
    }
    add('5123 45XX XXXX 6789 Mastercard Gold, Nina Lichtensteiger', 66.6, 225, 220)
    add("Limite de carte CHF 7'500", 66.6, 212, 97)
    add('02.06.25 03.06.25 BOOKSHOP DEMO, LAUSANNE CH', 66.6, 199, 190)
    add('25.00', 551.7, 199, 19.4)
    add('Librairies', 134.65, 189, 40)
    add('Total carte Mastercard Gold 5123 45XX XXXX 6789', 134.65, 176, 180)
    add('25.00', 551.7, 176, 19.4)
    add('5123 45XX XXXX 0001 Mastercard Gold, Lea Exemple', 66.6, 163, 200)
    add("Limite de carte CHF 1'000", 66.6, 150, 97)
    add('Total carte Mastercard Gold 5123 45XX XXXX 0001', 134.65, 137, 180)
    add('0.00', 556.05, 137, 15.15)
    setBillTotal(document, '843.35', { total: 122.9, due: 107.1 })
    const statement = parsed(document)
    expect(statement.document.statement.cards.map((card) => card.masked)).toEqual([
      '4999 12XX XXXX 3456',
      '5123 45XX XXXX 6789',
      '5123 45XX XXXX 0001',
    ])
    expect(statement.document.statement.cardTotal).toBe(83760)
    expect(statement.entries).toHaveLength(19)
    expect(statement.entries[18]).toMatchObject({
      amount: 2500,
      description: 'BOOKSHOP DEMO',
      details: {
        card: '5123 45XX XXXX 6789',
        category: 'Librairies',
        country: 'CH',
        original: null,
      },
    })
  })

  it('reads a bill whose rows run over three pages', () => {
    const document = loadFixture('migros-bank-credit-card')
    duplicatePage(document, 2)
    // Page 2 keeps its first two rows, then ends with the two subtotals ...
    removeLinesBetween(document, 2, 520, 45)
    addItem(document, 2, 'Total intermédiaire de la carte', 134.65, 500, 115.6, 'f4')
    addItem(document, 2, '564.35', 545.4, 500, 25.7, 'f4')
    addItem(document, 2, 'Total intermédiaire', 134.65, 480, 72.85, 'f4')
    addItem(document, 2, '570.10', 545.4, 480, 25.7, 'f4')
    // ... and page 3 carries them forward and holds the rest.
    removeLinesBetween(document, 3, 585, 525)
    replaceText(document, 3, '454.70', '570.10', 636.5)
    replaceText(document, 3, '448.95', '564.35', 594.45)
    const statement = parsed(document)
    const transactions = expected.transactions as { page: number }[]
    expect(
      statement.document.transactions.map((transaction) => ({ ...transaction, page: 0 })),
    ).toEqual(transactions.map((transaction) => ({ ...transaction, page: 0 })))
    expect(statement.document.transactions.map((transaction) => transaction.page)).toEqual([
      1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 3, 3, 3, 3, 3, 3, 3,
    ])
    expect(
      statement.controls.filter((control) => control.id === 'card-page-subtotal'),
    ).toHaveLength(2)
    expect(
      statement.controls.filter((control) => control.id === 'card-carried-forward'),
    ).toHaveLength(2)
  })

  it('reads a row whose category line moved to the next page', () => {
    const document = loadFixture('migros-bank-credit-card')
    moveLines(document, 1, [{ from: 117.45, to: 588 }], 2)
    expect(parsed(document).document).toStrictEqual(expected)
  })

  it('imports an annual fee among the header rows [R-IMPORT-096] [R-IMPORT-211]', () => {
    const document = loadFixture('migros-bank-credit-card')
    addItem(document, 1, '12.06.25 12.06.25 Cotisation annuelle', 66.6, 373.6, 160, 'f3')
    addItem(document, 1, '50.00', 551.7, 373.6, 19.4, 'f3')
    replaceText(document, 1, '454.70', '504.70', 78)
    replaceText(document, 2, '454.70', '504.70', 636.5)
    setBillTotal(document, '868.35')
    const statement = parsed(document)
    expect(statement.entries[1]).toMatchObject({
      amount: 5000,
      hint: 'fee',
      handling: 'import',
      merchant: null,
    })
    expect(statement.document.statement.interest).toBe(575)
  })
})

describe('card bill: an item it does not understand refuses the statement [R-IMPORT-087]', () => {
  it('refuses an unexplained amount on a continuation line', () => {
    const document = loadFixture('migros-bank-credit-card')
    addItem(document, 1, 'Supplément', 134.65, 311, 45, 'f3')
    addItem(document, 1, 'CHF', 409.75, 311, 13.85, 'f3')
    addItem(document, 1, '1.00', 499.35, 311, 15.15, 'f3')
    expect(refusal(document)).toMatchObject({
      reason: 'unreadable-layout',
      problem: 'unexpected-line',
      page: 1,
    })
  })

  it('refuses two different amounts on the payment slip', () => {
    const document = loadFixture('migros-bank-credit-card')
    replaceText(document, 4, '818.35', '818.30', 90.8)
    expect(refusal(document)).toMatchObject({ problem: 'inconsistent-document', page: 4 })
  })
})

describe('card bill: it must add up [R-IMPORT-088]', () => {
  it('refuses a misread row through the page subtotal of the card', () => {
    const document = loadFixture('migros-bank-credit-card')
    replaceText(document, 1, '0.40', '0.45', 260.35)
    expect(refusal(document)).toEqual({
      reason: 'does-not-add-up',
      source: 'migros-bank-credit-card',
      control: {
        id: 'card-page-subtotal',
        page: 1,
        entry: null,
        currency: 'CHF',
        printed: 44895,
        computed: 44900,
        tolerance: 0,
      },
    })
  })

  it('refuses a conversion the printed rate does not give [R-IMPORT-097]', () => {
    const document = loadFixture('migros-bank-credit-card')
    replaceText(
      document,
      1,
      'Taux de conversion 0.9041442 du 19.05.25',
      'Taux de conversion 0.9141442 du 19.05.25',
      283.7,
    )
    expect(refusal(document)).toMatchObject({
      control: { id: 'conversion', entry: 3, printed: 27530, computed: 27834, tolerance: 5 },
    })
  })

  it('refuses a CHF amount that is not the converted amount plus the fee [R-IMPORT-097]', () => {
    const document = loadFixture('migros-bank-credit-card')
    replaceText(document, 1, '4.80', '4.85', 272.75)
    expect(refusal(document)).toMatchObject({
      control: { id: 'converted-plus-fee', entry: 3, printed: 28010, computed: 28015 },
    })
  })

  it('refuses a payment slip that differs from the amount due', () => {
    const document = loadFixture('migros-bank-credit-card')
    replaceText(document, 4, '818.35', '818.30', 90.8)
    replaceText(document, 4, '818.35', '818.30', 86.7)
    expect(refusal(document)).toMatchObject({
      control: { id: 'payment-slip-amount', printed: 81830, computed: 81835 },
    })
  })

  it('refuses a bill whose carried-forward total differs from the previous page', () => {
    const document = loadFixture('migros-bank-credit-card')
    replaceText(document, 2, '454.70', '454.75', 636.5)
    expect(refusal(document)).toMatchObject({
      control: { id: 'bill-carried-forward', page: 2, printed: 45475, computed: 45470 },
    })
  })
})

describe('card bill: what the statement says a line is', () => {
  it('imports the late-payment interest as a transaction [R-IMPORT-096]', () => {
    const entry = parsed(loadFixture('migros-bank-credit-card')).entries[0]
    expect(entry).toMatchObject({
      amount: 575,
      direction: 'debit',
      hint: 'interest',
      handling: 'import',
      description: 'Intérêt moratoire pour 27 jours',
      details: { interest: { ratePercent: '11.90', days: 27 } },
    })
  })

  it('imports a foreign purchase with the CHF amount billed, fees included, and the original amount in the description [R-IMPORT-097]', () => {
    const entry = parsed(loadFixture('migros-bank-credit-card')).entries[2]
    expect(entry).toMatchObject({
      amount: 28010,
      description: 'TRV*STAYFINDERS LODGE (EUR 304.48)',
      details: {
        original: {
          currency: 'EUR',
          amountMinor: 30448,
          rate: '0.9041442',
          rateDate: '2025-05-19',
          convertedChf: 27530,
        },
        fee: { amount: 480, percent: '1.75' },
      },
    })
  })

  it('dates a purchase by its purchase date, not its booking date [R-IMPORT-090]', () => {
    const entry = parsed(loadFixture('migros-bank-credit-card')).entries[1]
    expect(entry?.date).toBe('2025-05-13')
    expect(entry?.details.bookingDate).toBe('2025-05-14')
  })

  it('keeps category, location, country and card of every purchase [R-IMPORT-214]', () => {
    const purchases = parsed(loadFixture('migros-bank-credit-card')).entries.slice(1)
    for (const entry of purchases) {
      expect(entry.details.category).not.toBeNull()
      expect(entry.details.country).toMatch(/^[A-Z]{2}$/)
      expect(entry.details.card).toBe('4999 12XX XXXX 3456')
      expect(entry.bankTransactionId).toBeNull()
    }
  })
})
