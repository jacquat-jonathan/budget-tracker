// One test per control and guard of the card-bill parser: a derived variant with one figure or
// line changed must be refused by exactly that control or guard.
import {
  addItem,
  loadExpected,
  loadFixture,
  removeLines,
  replaceText,
} from '@/test/statement-fixtures'

import { parseStatementDocument } from './parse-statement'
import type {
  CardBillDocument,
  StatementEntry,
  StatementRefusal,
  StatementTextDocument,
} from './types'

function refusal(document: StatementTextDocument): StatementRefusal {
  const result = parseStatementDocument(document)
  if (result.ok) throw new Error('expected a refusal')
  return result.refusal
}

function parsed(document: StatementTextDocument): {
  entries: StatementEntry[]
  document: CardBillDocument
} {
  const result = parseStatementDocument(document)
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.refusal)}`)
  const { statement } = result
  if (statement.document.source !== 'migros-bank-credit-card') throw new Error(statement.source)
  return { entries: statement.entries, document: statement.document }
}

function variant(change: (document: StatementTextDocument) => void): StatementTextDocument {
  const document = loadFixture('migros-bank-credit-card')
  change(document)
  return document
}

const PAYMENT = '09.06.25 09.06.25 Votre paiement - Merci'

describe('card bill: a payment received is never an entry, whatever its label [R-IMPORT-215] [R-IMPORT-087]', () => {
  const expected = loadExpected('migros-bank-credit-card') as unknown as CardBillDocument
  it.each([
    'Votre paiement LSV - Merci',
    'Votre paiement - Merci.',
    'Votre paiement – Merci',
    'Votre paiement partiel - Merci',
    'Paiement reçu',
    'VOTRE PAIEMENT - MERCI',
    'Votre paiement reçu - Merci',
  ])('reads "%s" as the payment received', (label) => {
    const document = variant((d) => {
      replaceText(d, 1, PAYMENT, `09.06.25 09.06.25 ${label}`, 408.45)
    })
    const { entries, document: bill } = parsed(document)
    expect(entries).toHaveLength(18)
    expect(entries.every((entry) => entry.direction === 'debit')).toBe(true)
    expect(bill.statement.paymentReceived).toBe(236300)
    expect(bill.transactions).toStrictEqual(expected.transactions)
  })

  it('refuses a payment row without its minus (an unknown charge)', () => {
    const document = variant((d) => {
      replaceText(d, 1, "2'363.00 -", "2'363.00", 408.45)
    })
    expect(refusal(document)).toMatchObject({ problem: 'unexpected-line', page: 1 })
  })

  it('refuses a header debit that is neither interest nor a fee', () => {
    const document = variant((d) => {
      replaceText(
        d,
        1,
        '12.06.25 12.06.25 Intérêt moratoire pour 27 jours',
        '12.06.25 12.06.25 Ajustement',
        393.35,
      )
      removeLines(d, 1, [383.15])
    })
    expect(refusal(document)).toMatchObject({ problem: 'unexpected-line', page: 1 })
  })
})

describe('card bill: each printed figure is checked [R-IMPORT-088]', () => {
  it.each([
    ['bill-page-subtotal', 1, '454.70', '454.75', 78, 45475, 45470],
    ['card-carried-forward', 2, '448.95', '448.90', 594.45, 44890, 44895],
    ['card-total', 2, '812.60', '812.65', 238.7, 81265, 81260],
    ['bill-total', 2, '818.35', '818.40', 222.9, 81840, 81835],
    ['amount-due', 2, '818.35', '818.40', 207.1, 81840, 81835],
  ] as const)('refuses through %s', (id, page, from, to, y, printed, computed) => {
    const document = variant((d) => {
      replaceText(d, page, from, to, y)
    })
    expect(refusal(document)).toMatchObject({
      reason: 'does-not-add-up',
      control: { id, printed, computed },
    })
  })

  it('refuses a processing fee far from its percentage', () => {
    const document = variant((d) => {
      // 32.55 + 1.60 still makes 34.15, but 1.75 % of 32.55 is 0.57.
      replaceText(d, 1, '33.55', '32.55', 336.95)
      replaceText(d, 1, '0.60', '1.60', 316.55)
    })
    expect(refusal(document)).toMatchObject({
      control: { id: 'conversion-fee', entry: 2, printed: 160, computed: 57, tolerance: 5 },
    })
  })

  it('refuses a CHF amount charged abroad that is not its amount plus fee', () => {
    const document = variant((d) => {
      replaceText(d, 1, '33.55', '33.45', 336.95)
    })
    expect(refusal(document)).toMatchObject({
      control: { id: 'chf-amount-plus-fee', entry: 2, printed: 3415, computed: 3405, tolerance: 5 },
    })
  })
})

describe('card bill: lines the table does not allow [R-IMPORT-087]', () => {
  it('refuses a row booked after the bill date', () => {
    const document = variant((d) => {
      replaceText(
        d,
        2,
        '11.06.25 12.06.25 MODELWORK* WRITER ABO, GALWAY 4 IE',
        '11.06.25 13.06.25 MODELWORK* WRITER ABO, GALWAY 4 IE',
        285.65,
      )
    })
    expect(refusal(document)).toMatchObject({ problem: 'entry-outside-period', page: 2 })
  })

  it('refuses a row booked before the previous bill', () => {
    const document = variant((d) => {
      replaceText(
        d,
        1,
        '13.05.25 14.05.25 TEXTAI *CHATBOT ABONMT, GALWAY IE',
        '10.05.25 11.05.25 TEXTAI *CHATBOT ABONMT, GALWAY IE',
        336.95,
      )
    })
    expect(refusal(document)).toMatchObject({ problem: 'entry-outside-period', page: 1 })
  })

  it('refuses a CHF amount on a continuation line', () => {
    const document = variant((d) => {
      addItem(d, 1, '1.00', 556.05, 250.15, 15.15, 'f3')
    })
    expect(refusal(document)).toMatchObject({ problem: 'unexpected-line', page: 1 })
  })

  it('refuses a row between two card sections', () => {
    const document = variant((d) => {
      addItem(d, 2, '12.06.25 12.06.25 Frais divers', 66.6, 230.8, 120, 'f3')
      addItem(d, 2, '1.00', 556.05, 230.8, 15.15, 'f3')
    })
    expect(refusal(document)).toMatchObject({ problem: 'unexpected-line', page: 2 })
  })

  it('refuses another card heading while a card is open', () => {
    const document = variant((d) => {
      replaceText(
        d,
        2,
        '4999 12XX XXXX 3456 Visa Gold, Jonas Mustermann',
        '4999 12XX XXXX 9999 Visa Gold, Jonas Mustermann',
        621.2,
      )
    })
    expect(refusal(document)).toMatchObject({ problem: 'unexpected-line', page: 2 })
  })

  it('refuses the total of another card', () => {
    const document = variant((d) => {
      replaceText(
        d,
        2,
        'Total carte Visa Gold 4999 12XX XXXX 3456',
        'Total carte Visa Gold 4999 12XX XXXX 9999',
        238.7,
      )
    })
    expect(refusal(document)).toMatchObject({ problem: 'unexpected-line', page: 2 })
  })

  it('refuses an interest-rate line under a purchase', () => {
    const document = variant((d) => {
      addItem(d, 2, 'Intérêt par année 11.90%', 134.65, 291.5, 88, 'f3')
    })
    expect(refusal(document)).toMatchObject({ problem: 'malformed-entry', page: 2 })
  })

  it('refuses an interest-rate line under a fee', () => {
    const document = variant((d) => {
      replaceText(
        d,
        1,
        '12.06.25 12.06.25 Intérêt moratoire pour 27 jours',
        '12.06.25 12.06.25 Cotisation annuelle',
        393.35,
      )
    })
    expect(refusal(document)).toMatchObject({ problem: 'malformed-entry', page: 1 })
  })

  it('refuses a fee line under the interest', () => {
    const document = variant((d) => {
      replaceText(d, 1, 'Intérêt par année 11.90%', 'Frais de traitement 1.75%', 383.15)
      addItem(d, 1, 'CHF', 409.75, 383.15, 13.85, 'f3')
      addItem(d, 1, '0.10', 499.35, 383.15, 15.15, 'f3')
    })
    expect(refusal(document)).toMatchObject({ problem: 'malformed-entry', page: 1 })
  })

  it('refuses a fee line under a domestic purchase', () => {
    const document = variant((d) => {
      addItem(d, 2, 'Frais de traitement 1.75%', 134.65, 291.5, 89, 'f3')
      addItem(d, 2, 'CHF', 409.75, 291.5, 13.85, 'f3')
      addItem(d, 2, '0.35', 499.35, 291.5, 15.15, 'f3')
    })
    expect(refusal(document)).toMatchObject({ problem: 'malformed-entry', page: 2 })
  })
})

describe('card bill: purchase dates must be plausible [R-IMPORT-217]', () => {
  it.each([
    ['23.05.52 26.05.25', 'purchase-after-booking', '2052-05-23'],
    ['27.05.25 26.05.25', 'purchase-after-booking', '2025-05-27'],
    ['23.05.23 26.05.25', 'purchase-long-before-booking', '2023-05-23'],
  ] as const)('refuses the dates %s', (dates, control, purchaseDate) => {
    const document = variant((d) => {
      replaceText(
        d,
        1,
        '23.05.25 26.05.25 LH-HOTELMIRADOR, LILLE FR',
        `${dates} LH-HOTELMIRADOR, LILLE FR`,
        215.9,
      )
    })
    expect(refusal(document)).toMatchObject({
      reason: 'implausible-date',
      control,
      entry: 6,
      purchaseDate,
    })
  })
})

describe('card bill: hints come from labels and categories, not merchant names', () => {
  it.each([
    ['RETRAITES POPULAIRES, LAUSANNE CH', 'Logiciels informatiques', null],
    ['CAFE DU RETRAIT, LILLE FR', 'Logiciels informatiques', null],
    ['RETRAIT BANCOMAT, LILLE FR', 'Logiciels informatiques', 'cash-withdrawal'],
    ['DISTRIBUTEUR GARE, LILLE FR', "Retraits d'espèces", 'cash-withdrawal'],
  ] as const)('%s with category %s', (details, category, hint) => {
    const document = variant((d) => {
      replaceText(
        d,
        1,
        '13.05.25 14.05.25 TEXTAI *CHATBOT ABONMT, GALWAY IE',
        `13.05.25 14.05.25 ${details}`,
        336.95,
      )
      replaceText(d, 1, 'Logiciels informatiques', category, 326.75)
    })
    expect(parsed(document).entries[1]?.hint).toBe(hint)
  })

  it('gives an entry of 0.00 nothing to import', () => {
    const entry = parsed(loadFixture('migros-bank-credit-card')).entries[14]
    expect(entry).toMatchObject({ amount: 0, handling: 'nothing-to-import' })
  })
})
