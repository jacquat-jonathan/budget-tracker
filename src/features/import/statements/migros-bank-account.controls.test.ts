// One test per control and guard of the Migros Bank account parser: a derived variant with one
// figure or line changed must be refused by exactly that control or guard.
import {
  addItem,
  adjustColumn,
  loadFixture,
  removeItem,
  removeLines,
  replaceText,
  setItemX,
} from '@/test/statement-fixtures'

import { parseStatementDocument } from './parse-statement'
import type { StatementEntry, StatementRefusal, StatementTextDocument } from './types'

function refusal(document: StatementTextDocument): StatementRefusal {
  const result = parseStatementDocument(document)
  if (result.ok) throw new Error('expected a refusal')
  return result.refusal
}

function entries(document: StatementTextDocument): StatementEntry[] {
  const result = parseStatementDocument(document)
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.refusal)}`)
  return result.statement.entries
}

function variant(change: (document: StatementTextDocument) => void): StatementTextDocument {
  const document = loadFixture('migros-bank-account')
  change(document)
  return document
}

describe('Migros Bank account: each printed figure is checked [R-IMPORT-088]', () => {
  it.each([
    ['credits-total', 4, "5'584.50", "5'584.55", 75, 558455, 558450],
    ['closing-balance', 4, "17'130.38", "17'130.33", 75, 1713033, 1713038],
    ['final-balance', 4, "17'130.38", "17'130.33", 49.1, 1713033, 1713038],
    ['summary-opening-balance', 1, "21'414.13", "21'414.10", 574.7, 2141410, 2141413],
    ['summary-debits', 1, "9'868.25", "9'868.20", 563.75, 986820, 986825],
    ['summary-credits', 1, "5'584.50", "5'584.55", 552.95, 558455, 558450],
    ['summary-closing-balance', 1, "17'130.38", "17'130.30", 542.15, 1713030, 1713038],
  ] as const)('refuses through %s', (id, page, from, to, y, printed, computed) => {
    const document = variant((d) => {
      replaceText(d, page, from, to, y)
    })
    expect(refusal(document)).toMatchObject({
      reason: 'does-not-add-up',
      control: { id, printed, computed },
    })
  })
})

describe('Migros Bank account: an entry must sit in the column its label names [R-IMPORT-211]', () => {
  it.each([
    ['a card purchase in the credit column', 1, '2.01', 405.95, 461.45],
    ['a TWINT debit in the credit column', 1, '99.25', 237.95, 456.75],
    ['a payment in the credit column', 2, "2'080.11", 425.9, 445.8],
    ['a salary in the debit column', 3, "4'952.95", 52.55, 380.6],
  ] as const)('refuses %s', (_label, page, amount, y, x) => {
    const document = variant((d) => {
      setItemX(d, page, amount, y, x)
    })
    expect(refusal(document)).toMatchObject({ problem: 'malformed-entry', page })
  })
})

describe('Migros Bank account: lines the table does not allow [R-IMPORT-087]', () => {
  it('refuses a dated line without an amount', () => {
    const document = variant((d) => {
      removeItem(d, 1, '2.01', 405.95)
    })
    expect(refusal(document)).toMatchObject({ problem: 'entry-without-amount', page: 1 })
  })

  it('refuses a debit and a credit on one entry', () => {
    const document = variant((d) => {
      addItem(d, 1, '1.00', 461.45, 405.95, 16.05)
    })
    expect(refusal(document)).toMatchObject({ problem: 'entry-with-several-amounts', page: 1 })
  })

  it('refuses two balances on one entry', () => {
    const document = variant((d) => {
      addItem(d, 2, "17'139.29", 514.45, 425.9, 36.85)
    })
    expect(refusal(document)).toMatchObject({ problem: 'entry-with-several-amounts', page: 2 })
  })

  it('refuses an entry before the opening balance', () => {
    const document = variant((d) => {
      addItem(d, 1, '01.04.25', 72.25, 452, 32.45)
      addItem(d, 1, 'Divers', 111.85, 452, 25)
      addItem(d, 1, '1.00', 396.25, 452, 16.05)
    })
    expect(refusal(document)).toMatchObject({ problem: 'unexpected-line', page: 1 })
  })

  it('refuses a line between the totals and the final balance', () => {
    const document = variant((d) => {
      addItem(d, 4, 'Divers', 111.85, 62, 25)
    })
    expect(refusal(document)).toMatchObject({ problem: 'unexpected-line', page: 4 })
  })

  it('refuses a line after the final balance', () => {
    const document = variant((d) => {
      addItem(d, 4, 'Divers', 111.85, 36, 25)
    })
    expect(refusal(document)).toMatchObject({ problem: 'unexpected-line', page: 4, text: 'Divers' })
  })

  it('refuses an entry between the totals and the final balance', () => {
    const document = variant((d) => {
      addItem(d, 4, '30.04.25', 72.25, 62, 32.45)
      addItem(d, 4, 'Divers', 111.85, 62, 25)
      addItem(d, 4, '1.00', 396.25, 62, 16.05)
    })
    expect(refusal(document)).toMatchObject({ problem: 'unexpected-line', page: 4 })
  })

  it('refuses a second final balance', () => {
    const document = variant((d) => {
      addItem(d, 4, 'Solde final', 111.85, 36, 42.65, 'f1')
      addItem(d, 4, "17'130.38", 514.7, 36, 36.6, 'f1')
    })
    expect(refusal(document)).toMatchObject({ problem: 'unexpected-line', page: 4 })
  })

  it('refuses totals dated otherwise than the end of the period', () => {
    const document = variant((d) => {
      replaceText(d, 4, 'Solde au 30.04.2025', 'Solde au 29.04.2025', 75)
    })
    expect(refusal(document)).toMatchObject({ problem: 'inconsistent-document' })
  })

  it('refuses an amount a few points beyond its column (outside the 4 pt tolerance)', () => {
    const document = variant((d) => {
      addItem(d, 1, '1.00', 404.25, 395.05, 16.05) // right edge 420.3, the column ends at 412.3
    })
    expect(refusal(document)).toMatchObject({ problem: 'unexpected-item', page: 1 })
  })

  it('refuses a rotated item inside the table, and ignores one outside it', () => {
    const inside = variant((d) => {
      d.pages[0]?.items.push([
        'X',
        250,
        405.95,
        5,
        9,
        'f2',
        0,
        { transform: [0, 9, -9, 0, 250, 405.95] },
      ])
    })
    expect(refusal(inside)).toMatchObject({ problem: 'unexpected-item', page: 1 })
    const rightToLeft = variant((d) => {
      d.pages[0]?.items.push(['X', 250, 405.95, 5, 9, 'f2', 0, { dir: 'rtl' }])
    })
    expect(refusal(rightToLeft)).toMatchObject({ problem: 'unexpected-item', page: 1 })
    const outside = variant((d) => {
      d.pages[0]?.items.push([
        'REF 123',
        20,
        600,
        5,
        9,
        'f2',
        0,
        { transform: [0, 9, -9, 0, 20, 600] },
      ])
    })
    expect(entries(outside)).toHaveLength(78)
  })
})

describe('Migros Bank account: own transfers need the holder name and address [R-IMPORT-212]', () => {
  it('does not take a payee with only the street of the holder for the holder', () => {
    const document = variant((d) => {
      removeLines(d, 4, [560.9])
    })
    expect(entries(document)[60]).toMatchObject({ hint: null, handling: 'import' })
  })

  it('does not take a payee sharing one word of the holder name for the holder', () => {
    const document = variant((d) => {
      replaceText(d, 4, 'Mustermann Jonas', 'Jonas Exemple', 582.5)
    })
    expect(entries(document)[60]).toMatchObject({ hint: null, handling: 'import' })
  })

  it.each(['VISECA PAYMENT SERVICES SA', 'Viseca Card Services SA'])(
    'recognises a card-bill payment to %s',
    (payee) => {
      const document = variant((d) => {
        replaceText(d, 2, 'Viseca Payment Services SA', payee, 414.5)
      })
      expect(entries(document)[24]).toMatchObject({
        hint: 'card-bill-payment',
        handling: 'skip-by-default',
      })
    },
  )
})

describe('Migros Bank account: identical entries and repeated ids', () => {
  it('keeps two identical TWINT payments with their own ids, in order', () => {
    const document = variant((d) => {
      // A second "Webshop Direct" payment of 99.25 on the same day, with another id.
      addItem(d, 1, '04.04.25', 72.25, 231.4, 32.45)
      addItem(d, 1, 'Débit TWINT Webshop Direct 0400007210607737', 111.85, 231.4, 187.65)
      addItem(d, 1, '04.04.25', 310.3, 231.4, 32.45)
      addItem(d, 1, '99.25', 391.55, 231.4, 20.75)
      // Every balance printed from that day on, the totals and the summary follow.
      adjustColumn(d, [{ page: 1, below: 231 }], 551.2, -9925)
      adjustColumn(
        d,
        [2, 3, 4].map((page) => ({ page, below: 1000 })),
        551.2,
        -9925,
      )
      replaceText(d, 4, "9'868.25", "9'967.50", 75)
      replaceText(d, 1, "9'868.25", "9'967.50", 563.75)
      replaceText(d, 1, "17'130.38", "17'031.13", 542.15)
    })
    const list = entries(document)
    expect(list).toHaveLength(79)
    expect(
      list
        .slice(8, 10)
        .map((entry) => [entry.n, entry.description, entry.amount, entry.bankTransactionId]),
    ).toEqual([
      [9, 'TWINT Webshop Direct', 9925, '0400007210607736'],
      [10, 'TWINT Webshop Direct', 9925, '0400007210607737'],
    ])
  })

  it('drops an id that two entries carry: it identifies neither [R-IMPORT-218]', () => {
    const document = variant((d) => {
      replaceText(d, 1, '0400007210982559', '0400007210856417', 213.95)
    })
    const list = entries(document)
    expect(list[9]?.bankTransactionId).toBeNull()
    expect(list[10]?.bankTransactionId).toBeNull()
    expect(list[8]?.bankTransactionId).toBe('0400007210607736')
    expect(list).toHaveLength(78)
  })
})

describe('Migros Bank account: purchase dates must be plausible [R-IMPORT-217]', () => {
  it.each([
    ['02.04.2052', 'purchase-after-booking', '2052-04-02'],
    ['02.04.2023', 'purchase-long-before-booking', '2023-04-02'],
  ] as const)('refuses a purchase dated %s', (date, control, purchaseDate) => {
    const document = variant((d) => {
      replaceText(
        d,
        1,
        'Achat Animalia Boutique AG 02.04.2025 21:20',
        `Achat Animalia Boutique AG ${date} 21:20`,
        261.95,
      )
    })
    expect(refusal(document)).toEqual({
      reason: 'implausible-date',
      source: 'migros-bank-account',
      control,
      entry: 8,
      page: 1,
      purchaseDate,
      bookingDate: '2025-04-04',
    })
  })

  it('accepts a purchase 366 days before its booking', () => {
    const document = variant((d) => {
      replaceText(
        d,
        1,
        'Achat Animalia Boutique AG 02.04.2025 21:20',
        'Achat Animalia Boutique AG 03.04.2024 21:20',
        261.95,
      )
    })
    expect(entries(document)[7]?.date).toBe('2024-04-03')
  })
})

describe('Migros Bank account: descriptions carry no third-party data [R-IMPORT-211]', () => {
  it('describes an entry of an unknown type by its first line only', () => {
    const document = variant((d) => {
      replaceText(d, 4, 'Ordre permanent', 'Virement SEPA', 238.45)
    })
    const entry = entries(document)[73]
    expect(entry).toMatchObject({ description: 'Virement SEPA', merchant: null, hint: null })
    expect(entry?.textLines).toEqual([
      'Virement SEPA',
      'Nina Lichtensteiger',
      'Chemin du Test 12',
      '1599 Monts',
    ])
  })

  it('never puts a phone number, an address line or a reference into a description', () => {
    for (const entry of entries(loadFixture('migros-bank-account'))) {
      expect(entry.description).not.toMatch(
        /\+\d{6,}|\b\d{4} [A-ZÉ][a-zé]+$|\d{2} \d{5} \d{5}|\b0400\d{12}\b/,
      )
      if (entry.details.counterparty && 'address' in entry.details.counterparty) {
        for (const line of entry.details.counterparty.address) {
          expect(entry.description).not.toContain(line)
        }
      }
    }
  })

  it('marks a TWINT payment to a person, not one to a merchant or from a person', () => {
    const list = entries(loadFixture('migros-bank-account'))
    const twint = list.filter((entry) => entry.bankTransactionId !== null)
    for (const entry of twint) {
      const person = entry.details.counterparty?.type === 'person'
      expect(entry.hint).toBe(person && entry.direction === 'debit' ? 'transfer-to-person' : null)
    }
    expect(twint.filter((entry) => entry.hint === 'transfer-to-person')).toHaveLength(12)
  })
})
