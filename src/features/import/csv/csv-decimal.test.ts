import { decodeCsvBytes } from './csv-decode'
import {
  amountCells,
  decimalEvidence,
  decimalSays,
  decimalToUse,
  guessMapping,
  looksLikeData,
  mapRecords,
  parseCsvAmount,
  type CsvMapping,
} from './csv-map'
import { readRememberedMapping, rememberMapping } from './csv-mapping-storage'
import { parseCsv } from './csv-parse'

const base: CsvMapping = {
  hasHeader: true,
  date: 0,
  dateFormat: 'dd.mm.yyyy',
  amountMode: 'signed',
  amount: 1,
  negativeMeans: 'debit',
  debit: null,
  credit: null,
  decimal: null,
  description: 2,
  merchant: null,
  bankId: null,
}

const cells = (...texts: string[]) => texts.map((text, index) => ({ line: index + 2, text }))

describe('the decimal mark is read from the amounts or asked, never assumed [R-IMPORT-324]', () => {
  it('says what each amount tells about the mark', () => {
    // One mark followed by three digits: thousands or decimals, both readings possible.
    expect(decimalSays('-1.200')).toBe('ambiguous')
    expect(decimalSays('1,200')).toBe('ambiguous')
    expect(decimalSays('-2.000')).toBe('ambiguous')
    // Two decimals, both marks, or one mark twice: one reading only.
    expect(decimalSays("1'234.50")).toBe('.')
    expect(decimalSays('1.234,50')).toBe(',')
    expect(decimalSays('1,234.50')).toBe('.')
    expect(decimalSays('1.234.567')).toBe(',')
    expect(decimalSays('(12.50)')).toBe('.')
    expect(decimalSays('12,5')).toBe(',')
    // No mark: the same value either way.
    expect(decimalSays('-350')).toBe('either')
    expect(decimalSays("1'234")).toBe('either')
    expect(decimalSays('abc')).toBe('unreadable')
  })

  it('reads each amount with the mark once it is known', () => {
    expect(parseCsvAmount('-1.200', ',')).toEqual({ ok: true, rappen: -120_000 })
    expect(parseCsvAmount('1,200', '.')).toEqual({ ok: true, rappen: 120_000 })
    expect(parseCsvAmount('1,200', ',')).toEqual({ ok: true, rappen: 120 })
    expect(parseCsvAmount("1'234.50", '.')).toEqual({ ok: true, rappen: 123_450 })
    expect(parseCsvAmount('1.234,50', ',')).toEqual({ ok: true, rappen: 123_450 })
    expect(parseCsvAmount('(12.50)', '.')).toEqual({ ok: true, rappen: -1_250 })
    expect(parseCsvAmount('-350', '.')).toEqual({ ok: true, rappen: -35_000 })
    expect(parseCsvAmount('-350', ',')).toEqual({ ok: true, rappen: -35_000 })
  })

  it('asks when no amount settles it, and never reads -1.200 as 1.20 meanwhile', () => {
    const evidence = decimalEvidence(cells('-1.200', '-2.000', '-350'))
    expect(evidence.state).toBe('undecided')
    expect(evidence.ambiguous.map(({ line }) => line)).toEqual([2, 3])
    expect(decimalToUse(evidence, null)).toBeNull()
    // The member's choice decides it.
    expect(decimalToUse(evidence, ',')).toBe(',')
    const records = parseCsv(
      'Date;Amount;Text\n15.03.2026;-1.200;Rent\n16.03.2026;-2.000;Car\n17.03.2026;-350;Fee\n',
      ';',
    ).records
    expect(guessMapping(['Date', 'Amount', 'Text'], records.slice(1)).decimal).toBeNull()
    // Without a mark the mapping is not complete: no row is mapped, nothing can be sent.
    expect(mapRecords(records, base).rows).toEqual([])
    const mapped = mapRecords(records, { ...base, decimal: ',' })
    expect(mapped.rows.map(({ row }) => row.amount)).toEqual([120_000, 200_000, 35_000])
  })

  it('needs no choice when every amount reads the same either way', () => {
    const evidence = decimalEvidence(cells('-350', "1'234", '12'))
    expect(evidence.state).toBe('none')
    expect(decimalToUse(evidence, null)).toBe('.')
  })

  it('takes the mark that one line settles for every line of the file', () => {
    const records = parseCsv(
      'Date;Amount;Text\n15.03.2026;-1.200;Rent\n16.03.2026;-4,50;Bakery\n17.03.2026;1.234,50;Pay\n',
      ';',
    ).records
    const evidence = decimalEvidence(amountCells(records.slice(1), base))
    expect(evidence).toMatchObject({ state: 'settled', mark: ',' })
    expect(evidence.comma.map(({ line }) => line)).toEqual([3, 4])
    const mark = decimalToUse(evidence, null)
    const mapped = mapRecords(records, { ...base, decimal: mark })
    expect(mapped.rows.map(({ row }) => row.amount)).toEqual([120_000, 450, 123_450])
    // A point settles it the other way: 1,200 is then 1'200.
    expect(decimalEvidence(cells('1,200', '(12.50)', "1'234.50"))).toMatchObject({
      state: 'settled',
      mark: '.',
    })
  })

  it('refuses a file whose lines contradict each other, and names those lines', () => {
    const evidence = decimalEvidence(cells('12.50', '-1.200', '4,50', '7,05'))
    expect(evidence.state).toBe('contradictory')
    expect(evidence.point.map(({ line }) => line)).toEqual([2])
    expect(evidence.comma.map(({ line }) => line)).toEqual([4, 5])
    // Not even a choice reads it.
    expect(decimalToUse(evidence, '.')).toBeNull()
    expect(decimalToUse(evidence, ',')).toBeNull()
  })

  it('does not keep a point that an older version only assumed, and mends a broken note', () => {
    const key = 'budget-tracker-csv-mapping:b1'
    localStorage.setItem(
      key,
      JSON.stringify({ header: ['A', 'B'], separator: ';', mapping: { ...base, decimal: '.' } }),
    )
    expect(readRememberedMapping('b1', ['A', 'B'])?.mapping.decimal).toBeNull()
    rememberMapping('b1', {
      header: ['A', 'B'],
      separator: ';',
      mapping: { ...base, decimal: ',' },
    })
    expect(readRememberedMapping('b1', ['A', 'B'])?.mapping.decimal).toBe(',')
    localStorage.setItem(key, JSON.stringify({ header: ['A', 'B'], separator: ';', mapping: null }))
    expect(readRememberedMapping('b1', ['A', 'B'])).toBeNull()
    localStorage.setItem(
      key,
      JSON.stringify({ header: ['A', 'B'], separator: ';', mapping: { date: 'x', amount: -1 } }),
    )
    expect(readRememberedMapping('b1', ['A', 'B'])?.mapping).toMatchObject({
      date: null,
      amount: null,
      decimal: null,
    })
    localStorage.removeItem(key)
  })
})

