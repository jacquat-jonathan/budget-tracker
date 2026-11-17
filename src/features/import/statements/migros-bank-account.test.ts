import {
  addItem,
  adjustColumn,
  loadExpected,
  loadFixture,
  moveLines,
  removeLines,
  replaceText,
} from '@/test/statement-fixtures'

import { parseStatementDocument as parseStatementText } from './parse-statement'
import type {
  MigrosAccountDocument,
  StatementParse,
  StatementRefusal,
  StatementTextDocument,
} from './types'

function parsed(
  document: StatementTextDocument,
): StatementParse & { document: MigrosAccountDocument } {
  const result = parseStatementText(document)
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.refusal)}`)
  const { statement } = result
  if (statement.document.source !== 'migros-bank-account') throw new Error(statement.source)
  return { ...statement, document: statement.document }
}

function refusal(document: StatementTextDocument): StatementRefusal {
  const result = parseStatementText(document)
  if (result.ok) throw new Error('expected a refusal')
  return result.refusal
}

const expected = loadExpected('migros-bank-account')

describe('Migros Bank account: layout variants [R-IMPORT-087]', () => {
  it('reads an entry whose continuation line moved to the next page', () => {
    const document = loadFixture('migros-bank-account')
    // The last entry of page 1 ("Achat Mini Market 5210 ... 3.86") loses its second line,
    // which now opens the table of page 2.
    moveLines(document, 1, [{ from: 56.9, to: 603 }], 2)
    const statement = parsed(document)
    expect(statement.document).toStrictEqual(expected)
    expect(statement.entries[16]?.textLines).toEqual([
      'Achat Mini Market 5210 06.04.2025 08:13 Carte:',
      '498765******2031 Montant: CHF 3.86',
    ])
    expect(statement.entries[16]?.page).toBe(1)
  })

  it('reads a booking day that starts on one page and ends on the next (the balance prints there)', () => {
    const statement = parsed(loadFixture('migros-bank-account'))
    const day = statement.entries.filter((entry) => entry.details.bookingDate === '2025-04-25')
    expect(day.map((entry) => [entry.page, entry.details.balanceAfter])).toEqual([
      [3, null],
      [3, null],
      [4, null],
      [4, 2005585],
    ])
  })

  it('reads a statement with one entry fewer once its totals follow', () => {
    const document = loadFixture('migros-bank-account')
    // Remove the last entry (standing order of 9.25, which carries the closing balance).
    removeLines(document, 4, [120.95, 109.55, 98.75, 87.95])
    replaceText(document, 4, "9'868.25", "9'859.00", 75)
    replaceText(document, 4, "17'130.38", "17'139.63", 75)
    replaceText(document, 4, "17'130.38", "17'139.63", 49.1)
    replaceText(document, 1, "9'868.25", "9'859.00", 563.75)
    replaceText(document, 1, "17'130.38", "17'139.63", 542.15)
    const statement = parsed(document)
    expect(statement.entries).toHaveLength(77)
    expect(statement.document.statement.closingBalance).toBe(1713963)
    expect(statement.document.checks.sumOfDebits).toBe(985900)
  })

  it('reads amounts of a million francs and more', () => {
    const document = loadFixture('migros-bank-account')
    replaceText(document, 3, "4'952.95", "1'004'952.95", 52.55)
    // Every balance printed after the salary, the totals and the summary block move with it.
    expect(adjustColumn(document, [{ page: 4, below: 1000 }], 551.2, 100_000_000)).toBe(6)
    replaceText(document, 4, "5'584.50", "1'005'584.50", 75)
    replaceText(document, 1, "5'584.50", "1'005'584.50", 552.95)
    replaceText(document, 1, "17'130.38", "1'017'130.38", 542.15)
    const statement = parsed(document)
    const salary = statement.entries.find((entry) => entry.hint === 'salary')
    expect(salary?.amount).toBe(100_495_295)
    expect(statement.document.statement.closingBalance).toBe(101_713_038)
  })

  it('takes a value date glued to the end of the text as the value date', () => {
    const statement = parsed(loadFixture('migros-bank-account'))
    const entry = statement.entries[15]
    expect(entry?.textLines).toEqual(['Débit TWINT Fiesta Concerts SA 0400007211347108 06.04.25'])
    expect(entry?.details.valueDate).toBe('2025-04-06')
    expect(entry?.description).toBe('TWINT Fiesta Concerts SA')
  })

  it('keeps an entry of a type not in the sample as printed, with a cash-withdrawal hint [R-IMPORT-211]', () => {
    const document = loadFixture('migros-bank-account')
    replaceText(
      document,
      1,
      'Débit TWINT Webshop Direct 0400007210607736',
      'Retrait Bancomat Gare Monts',
      237.95,
    )
    const entry = parsed(document).entries[8]
    expect(entry).toMatchObject({
      amount: 9925,
      direction: 'debit',
      description: 'Retrait Bancomat Gare Monts',
      merchant: null,
      bankTransactionId: null,
      hint: 'cash-withdrawal',
      handling: 'import',
    })
  })
})

describe('Migros Bank account: an item it does not understand refuses the statement [R-IMPORT-087]', () => {
  it('refuses an unreadable amount', () => {
    const document = loadFixture('migros-bank-account')
    replaceText(document, 1, '99.25', '99.2', 237.95)
    expect(refusal(document)).toMatchObject({
      reason: 'unreadable-layout',
      problem: 'unreadable-amount',
      page: 1,
    })
  })

  it('refuses a negative balance, which the sample never printed (Q-200)', () => {
    const document = loadFixture('migros-bank-account')
    replaceText(document, 1, "22'042.43", "-22'042.43", 430.1)
    expect(refusal(document)).toMatchObject({
      reason: 'unreadable-layout',
      problem: 'unreadable-amount',
    })
  })

  it('refuses an item outside every column', () => {
    const document = loadFixture('migros-bank-account')
    addItem(document, 1, 'XYZ', 360, 237.95, 15)
    expect(refusal(document)).toMatchObject({ problem: 'unexpected-item', page: 1 })
  })

  it('refuses an amount on a continuation line', () => {
    const document = loadFixture('migros-bank-account')
    addItem(document, 1, '1.00', 397.3, 419.05, 15)
    expect(refusal(document)).toMatchObject({
      problem: 'unexpected-line',
      text: '0400007210353926 1.00',
    })
  })

  it('refuses a card purchase that does not have the card pattern [R-IMPORT-211]', () => {
    const document = loadFixture('migros-bank-account')
    replaceText(
      document,
      1,
      'Achat Petrol Alpina 31.03.2025 10:04 Carte:',
      'Achat Petrol Alpina 31.03.2025 10:04',
      405.95,
    )
    expect(refusal(document)).toMatchObject({ problem: 'malformed-entry', page: 1 })
  })

  it('refuses an entry booked outside the statement period', () => {
    const document = loadFixture('migros-bank-account')
    replaceText(document, 1, '01.04.25', '31.03.25', 430.1, 72.25)
    expect(refusal(document)).toMatchObject({ problem: 'entry-outside-period' })
  })

  it('refuses a QR reference whose check digit is wrong', () => {
    const document = loadFixture('migros-bank-account')
    replaceText(
      document,
      2,
      '00 00000 00022 09447 13086 55120',
      '00 00000 00022 09447 13086 55121',
      382.1,
    )
    expect(refusal(document)).toMatchObject({ problem: 'invalid-reference' })
  })

  it('refuses an account in another currency than CHF [R-IMPORT-084]', () => {
    const document = loadFixture('migros-bank-account')
    replaceText(document, 1, '41.302.776 / CHF', '41.302.776 / EUR')
    expect(refusal(document)).toEqual({
      reason: 'unsupported-currency',
      source: 'migros-bank-account',
      currency: 'EUR',
    })
  })
})

describe('Migros Bank account: it must add up [R-IMPORT-088]', () => {
  it('refuses a misread balance with both figures', () => {
    const document = loadFixture('migros-bank-account')
    replaceText(document, 1, "22'040.42", "22'040.24", 405.95)
    expect(refusal(document)).toEqual({
      reason: 'does-not-add-up',
      source: 'migros-bank-account',
      control: {
        id: 'running-balance',
        page: 1,
        entry: 2,
        currency: 'CHF',
        printed: 2204024,
        computed: 2204042,
        tolerance: 0,
      },
    })
  })

  it('refuses a statement with an entry missing (the totals no longer add up)', () => {
    const document = loadFixture('migros-bank-account')
    removeLines(document, 4, [120.95, 109.55, 98.75, 87.95])
    expect(refusal(document)).toMatchObject({
      reason: 'does-not-add-up',
      control: { id: 'debits-total' },
    })
  })

  it('refuses a summary block that disagrees with the table', () => {
    const document = loadFixture('migros-bank-account')
    replaceText(document, 1, "9'868.25", "9'868.20", 563.75)
    expect(refusal(document)).toMatchObject({
      control: { id: 'summary-debits', printed: 986820, computed: 986825 },
    })
  })

  it('refuses a card purchase whose amount in the text differs from the amount booked', () => {
    const document = loadFixture('migros-bank-account')
    replaceText(
      document,
      1,
      '498765******2031 Montant: CHF 2.01',
      '498765******2031 Montant: CHF 2.02',
      395.05,
    )
    expect(refusal(document)).toMatchObject({
      control: { id: 'card-purchase-amount', entry: 2, printed: 202, computed: 201 },
    })
  })

  it('refuses a foreign-currency purchase whose rate does not give the amount booked [R-IMPORT-097]', () => {
    const document = loadFixture('migros-bank-account')
    replaceText(
      document,
      2,
      'EUR 76.15 au cours de 0.918064',
      'EUR 76.15 au cours de 0.818064',
      288.25,
    )
    expect(refusal(document)).toMatchObject({
      control: { id: 'foreign-currency-amount', printed: 7230, tolerance: 5 },
    })
  })
})

describe('Migros Bank account: what the statement says a line is', () => {
  it('flags the card-bill payment and the transfer to the holder, skipped by default [R-IMPORT-212]', () => {
    const statement = parsed(loadFixture('migros-bank-account'))
    const flagged = statement.entries.filter((entry) => entry.handling === 'skip-by-default')
    expect(flagged.map((entry) => [entry.n, entry.hint, entry.amount])).toEqual([
      [25, 'card-bill-payment', 208011],
      [61, 'own-account-transfer', 35535],
    ])
    // A standing order to another person at the same address is not an own transfer (Q-063).
    expect(statement.entries[73]).toMatchObject({
      merchant: 'Nina Lichtensteiger',
      hint: null,
      handling: 'import',
    })
  })

  it('does not take a payment to the holder at another address for an own transfer [R-IMPORT-212]', () => {
    const document = loadFixture('migros-bank-account')
    replaceText(document, 4, 'Chemin du Test 12', 'Chemin du Test 14', 571.7)
    expect(parsed(document).entries[60]).toMatchObject({ hint: null, handling: 'import' })
  })

  it('proposes every other credit for review [R-IMPORT-213]', () => {
    const statement = parsed(loadFixture('migros-bank-account'))
    const credits = statement.entries.filter((entry) => entry.direction === 'credit')
    expect(credits.map((entry) => [entry.hint, entry.handling])).toEqual([
      [null, 'review-credit'],
      ['refund', 'review-credit'],
      ['salary', 'skip-if-matches-income'],
    ])
  })

  it('keeps the TWINT id as the bank transaction id, never the QR reference [R-IMPORT-101]', () => {
    const statement = parsed(loadFixture('migros-bank-account'))
    const twint = statement.entries.filter((entry) => entry.description.startsWith('TWINT '))
    expect(twint).toHaveLength(20)
    for (const entry of twint) expect(entry.bankTransactionId).toMatch(/^\d{16}$/)
    const payment = statement.entries[24]
    expect(payment?.details.paymentReference).toBe('000000000022094471308655120')
    expect(payment?.bankTransactionId).toBeNull()
    const others = statement.entries.filter((entry) => !entry.description.startsWith('TWINT '))
    for (const entry of others) expect(entry.bankTransactionId).toBeNull()
  })

  it('keeps purchase time, value date, card, original currency, rate and fee [R-IMPORT-214] [R-IMPORT-097]', () => {
    const statement = parsed(loadFixture('migros-bank-account'))
    const foreign = statement.entries[27]
    expect(foreign).toMatchObject({
      date: '2025-04-10',
      amount: 7230,
      description: 'GOVX VISAAPP0000482915 (EUR 76.15)',
      details: {
        bookingDate: '2025-04-14',
        valueDate: '2025-04-10',
        purchaseTime: '18:02',
        card: '498765******2031',
        original: { currency: 'EUR', amountMinor: 7615, amountText: '76.15', rate: '0.918064' },
        fee: { amount: 240, percent: null },
      },
    })
  })
})
