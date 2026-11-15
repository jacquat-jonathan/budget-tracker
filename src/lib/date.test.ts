import {
  formatCalendarDate,
  formatTimestamp,
  isCalendarDate,
  parseDate,
  toCalendarDate,
} from '@/lib/date'

// vite.config.ts runs the tests with TZ=Europe/Zurich, so time-zone shifts are visible.
describe('test environment', () => {
  it('runs in a non-UTC time zone', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Europe/Zurich')
    expect(new Date('2026-01-15T12:00:00Z').getTimezoneOffset()).toBe(-60)
  })
})

describe('formatCalendarDate', () => {
  it('formats a calendar date as written, without time-zone shifts', () => {
    expect(formatCalendarDate('2026-01-25')).toBe('25.01.2026')
    expect(formatCalendarDate('2026-12-31')).toBe('31.12.2026')
    expect(formatCalendarDate('2026-03-29')).toBe('29.03.2026') // DST switch in Zurich
    expect(formatCalendarDate('2028-02-29')).toBe('29.02.2028')
  })

  it.each(['2026-13-45', '2026-02-30', '2026-00-10', '2026-1-5', '25.01.2026', '', 'nope'])(
    'rejects the invalid date %j',
    (value) => {
      expect(() => formatCalendarDate(value)).toThrow(RangeError)
    },
  )

  it('rejects timestamps, which need formatTimestamp', () => {
    expect(() => formatCalendarDate('2026-03-01T23:30:00+00:00')).toThrow(RangeError)
  })
})

describe('formatTimestamp', () => {
  it('shows the local (Zurich) date of the instant', () => {
    // 23:30 UTC on 1 March is 00:30 on 2 March in Zurich (UTC+1).
    expect(formatTimestamp('2026-03-01T23:30:00+00:00')).toBe('02.03.2026')
    expect(formatTimestamp('2026-03-01T23:30:00Z')).toBe('02.03.2026')
    // Summer time (UTC+2): 22:30 UTC on 30 June is already 1 July.
    expect(formatTimestamp('2026-06-30T22:30:00.123456+00:00')).toBe('01.07.2026')
    // Postgres text form, space separator and short offset.
    expect(formatTimestamp('2026-03-01 08:00:00+01')).toBe('01.03.2026')
    expect(formatTimestamp('2026-03-01T00:30:00+01:00')).toBe('01.03.2026')
  })

  it('accepts a Date', () => {
    expect(formatTimestamp(new Date(2026, 0, 5, 23, 59))).toBe('05.01.2026')
  })

  it.each([
    '2026-03-01', // a calendar date: ambiguous as an instant
    '2026-03-01T10:00:00', // no zone
    '2026-13-45T10:00:00Z',
    '2026-02-30T10:00:00Z',
    'yesterday',
    '',
  ])('rejects %j', (value) => {
    expect(() => formatTimestamp(value)).toThrow(RangeError)
  })

  it('rejects an invalid Date', () => {
    expect(() => formatTimestamp(new Date('nope'))).toThrow(RangeError)
  })
})

describe('isCalendarDate', () => {
  it('accepts only real YYYY-MM-DD dates', () => {
    expect(isCalendarDate('2026-01-25')).toBe(true)
    expect(isCalendarDate('2026-02-29')).toBe(false)
    expect(isCalendarDate('2026-01-25T00:00:00Z')).toBe(false)
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

  it('round-trips with formatCalendarDate', () => {
    expect(formatCalendarDate(parseDate('07.08.2026') ?? '')).toBe('07.08.2026')
  })
})

describe('toCalendarDate', () => {
  it('returns the local calendar date, not the UTC one', () => {
    // 00:30 local on 25 January is still 24 January in UTC.
    expect(toCalendarDate(new Date(2026, 0, 25, 0, 30))).toBe('2026-01-25')
    expect(toCalendarDate(new Date(2026, 0, 25, 23, 59))).toBe('2026-01-25')
  })
})
