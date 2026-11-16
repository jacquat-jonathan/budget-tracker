// One test per control and guard of the Yuh parser: a derived variant with one figure or line
// changed must be refused by exactly that control or guard.
import { addItem, loadFixture, removeItem, replaceText, setItemX } from '@/test/statement-fixtures'

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
  const document = loadFixture('yuh-account')
  change(document)
  return document
}

describe('Yuh account: each printed figure is checked [R-IMPORT-088]', () => {
  it.each([
    ['opening-row', 2, '178.75', '178.85', 632.88, 17885, 17875],
    ['credits-total', 2, '284.00', '284.10', 689.52, 28410, 28400],
    ['closing-balance', 2, '282.47', '282.57', 675.36, 28257, 28247],
    ['closing-row', 2, '282.47', '282.57', 170.88, 28257, 28247],
    ['summary-currency-closing-balance', 1, '282.47', '282.57', 480.24, 28257, 28247],
    ['summary-opening-balance', 1, '178.75', '178.85', 646.8, 17885, 17875],
    ['summary-closing-balance', 1, '282.47', '282.57', 632.64, 28257, 28247],
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

describe('Yuh account: lines the table does not allow [R-IMPORT-087] [R-IMPORT-211]', () => {
  it('refuses a securities purchase in the credit column', () => {
    const document = variant((d) => {
      setItemX(d, 2, '45.07', 596.4, 360.48)
    })
    expect(refusal(document)).toMatchObject({ problem: 'malformed-entry', page: 2 })
  })

  it('refuses an incoming transfer in the debit column', () => {
    const document = variant((d) => {
      setItemX(d, 2, '284.00', 412.32, 272.16)
    })
    expect(refusal(document)).toMatchObject({ problem: 'malformed-entry', page: 2 })
  })

  it('refuses a debit and a credit on one row', () => {
    const document = variant((d) => {
      addItem(d, 2, '1.00', 362.72, 596.4, 14.04, 'f1')
    })
    expect(refusal(document)).toMatchObject({ problem: 'entry-with-several-amounts', page: 2 })
  })

  it('refuses an amount on a continuation line', () => {
    const document = variant((d) => {
      addItem(d, 2, '1.00', 284, 587.76, 14.04, 'f1')
    })
    expect(refusal(document)).toMatchObject({ problem: 'unexpected-line', page: 2 })
  })

  it('refuses a line after the closing row', () => {
    const document = variant((d) => {
      addItem(d, 2, 'Divers', 78.24, 150, 25, 'f1')
    })
    expect(refusal(document)).toMatchObject({ problem: 'unexpected-line', page: 2, text: 'Divers' })
  })

  it('refuses a second closing row', () => {
    const document = variant((d) => {
      addItem(d, 2, '31.08.2024', 31.2, 155, 37.39, 'f1')
      addItem(d, 2, 'Solde de clôture', 78.24, 155, 58.94, 'f3')
      addItem(d, 2, '282.47', 532.56, 155, 26.05, 'f3')
    })
    expect(refusal(document)).toMatchObject({ problem: 'unexpected-line', page: 2 })
  })

  it('refuses a row booked outside the period', () => {
    const document = variant((d) => {
      replaceText(d, 2, '13.08.2024', '13.09.2024', 504.48)
    })
    expect(refusal(document)).toMatchObject({ problem: 'entry-outside-period', page: 2 })
  })

  it('refuses an ISIN whose check digit is wrong', () => {
    const document = variant((d) => {
      replaceText(d, 2, 'ISIN: ZZX7F3Q9K2B8', 'ISIN: ZZX7F3Q9K2B9', 518.64)
    })
    expect(refusal(document)).toMatchObject({ problem: 'invalid-reference', page: 2 })
  })

  it('refuses a row without a reference, and one with two', () => {
    const without = variant((d) => {
      removeItem(d, 2, '3005893855', 596.4)
    })
    expect(refusal(without)).toMatchObject({ problem: 'missing-field', page: 2 })
    const twice = variant((d) => {
      addItem(d, 2, '1234567890', 160, 596.4, 40, 'f1')
    })
    expect(refusal(twice)).toMatchObject({ problem: 'unexpected-item', page: 2 })
  })
})

describe('Yuh account: the reference wherever its centring puts it [R-IMPORT-101]', () => {
  it('reads an 11-digit reference centred like the sample', () => {
    const document = variant((d) => {
      replaceText(d, 2, '3005893855', '30058938551', 596.4)
      setItemX(d, 2, '30058938551', 596.4, 225.35)
    })
    expect(entries(document)[0]).toMatchObject({
      bankTransactionId: '30058938551',
      hint: 'securities-purchase',
      description: 'Exempla Glb Eq Fund (EXWE)',
    })
  })

  it.each([-1.5, -0.75, 0.75, 1.5, -6, 6])('reads every reference moved by %d pt', (dx) => {
    const document = variant((d) => {
      for (const [reference, y] of [
        ['3005893855', 596.4],
        ['3008262728', 504.48],
        ['3011063676', 412.32],
        ['3015110363', 354.96],
        ['3016394923', 263.04],
      ] as const) {
        const item = d.pages[1]?.items.find(
          (candidate) => candidate[0] === reference && Math.abs(candidate[2] - y) < 1,
        )
        if (item) item[1] += dx
      }
    })
    expect(entries(document).map((entry) => [entry.bankTransactionId, entry.hint])).toEqual([
      ['3005893855', 'securities-purchase'],
      ['3008262728', 'securities-purchase'],
      ['3011063676', 'own-account-transfer'],
      ['3015110363', 'securities-purchase'],
      ['3016394923', 'securities-purchase'],
    ])
  })

  it('drops a reference that two rows carry [R-IMPORT-218]', () => {
    const document = variant((d) => {
      replaceText(d, 2, '3008262728', '3005893855', 504.48)
    })
    expect(entries(document).map((entry) => entry.bankTransactionId)).toEqual([
      null,
      null,
      '3011063676',
      '3015110363',
      '3016394923',
    ])
  })
})

describe('Yuh account: own transfers and descriptions', () => {
  it('does not take a transfer with the holder name from another address for an own transfer [R-IMPORT-212]', () => {
    const document = variant((d) => {
      replaceText(d, 2, 'Chemin du Test, 12', 'Chemin Autre, 5', 395.04)
    })
    expect(entries(document)[2]).toMatchObject({ hint: null, handling: 'review-credit' })
  })

  it('describes an entry of an unknown type by its label only, keeping the rest in its lines [R-IMPORT-211]', () => {
    const document = variant((d) => {
      replaceText(d, 2, 'Virement de', 'Dividende', 412.32)
    })
    const entry = entries(document)[2]
    expect(entry).toMatchObject({ description: 'Dividende', merchant: null, hint: null })
    expect(entry?.textLines).toContain('CH2408401000041302776')
  })
})
