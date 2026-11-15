import { formatMoney, parseMoney } from '@/lib/money'

describe('formatMoney', () => {
  it.each([
    [0, 'CHF 0.00'],
    [5, 'CHF 0.05'],
    [50, 'CHF 0.50'],
    [100, 'CHF 1.00'],
    [123450, "CHF 1'234.50"],
    [100000000, "CHF 1'000'000.00"],
    [-123450, "CHF -1'234.50"],
    [-5, 'CHF -0.05'],
    [99999, 'CHF 999.99'],
  ])('formats %i rappen as %s', (rappen, expected) => {
    expect(formatMoney(rappen)).toBe(expected)
  })

  it('can omit the currency', () => {
    expect(formatMoney(123450, { currency: false })).toBe("1'234.50")
  })

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects non-integer rappen %s',
    (value) => {
      expect(() => formatMoney(value)).toThrow(RangeError)
    },
  )
})

describe('parseMoney', () => {
  it.each([
    ['0', 0],
    ['12', 1200],
    ['12.5', 1250],
    ['12.50', 1250],
    ['12,50', 1250],
    ['.5', 50],
    ['12.', 1200],
    ["1'234.50", 123450],
    ['1’234.50', 123450],
    ['1 234,50', 123450],
    ['CHF 1234.50', 123450],
    ['1234.50 CHF', 123450],
    ['chf12', 1200],
    ['12.-', 1200],
    ['12.–', 1200],
    ['-12.30', -1230],
    ['+5', 500],
    ['-0', 0],
    ['  42  ', 4200],
  ])('parses %j as %i rappen', (input, expected) => {
    expect(parseMoney(input)).toBe(expected)
  })

  it.each([
    '',
    '   ',
    'CHF',
    'abc',
    '12.345',
    '1.234,50',
    '1,234.50',
    '12..5',
    '--5',
    '5-',
    '1e3',
    '.',
  ])('rejects %j', (input) => {
    expect(parseMoney(input)).toBeNull()
  })

  it('round-trips with formatMoney', () => {
    for (const rappen of [0, 1, 99, 100, 123456789, -42]) {
      expect(parseMoney(formatMoney(rappen))).toBe(rappen)
    }
  })
})
