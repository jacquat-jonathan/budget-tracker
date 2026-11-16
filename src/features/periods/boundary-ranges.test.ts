import {
  arrivedOffer,
  earlyRange,
  earlyUnavailable,
  moveStartRange,
} from '@/features/periods/boundary-ranges'
import { nextSalary } from '@/features/periods/next-salary'

describe('the next salary has one source: the current period [R-INCOME-056]', () => {
  it('is the day after the current period ends, projected or set by hand', () => {
    expect(nextSalary({ end_date: '2027-01-10', end_is_manual: false }, null)).toEqual({
      kind: 'expected',
      date: '2027-01-11',
      manual: false,
    })
    expect(nextSalary({ end_date: '2026-12-11', end_is_manual: true }, null)).toEqual({
      kind: 'expected',
      date: '2026-12-12',
      manual: true,
    })
  })

  it('is none in the budget’s last period, which ends the budget, nor once it has ended', () => {
    expect(nextSalary({ end_date: '2027-04-24', end_is_manual: false }, '2027-03-31')).toEqual({
      kind: 'lastPeriod',
      endDate: '2027-04-24',
    })
    expect(nextSalary({ end_date: '2027-03-24', end_is_manual: false }, '2027-03-31').kind).toBe(
      'expected',
    )
    expect(nextSalary(null, '2027-03-31')).toEqual({ kind: 'ended' })
  })
})

describe('boundary operations are offered only when the database can accept a date [R-PERIOD-054]', () => {
  const current = { start_date: '2027-03-25', end_date: '2027-04-24', today: '2027-04-20' }

  it('"arrived early": from the 7th day of the period to today, not after the end date entered', () => {
    expect(earlyRange(current, null)).toEqual({ min: '2027-04-01', max: '2027-04-20' })
    expect(earlyRange(current, '2027-04-10')).toEqual({ min: '2027-04-01', max: '2027-04-10' })
  })

  it('"arrived early" is unavailable in a last period whose end date leaves no room', () => {
    // The reviewer's case: end date 31.03.2027, last period 25.03 – 25.04, today 20.04.
    expect(earlyUnavailable(current, '2027-03-31')).toEqual({
      reason: 'budgetEnds',
      endDateEntered: '2027-03-31',
    })
    expect(earlyUnavailable(current, null)).toBeNull()
    expect(earlyUnavailable({ ...current, today: '2027-03-28' }, null)).toEqual({
      reason: 'tooSoon',
      earliest: '2027-04-01',
    })
  })

  it('"actually arrived on another day" keeps both periods 7 to 92 days long, up to today', () => {
    const period = { start_date: '2026-11-10', end_date: '2026-12-12', today: '2026-11-16' }
    expect(moveStartRange(period, { start_date: '2026-10-10' }, null)).toEqual({
      min: '2026-10-17',
      max: '2026-11-16',
    })
    expect(moveStartRange(period, { start_date: '2026-10-10' }, '2026-11-12').max).toBe(
      '2026-11-12',
    )
  })
})

describe('after a pay-day correction, only the operation that fits is offered [R-PERIOD-037]', () => {
  const previous = { start_date: '2026-10-10' }

  it('a salary due 7 days or more after the period started is a new one: record it early', () => {
    const current = { start_date: '2026-10-25', end_date: '2026-12-09', today: '2026-11-16' }
    expect(arrivedOffer({ due: '2026-11-10', current, previous, endDateEntered: null })).toEqual({
      kind: 'early',
      date: '2026-11-10',
    })
  })

  it('a salary due a few days after the start is this period’s own: move the start', () => {
    // The reviewer's case: started 10.11, today 16.11, pay day corrected from 10 to 13.
    const current = { start_date: '2026-11-10', end_date: '2026-11-24', today: '2026-11-16' }
    expect(
      arrivedOffer({
        due: '2026-11-13',
        current,
        previous,
        endDateEntered: null,
        endAfterSave: '2026-12-12',
      }),
    ).toEqual({ kind: 'moveStart', date: '2026-11-13' })
  })

  it('offers nothing the database would refuse', () => {
    const current = { start_date: '2026-11-10', end_date: '2026-12-12', today: '2026-11-16' }
    // No previous period to move the boundary with.
    expect(
      arrivedOffer({ due: '2026-11-13', current, previous: undefined, endDateEntered: null }),
    ).toBeNull()
    // The salary would be after the budget's end date.
    const last = { start_date: '2027-03-25', end_date: '2027-04-24', today: '2027-04-20' }
    expect(
      arrivedOffer({ due: '2027-04-10', current: last, previous, endDateEntered: '2027-03-31' }),
    ).toBeNull()
    // Not due yet, or due before the period started.
    expect(arrivedOffer({ due: '2026-11-20', current, previous, endDateEntered: null })).toBeNull()
    expect(arrivedOffer({ due: '2026-11-10', current, previous, endDateEntered: null })).toBeNull()
  })
})