describe('a CSV file is read as text on the device, whatever its encoding [R-IMPORT-324]', () => {
  const utf16 = (text: string, bigEndian: boolean, bom: boolean) => {
    const bytes: number[] = bom ? (bigEndian ? [0xfe, 0xff] : [0xff, 0xfe]) : []
    for (const unit of Array.from(text, (character) => character.charCodeAt(0))) {
      const low = unit & 0xff
      const high = unit >> 8
      bytes.push(...(bigEndian ? [high, low] : [low, high]))
    }
    return new Uint8Array(bytes)
  }
  const text = 'Datum;Betrag\n03.11.2026;-4.50\n'

  it('reads UTF-16 with or without a byte-order mark, UTF-8 and Windows-1252', () => {
    expect(decodeCsvBytes(utf16(text, false, true))).toEqual({
      ok: true,
      text,
      encoding: 'utf-16le',
    })
    expect(decodeCsvBytes(utf16(text, true, true))).toMatchObject({ ok: true, text })
    expect(decodeCsvBytes(utf16(text, false, false))).toMatchObject({ ok: true, text })
    expect(decodeCsvBytes(utf16(text, true, false))).toMatchObject({ ok: true, text })
    expect(decodeCsvBytes(new TextEncoder().encode('Café;1'))).toMatchObject({
      ok: true,
      text: 'Café;1',
      encoding: 'utf-8',
    })
    expect(decodeCsvBytes(new Uint8Array([0x43, 0x61, 0x66, 0xe9]))).toMatchObject({
      ok: true,
      text: 'Café',
      encoding: 'windows-1252',
    })
  })

  it('refuses a file that is not text, or broken UTF-16, with the reason', () => {
    const binary = new Uint8Array(400).map((_, index) => (index * 7) % 32)
    expect(decodeCsvBytes(binary)).toEqual({ ok: false, reason: 'binary' })
    // A lone surrogate cannot be decoded.
    const broken = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x00, 0xd8, 0x41, 0x00])
    expect(decodeCsvBytes(broken)).toEqual({ ok: false, reason: 'undecodable' })
  })

  it('removes a NUL or another control character from a cell and names the line', () => {
    const { records, cleaned } = parseCsv(
      'Date;Text;Amount\n01.11.2026;Bak\u0000ery\u0007;-4.50\n02.11.2026;Tab\tkept;-1.00\n',
      ';',
    )
    expect(records[1]?.cells[1]).toBe('Bakery')
    expect(records[2]?.cells[1]).toBe('Tab\tkept')
    expect(cleaned).toEqual([2])
  })
})

describe('a first line that is plainly data is a row [R-IMPORT-082]', () => {
  it('takes a date and an amount on the first line as data, and maps them by content', () => {
    const records = parseCsv('15.03.2026;Bakery;-4.50\n16.03.2026;Shop;-12.00\n', ';').records
    const header = records[0]?.cells ?? []
    expect(looksLikeData(header)).toBe(true)
    expect(looksLikeData(['Date', 'Text', 'Amount'])).toBe(false)
    expect(guessMapping(header, records.slice(1))).toMatchObject({
      hasHeader: false,
      date: 0,
      amount: 2,
      description: 1,
    })
  })
})
