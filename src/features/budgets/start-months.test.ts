import { monthLabel, monthOf } from '@/features/budgets/start-months'

describe('month names [R-I18N-001]', () => {
  it('stand on their own capitalised, read from the string', () => {
    expect(monthLabel('2026-11-01', 'en')).toBe('November 2026')
    expect(monthLabel('2026-11-01', 'fr')).toBe('Novembre 2026')
    // The last day of a month stays in that month, whatever the time zone (C-DATE-002).
    expect(monthLabel('2026-03-31', 'fr')).toBe('Mars 2026')
  })

  it('follow "of" with French elision', () => {
    expect(monthOf('2026-11-01', 'fr')).toBe('de novembre 2026')
    expect(monthOf('2026-10-01', 'fr')).toBe('d’octobre 2026')
    expect(monthOf('2026-08-01', 'fr')).toBe('d’août 2026')
    expect(monthOf('2026-04-01', 'fr')).toBe('d’avril 2026')
    expect(monthOf('2026-10-01', 'en')).toBe('October 2026')
  })
})
