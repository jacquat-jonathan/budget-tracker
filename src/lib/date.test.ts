import { formatDate, parseDate, toIsoDate } from '@/lib/date'

describe('formatDate', () => {
  it('formats an ISO date string without time zone shifts', () => {
    expect(formatDate('2026-01-25')).toBe('25.01.2026')
    expect(formatDate('2026-12-31')).toBe('31.12.2026')
  })

  it('uses the date part of an ISO timestamp as written', () => {
    expect(formatDate('2026-03-01T23:30:00+01:00')).toBe('01.03.2026')
  })

  it('formats a Date by its local calendar date', () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe('05.01.2026')
    expect(formatDate(new Date(2026, 10, 15, 23, 59))).toBe('15.11.2026')
  })

  it('rejects invalid input', () => {
    expect(() => formatDate('25.01.2026')).toThrow(RangeError)
    expect(() => formatDate(new Date('nope'))).toThrow(RangeError)
  })
})

describe('parseDate', () => {
  it.each([
    ['25.01.2026', '2026-01-25'],
    ['5.1.2026', '2026-01-05'],
    [' 29.02.2028 ', '2028-02-29'],
    ['31.12.1999', '1999-12-31'],
  ])('parses %j as %s', (input, expected) => {
    expect(parseDate(input)).toBe(expected)
  })

  it.each(['', '2026-01-25', '32.01.2026', '29.02.2026', '00.01.2026', '15.13.2026', '1.1.26'])(
    'rejects %j',
    (input) => {
      expect(parseDate(input)).toBeNull()
    },
  )

  it('round-trips with formatDate', () => {
    expect(formatDate(parseDate('07.08.2026') ?? '')).toBe('07.08.2026')
  })
})

describe('toIsoDate', () => {
  it('returns the local calendar date', () => {
    expect(toIsoDate(new Date(2026, 0, 25, 23, 59))).toBe('2026-01-25')
  })
})
