import {
  dateFormatsFor,
  detectDecimal,
  guessMapping,
  mapRecords,
  parseCsvAmount,
  parseCsvDate,
  type CsvMapping,
} from './csv-map'
import { detectSeparator, parseCsv } from './csv-parse'

const base: CsvMapping = {
  hasHeader: true,
  date: 0,
  dateFormat: 'dd.mm.yyyy',
  amountMode: 'signed',
  amount: 2,
  negativeMeans: 'debit',
  debit: null,
  credit: null,
  decimal: '.',
  description: 1,
  merchant: null,
  bankId: null,
}

describe('reading CSV text [R-IMPORT-082] [R-IMPORT-324]', () => {
  it('reads quotes, doubled quotes, separators and line breaks inside a cell, a BOM and CRLF', () => {
    const text =
      '\ufeffDate;Text;Amount\r\n01.11.2026;"Bakery; ""Le Pain""\r\nsecond line";-4.50\r\n\r\n02.11.2026;Plain;3\r\n'
    const { records, unclosedQuoteAt } = parseCsv(text, ';')
    expect(unclosedQuoteAt).toBeNull()
    expect(records).toEqual([
      { line: 1, cells: ['Date', 'Text', 'Amount'] },
      { line: 2, cells: ['01.11.2026', 'Bakery; "Le Pain"\nsecond line', '-4.50'] },
      { line: 5, cells: ['02.11.2026', 'Plain', '3'] },
    ])
  })

  it('detects the separator among semicolon, comma and tab, and says when it cannot', () => {
    expect(detectSeparator('a;b;c\n1;2;3\n4;5;6\n')).toBe(';')
    expect(detectSeparator('a,b,c\n1,2,3\n4,5,6\n')).toBe(',')
    expect(detectSeparator('a\tb\tc\n1\t2\t3\n')).toBe('\t')
    // A decimal comma inside semicolon-separated cells does not fool it.
    expect(detectSeparator('Date;Amount\n01.11.2026;-4,50\n02.11.2026;3,00\n')).toBe(';')
    expect(detectSeparator('just one column\nand another\n')).toBeNull()
  })

  it('stops at a quote that is never closed and says on which line', () => {
    const { records, unclosedQuoteAt } = parseCsv('a;b\n1;"open\n2;3\n', ';')
    expect(unclosedQuoteAt).toBe(2)
    expect(records).toHaveLength(1)
  })
})

