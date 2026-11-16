import {
  FIXTURE_NAMES,
  loadFixture,
  replaceText,
  type FixtureName,
} from '@/test/statement-fixtures'

import {
  chunkRows,
  DETAILS_DROP_ORDER,
  IMPORT_ROW_KEYS,
  MAX_DETAILS_BYTES,
  toImportBatch,
  type ImportBatch,
} from './import-rows'
import { parseStatementDocument } from './parse-statement'
import type { StatementParse, StatementTextDocument } from './types'

const DETAIL_KEYS = [
  'purchase_time',
  'booking_date',
  'value_date',
  'card',
  'original_currency',
  'original_amount',
  'exchange_rate',
  'fee',
  'merchant_category',
  'security',
  'location',
]
const HINTS = [
  'card_bill_payment',
  'own_transfer',
  'transfer_to_person',
  'salary',
  'interest',
  'fee',
  'securities_purchase',
  'cash_withdrawal',
  'refund',
]

function parse(document: StatementTextDocument): StatementParse {
  const result = parseStatementDocument(document)
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.refusal)}`)
  return result.statement
}

/** Every string a parse holds that must never reach the database. */
function forbiddenStrings(statement: StatementParse): string[] {
  const out: string[] = []
  const { document } = statement
  const holder = document.statement.holder
  if (holder) out.push(holder, ...holder.split(/[ ,]+/).filter((word) => word.length > 3))
  for (const entry of statement.entries) {
    const counterparty = entry.details.counterparty
    if (counterparty && 'phone' in counterparty && counterparty.phone) out.push(counterparty.phone)
    if (counterparty && 'address' in counterparty) out.push(...counterparty.address)
    if (counterparty && 'iban' in counterparty && counterparty.iban) out.push(counterparty.iban)
    if (entry.details.paymentReference) out.push(entry.details.paymentReference)
  }
  if ('iban' in document.statement && document.statement.iban) out.push(document.statement.iban)
  return out.filter((text) => text.length >= 4)
}

function checkContract(batch: ImportBatch): void {
  for (const { row } of batch.rows) {
    for (const key of Object.keys(row)) expect(IMPORT_ROW_KEYS).toContain(key)
    expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Number.isSafeInteger(row.amount) && row.amount >= 1 && row.amount <= 1_000_000_000).toBe(
      true,
    )
    expect(['debit', 'credit']).toContain(row.direction)
    if (row.description !== undefined) {
      expect(Array.from(row.description).length).toBeLessThanOrEqual(500)
      expect(row.description).toBe(row.description.trim())
    }
    if (row.merchant !== undefined) expect(Array.from(row.merchant).length).toBeLessThanOrEqual(200)
    if (row.bank_transaction_id !== undefined)
      expect(row.bank_transaction_id.length).toBeLessThanOrEqual(100)
    if (row.hint !== undefined) expect(HINTS).toContain(row.hint)
    if (row.details !== undefined) {
      expect(new TextEncoder().encode(JSON.stringify(row.details)).length).toBeLessThanOrEqual(2000)
      for (const [key, value] of Object.entries(row.details)) {
        expect(DETAIL_KEYS).toContain(key)
        expect(['string', 'number']).toContain(typeof value)
        if (typeof value === 'number') expect(Number.isSafeInteger(value)).toBe(true)
      }
    }
  }
}

describe('statement entries to the import function rows [R-IMPORT-219]', () => {
  it.each(FIXTURE_NAMES)('%s: rows hold only the contract keys, in statement order', (name) => {
    const statement = parse(loadFixture(name))
    const batch = toImportBatch(statement)
    checkContract(batch)
    expect(batch.rows.map(({ n }) => n)).toEqual(
      statement.entries.filter((entry) => entry.amount > 0).map((entry) => entry.n),
    )
    for (const { n, row } of batch.rows) {
      const entry = statement.entries[n - 1]
      expect(row.date).toBe(entry?.date)
      expect(row.amount).toBe(entry?.amount)
      expect(row.direction).toBe(entry?.direction)
    }
  })

  it.each(FIXTURE_NAMES)(
    '%s: no counterparty detail, text line, reference, balance or holder identity in a row',
    (name) => {
      const statement = parse(loadFixture(name))
      const batch = toImportBatch(statement)
      const json = JSON.stringify(batch.rows)
      for (const text of forbiddenStrings(statement)) expect(json).not.toContain(text)
      for (const entry of statement.entries) {
        const balance = entry.details.balanceAfter
        if (balance !== null) expect(json).not.toMatch(new RegExp(`[:\\[,]${balance}[,\\]}]`))
        // A text line travels only as one of the row's own fields (an id, a category ...).
        const row = batch.rows.find(({ n }) => n === entry.n)?.row
        const detailValues: unknown[] = row?.details ? Object.values(row.details) : []
        const fields = new Set<unknown>([
          row?.description,
          row?.merchant,
          row?.bank_transaction_id,
          ...detailValues,
        ])
        for (const line of entry.textLines.slice(1)) {
          const inDescription = (row?.description ?? '').includes(line)
          if (!fields.has(line) && !inDescription && line.length > 12) {
            expect(json).not.toContain(line)
          }
        }
      }
    },
  )

  it('maps sources, statement dates and hints', () => {
    const batches = Object.fromEntries(
      FIXTURE_NAMES.map((name) => [name, toImportBatch(parse(loadFixture(name)))]),
    ) as Record<FixtureName, ImportBatch>
    expect(
      FIXTURE_NAMES.map((name) => {
        const batch = batches[name]
        return [batch.source, batch.statementFrom, batch.statementTo, batch.rows.length]
      }),
    ).toEqual([
      ['migros_account', '2025-04-01', '2025-04-30', 78],
      ['migros_card', '2025-05-13', '2025-06-12', 17],
      ['yuh', '2024-08-01', '2024-08-31', 5],
    ])
    const account = batches['migros-bank-account']
    const hints = account.rows.map(({ row }) => row.hint).filter((hint) => hint !== undefined)
    expect(new Set(hints)).toEqual(
      new Set(['card_bill_payment', 'own_transfer', 'transfer_to_person', 'salary', 'refund']),
    )
    // The own transfer goes without the holder's name.
    const own = account.rows.find(({ row }) => row.hint === 'own_transfer')
    expect(own?.row).toEqual({
      date: '2025-04-25',
      amount: 35535,
      direction: 'debit',
      hint: 'own_transfer',
      details: { booking_date: '2025-04-25', value_date: '2025-04-25' },
    })
    expect(account.rows[0]?.row.bank_transaction_id).toBe('0400007210353926')
    expect(account.rows[24]?.row).not.toHaveProperty('bank_transaction_id')
  })

  it('encodes foreign amounts as integers with their currency, and the rate as printed', () => {
    const card = toImportBatch(parse(loadFixture('migros-bank-credit-card')))
    expect(card.rows.find(({ n }) => n === 3)?.row).toEqual({
      date: '2025-05-18',
      amount: 28010,
      direction: 'debit',
      description: 'TRV*STAYFINDERS LODGE (EUR 304.48)',
      merchant: 'TRV*STAYFINDERS LODGE',
      details: {
        booking_date: '2025-05-19',
        card: '4999 12XX XXXX 3456',
        original_currency: 'EUR',
        original_amount: 30448,
        exchange_rate: '0.9041442',
        fee: 480,
        merchant_category: 'Agences de voyage',
        location: '(800)555-0199 IE',
      },
    })
    const yuh = toImportBatch(parse(loadFixture('yuh-account')))
    expect(yuh.rows[0]?.row).toEqual({
      date: '2024-08-06',
      amount: 4507,
      direction: 'debit',
      description: 'Exempla Glb Eq Fund (EXWE)',
      merchant: 'Exempla Glb Eq Fund (EXWE)',
      bank_transaction_id: '3005893855',
      hint: 'securities_purchase',
      details: { booking_date: '2024-08-06', value_date: '2024-08-08', security: 'ZZX7F3Q9K2B8' },
    })
  })

  it('sends no row for an entry of 0.00 [R-IMPORT-220]', () => {
    const card = toImportBatch(parse(loadFixture('migros-bank-credit-card')))
    expect(card.notSent).toEqual([{ n: 15, code: 'zero-amount' }])
    expect(card.rows.some(({ n }) => n === 15)).toBe(false)
  })
})

describe('rows are made to fit the contract, and say so [R-IMPORT-219]', () => {
  function statementWith(change: (statement: StatementParse) => void): StatementParse {
    const statement = parse(loadFixture('migros-bank-credit-card'))
    change(statement)
    return statement
  }

  it('cuts a long description and merchant at a character boundary', () => {
    const batch = toImportBatch(
      statementWith((statement) => {
        const entry = statement.entries[1]
        if (!entry) return
        entry.description = `  ${'😀'.repeat(600)}  `
        entry.merchant = 'é'.repeat(250)
      }),
    )
    const row = batch.rows.find(({ n }) => n === 2)?.row
    expect(Array.from(row?.description ?? '')).toHaveLength(500)
    expect(row?.description).toBe('😀'.repeat(500))
    expect(row?.merchant).toBe('é'.repeat(200))
    expect(batch.adjustments).toEqual([
      { n: 2, field: 'description', change: 'truncated' },
      { n: 2, field: 'merchant', change: 'truncated' },
    ])
    checkContract(batch)
  })

  it('drops details in the stated order until they fit 2000 bytes', () => {
    const batch = toImportBatch(
      statementWith((statement) => {
        const entry = statement.entries[2]
        if (!entry) return
        entry.details.category = 'x'.repeat(1_900)
      }),
    )
    const row = batch.rows.find(({ n }) => n === 3)?.row
    expect(batch.adjustments).toEqual([
      { n: 3, field: 'details', change: 'dropped', keys: ['location', 'merchant_category'] },
    ])
    expect(row?.details).toEqual({
      booking_date: '2025-05-19',
      card: '4999 12XX XXXX 3456',
      original_currency: 'EUR',
      original_amount: 30448,
      exchange_rate: '0.9041442',
      fee: 480,
    })
    expect(DETAILS_DROP_ORDER[0]).toBe('location')
    expect(new TextEncoder().encode(JSON.stringify(row?.details)).length).toBeLessThanOrEqual(
      MAX_DETAILS_BYTES,
    )
  })

  it('drops a bank id too long for the contract rather than shortening it', () => {
    const statement = parse(loadFixture('yuh-account'))
    const entry = statement.entries[0]
    if (entry) entry.bankTransactionId = '9'.repeat(101)
    const batch = toImportBatch(statement)
    expect(batch.rows[0]?.row).not.toHaveProperty('bank_transaction_id')
    expect(batch.adjustments).toEqual([{ n: 1, field: 'bank_transaction_id', change: 'dropped' }])
  })

  it('sends no row for an amount above the contract bound', () => {
    const batch = toImportBatch(
      statementWith((statement) => {
        const entry = statement.entries[1]
        if (entry) entry.amount = 1_000_000_001
      }),
    )
    expect(batch.notSent).toContainEqual({ n: 2, code: 'amount-too-large' })
  })

  it('keeps the contract on derived variants too', () => {
    const document = loadFixture('yuh-account')
    replaceText(document, 2, 'Virement de', 'Dividende', 412.32)
    const batch = toImportBatch(parse(document))
    checkContract(batch)
    expect(JSON.stringify(batch.rows)).not.toContain('CH2408401000041302776')
    expect(batch.rows[2]?.row.description).toBe('Dividende')
  })

  it('splits rows into chunks of at most 500', () => {
    const rows = Array.from({ length: 1_201 }, (_, i) => i)
    expect(chunkRows(rows).map((chunk) => chunk.length)).toEqual([500, 500, 201])
    expect(chunkRows([])).toEqual([])
  })
})
