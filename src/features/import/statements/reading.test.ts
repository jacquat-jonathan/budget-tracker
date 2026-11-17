import {
  isValidIban,
  isValidIsin,
  isValidQrReference,
  multiplyByDecimal,
  isWithin,
  readAmount,
  readCardAmount,
  readDate,
  readDecimal,
  readWholeFrancs,
  roundExact,
  toMinorUnits,
} from './reading'

describe('statement amounts are read exactly into integer rappen [R-IMPORT-089] [C-MONEY-001]', () => {
  it.each([
    ['0.05', 5],
    ['0.00', 0],
    ['2.01', 201],
    ['81.80', 8180],
    ['999.99', 99999],
    ["1'000.00", 100000],
    ["21'414.13", 2141413],
    ["1'000'000.00", 100000000],
    ["12'345'678.90", 1234567890],
    ['1234.50', 123450],
    ['1’234.50', 123450],
  ])('%s is %i rappen', (text, expected) => {
    expect(readAmount(text)).toBe(expected)
  })

  it('reads 0.1 + 0.2 style sums without floating-point drift', () => {
    const sum = ['0.10', '0.20', '0.70']
      .map((text) => readAmount(text) ?? Number.NaN)
      .reduce((a, b) => a + b, 0)
    expect(sum).toBe(100)
  })

  it.each([
    '12.5',
    '12',
    '12.500',
    '.50',
    '-5.00',
    '+5.00',
    '5.00-',
    "1'00.00",
    "1'0000.00",
    "'100.00",
    '1,000.00',
    '1 000.00',
    '01.00',
    'CHF 5.00',
    '5,00',
    '1e3.00',
    '',
    ' 5.00',
  ])('refuses %j', (text) => {
    expect(readAmount(text)).toBeNull()
  })

  it('reads a trailing " -" on the card bill as a credit', () => {
    expect(readCardAmount("2'363.00 -")).toEqual({ amount: 236300, credit: true })
    expect(readCardAmount('5.75')).toEqual({ amount: 575, credit: false })
    expect(readCardAmount("1'000'000.00 -")).toEqual({ amount: 100000000, credit: true })
  })

  it.each(['5.75-', '5.75 - ', '- 5.75', '5.75  -', '-5.75', '5.75x-'])(
    'refuses the card amount %j',
    (text) => {
      expect(readCardAmount(text)).toBeNull()
    },
  )

  it('reads card limits printed in whole francs', () => {
    expect(readWholeFrancs("5'000")).toBe(500000)
    expect(readWholeFrancs("10'000")).toBe(1000000)
    expect(readWholeFrancs('5000.00')).toBe(500000)
    expect(readWholeFrancs("5'00")).toBeNull()
  })
})

describe('statement dates become calendar dates without a time zone [R-IMPORT-089] [C-DATE-002]', () => {
  it.each([
    ['01.04.25', '2025-04-01'],
    ['31.03.2025', '2025-03-31'],
    ['29.02.24', '2024-02-29'],
    // Two-digit years are always 20YY: 00 is 2000 and 99 is 2099 (docs/import-sources.md).
    ['01.01.00', '2000-01-01'],
    ['31.12.99', '2099-12-31'],
    ['31.12.1999', '1999-12-31'],
    // A date on which Zurich changes to summer time stays the same day.
    ['30.03.25', '2025-03-30'],
    ['26.10.2025', '2025-10-26'],
  ])('%s is %s', (text, expected) => {
    expect(readDate(text)).toBe(expected)
  })

  it.each([
    '29.02.25',
    '31.04.25',
    '32.01.25',
    '00.01.25',
    '01.13.25',
    '1.4.25',
    '01.04.2025 ',
    '01/04/25',
    '2025-04-01',
    '01.04.025',
  ])('refuses %j', (text) => {
    expect(readDate(text)).toBeNull()
  })

  it('returns a string, never a Date [C-DATE-001]', () => {
    expect(typeof readDate('01.04.25')).toBe('string')
  })
})

describe('exact rate arithmetic [R-IMPORT-089]', () => {
  it('multiplies an amount by a printed rate without floating point', () => {
    const rate = readDecimal('0.9041442')
    if (!rate) throw new Error('rate')
    const product = multiplyByDecimal(30448, rate)
    // 304.48 × 0.9041442 = 275.2939... CHF
    expect(roundExact(product)).toBe(27529)
    expect(isWithin(27530, product, 5)).toBe(true)
    expect(isWithin(27535, product, 5)).toBe(false)
    // The bound is strict: a difference of exactly the tolerance is too much.
    expect(isWithin(105, { numerator: 100n, denominator: 1n }, 5)).toBe(false)
    expect(isWithin(104, { numerator: 100n, denominator: 1n }, 5)).toBe(true)
  })

  it('refuses rates that are not plain decimals', () => {
    expect(readDecimal('0,9')).toBeNull()
    expect(readDecimal('1e-3')).toBeNull()
    expect(readDecimal('.5')).toBeNull()
  })

  it('expresses foreign amounts in the minor unit of their currency', () => {
    expect(toMinorUnits(7615, 'EUR')).toBe(7615)
    expect(toMinorUnits(150000, 'JPY')).toBe(1500)
    expect(toMinorUnits(150050, 'JPY')).toBeNull()
    expect(toMinorUnits(1250, 'KWD')).toBe(12500)
  })
})

describe('identifiers keep their check digits', () => {
  it('validates QR references (modulo 10 recursive)', () => {
    expect(isValidQrReference('000000000022094471308655120')).toBe(true)
    expect(isValidQrReference('000000000022094471308655121')).toBe(false)
    expect(isValidQrReference('00000000002209447130865512')).toBe(false)
  })

  it('validates ISINs and IBANs', () => {
    expect(isValidIsin('US0378331005')).toBe(true)
    expect(isValidIsin('US0378331006')).toBe(false)
    expect(isValidIban('CH9300762011623852957')).toBe(true)
    expect(isValidIban('CH9300762011623852958')).toBe(false)
  })
})