describe('mapping CSV columns to rows [R-IMPORT-082] [R-IMPORT-324]', () => {
  it('turns amounts into integer rappen in both decimal styles, with grouping and signs', () => {
    expect(parseCsvAmount("1'234.50", '.')).toEqual({ ok: true, rappen: 123_450 })
    expect(parseCsvAmount('1’234.50', '.')).toEqual({ ok: true, rappen: 123_450 })
    expect(parseCsvAmount('1 234,50', ',')).toEqual({ ok: true, rappen: 123_450 })
    expect(parseCsvAmount('1.234,5', ',')).toEqual({ ok: true, rappen: 123_450 })
    expect(parseCsvAmount('1,234.50', '.')).toEqual({ ok: true, rappen: 123_450 })
    expect(parseCsvAmount('-0.10', '.')).toEqual({ ok: true, rappen: -10 })
    expect(parseCsvAmount('12.50-', '.')).toEqual({ ok: true, rappen: -1_250 })
    expect(parseCsvAmount('(7.05)', '.')).toEqual({ ok: true, rappen: -705 })
    expect(parseCsvAmount('CHF 0.29', '.')).toEqual({ ok: true, rappen: 29 })
    // 0.1 + 0.2 would not be 0.3 in floating point; here every amount is exact.
    expect(parseCsvAmount('0.30', '.')).toEqual({ ok: true, rappen: 30 })
    expect(parseCsvAmount('12.500', '.')).toEqual({ ok: true, rappen: 1_250 })
    expect(parseCsvAmount('12.505', '.')).toEqual({ ok: false, problem: 'amount-too-precise' })
    expect(parseCsvAmount('1.234,50', '.')).toEqual({ ok: false, problem: 'amount-unreadable' })
    expect(parseCsvAmount('12,5', '.')).toEqual({ ok: false, problem: 'amount-unreadable' })
    expect(parseCsvAmount('abc', '.')).toEqual({ ok: false, problem: 'amount-unreadable' })
    expect(detectDecimal(['-4,50', '3,00'])).toBe(',')
    expect(detectDecimal(['-4.50', "1'000.00"])).toBe('.')
    expect(detectDecimal(['12', '7'])).toBeNull()
  })

  it('reads dates as calendar dates, and never decides 03.04 alone', () => {
    expect(parseCsvDate('03.04.2026', 'dd.mm.yyyy')).toBe('2026-04-03')
    expect(parseCsvDate('03.04.2026', 'mm.dd.yyyy')).toBe('2026-03-04')
    expect(parseCsvDate('3.4.26', 'dd.mm.yy')).toBe('2026-04-03')
    expect(parseCsvDate('2026-04-03T00:00:00', 'yyyy-mm-dd')).toBe('2026-04-03')
    expect(parseCsvDate('31.02.2026', 'dd.mm.yyyy')).toBeNull()
    // Every day is 12 or less: both orders read every date, the user must choose.
    expect(dateFormatsFor(['03.04.2026', '11.12.2026'])).toEqual(['dd.mm.yyyy', 'mm.dd.yyyy'])
    // One day above 12 settles it.
    expect(dateFormatsFor(['03.04.2026', '25.12.2026'])).toEqual(['dd.mm.yyyy'])
    const header = ['Datum', 'Text', 'Betrag']
    const records = parseCsv('Datum;Text;Betrag\n03.04.2026;A;-1\n11.12.2026;B;-2\n', ';').records
    expect(guessMapping(header, records.slice(1)).dateFormat).toBeNull()
  })

  it('says what a negative amount is, or reads money out and money in from two columns', () => {
    const records = parseCsv(
      'Date;Text;Amount\n01.11.2026;Shop;-4.50\n02.11.2026;Refund;3.00\n',
      ';',
    ).records
    expect(mapRecords(records, base).rows.map(({ row }) => [row.direction, row.amount])).toEqual([
      ['debit', 450],
      ['credit', 300],
    ])
    expect(
      mapRecords(records, { ...base, negativeMeans: 'credit' }).rows.map(
        ({ row }) => row.direction,
      ),
    ).toEqual(['credit', 'debit'])
    const split = parseCsv(
      'Date;Text;Out;In\n01.11.2026;Shop;4.50;\n02.11.2026;Pay;;100.00\n03.11.2026;Both;1.00;2.00\n',
      ';',
    ).records
    const mapped = mapRecords(split, {
      ...base,
      amountMode: 'split',
      amount: null,
      debit: 2,
      credit: 3,
    })
    expect(mapped.rows.map(({ line, row }) => [line, row.direction, row.amount])).toEqual([
      [2, 'debit', 450],
      [3, 'credit', 10_000],
    ])
    expect(mapped.problems).toEqual([{ line: 4, problem: 'amount-both' }])
  })

  it('lists every line it cannot read with its line number and reason, and sends none of them', () => {
    const text = [
      'Date;Text;Amount',
      '01.11.2026;Good;-1.00',
      ';No date;-1.00',
      '32.11.2026;Bad date;-1.00',
      '02.11.2026;No amount;',
      '02.11.2026;Zero;0.00',
      '02.11.2026;Too precise;1.005',
      '02.11.2026;Too large;-10000000.01',
      '02.11.2026;Short',
    ].join('\n')
    const mapped = mapRecords(parseCsv(text, ';').records, base)
    expect(mapped.rows.map(({ line }) => line)).toEqual([2])
    expect(mapped.problems).toEqual([
      { line: 3, problem: 'date-missing' },
      { line: 4, problem: 'date-unreadable' },
      { line: 5, problem: 'amount-missing' },
      { line: 6, problem: 'amount-zero' },
      { line: 7, problem: 'amount-too-precise' },
      { line: 8, problem: 'amount-too-large' },
      { line: 9, problem: 'too-few-cells' },
    ])
  })

  it('sends only the contract’s keys, text cut at a character boundary, a too long id left out', () => {
    const long = 'é'.repeat(600)
    const text = `Date;Text;Amount;Ref\n01.11.2026;${long};-1.00;${'x'.repeat(101)}\n`
    const mapped = mapRecords(parseCsv(text, ';').records, { ...base, bankId: 3 })
    const [first] = mapped.rows
    expect(Object.keys(first?.row ?? {}).sort()).toEqual([
      'amount',
      'date',
      'description',
      'direction',
    ])
    expect(Array.from(first?.row.description ?? '')).toHaveLength(500)
    expect(first?.adjustments).toEqual(['description-truncated', 'bank-id-dropped'])
  })
})
