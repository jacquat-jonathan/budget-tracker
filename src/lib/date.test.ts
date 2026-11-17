import {
  addDays,
  addMonths,
  calendarMonth,
  daysInclusive,
  formatCalendarDate,
  formatTimestamp,
  formatTimestampWithTime,
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

describe('formatCalendarDate [R-DATE-001]', () => {
  it('formats a calendar date as written, without time-zone shifts [C-DATE-002]', () => {
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

  it('rejects timestamps, which need formatTimestamp [C-DATE-001]', () => {
    expect(() => formatCalendarDate('2026-03-01T23:30:00+00:00')).toThrow(RangeError)
  })
})

describe('formatTimestamp [R-DATE-001]', () => {
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
  ])('rejects %j [C-DATE-001]', (value) => {
    expect(() => formatTimestamp(value)).toThrow(RangeError)
  })

  it('rejects an invalid Date', () => {
    expect(() => formatTimestamp(new Date('nope'))).toThrow(RangeError)
  })
})

describe('formatTimestampWithTime [R-DATE-001]', () => {
  it('shows the local (Zurich) date and time of the instant, 24 hours', () => {
    expect(formatTimestampWithTime('2026-03-01T23:30:00+00:00')).toBe('02.03.2026, 00:30')
    expect(formatTimestampWithTime('2026-06-30T13:05:00Z')).toBe('30.06.2026, 15:05')
    expect(formatTimestampWithTime(new Date(2026, 0, 5, 9, 7))).toBe('05.01.2026, 09:07')
  })

  it('rejects what formatTimestamp rejects [C-DATE-001]', () => {
    expect(() => formatTimestampWithTime('2026-03-01')).toThrow(RangeError)
    expect(() => formatTimestampWithTime('2026-03-01T10:00:00')).toThrow(RangeError)
  })
})

describe('isCalendarDate [C-DATE-001]', () => {
  it('accepts only real YYYY-MM-DD dates', () => {
    expect(isCalendarDate('2026-01-25')).toBe(true)
    expect(isCalendarDate('2026-02-29')).toBe(false)
    expect(isCalendarDate('2026-01-25T00:00:00Z')).toBe(false)
  })
})

describe('parseDate [R-DATE-001]', () => {
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
  it('returns the local calendar date, not the UTC one [C-DATE-002]', () => {
    // 00:30 local on 25 January is still 24 January in UTC.
    expect(toCalendarDate(new Date(2026, 0, 25, 0, 30))).toBe('2026-01-25')
    expect(toCalendarDate(new Date(2026, 0, 25, 23, 59))).toBe('2026-01-25')
  })
})

describe('calendar date arithmetic [C-DATE-002]', () => {
  it('adds days without a time zone, across summer time and month ends', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26')
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
    expect(addDays('2026-12-31', 0)).toBe('2026-12-31')
  })

  it('counts days inclusively', () => {
    expect(daysInclusive('2026-03-25', '2026-03-25')).toBe(1)
    expect(daysInclusive('2026-03-25', '2026-04-23')).toBe(30)
    expect(daysInclusive('2026-03-01', '2026-03-31')).toBe(31)
  })

  it('steps by whole months from the month of a date', () => {
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-01')
    expect(addMonths('2026-01-31', -1)).toBe('2025-12-01')
    expect(addMonths('2026-11-01', 0)).toBe('2026-11-01')
  })

  it('reads the month from the string', () => {
    expect(calendarMonth('2026-11-01')).toEqual({ year: 2026, month: 11 })
  })

  it.each(['2026-02-30', '2026-01-01T00:00:00Z', ''])('rejects %j', (value) => {
    expect(() => addDays(value, 1)).toThrow(RangeError)
    expect(() => daysInclusive(value, '2026-01-01')).toThrow(RangeError)
  })
})
