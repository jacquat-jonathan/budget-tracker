import { formatInterestRate, interestRateValue, parseInterestRate } from '@/lib/interest-rate'

describe('interest rates [R-DEBT-120]', () => {
  it('reads a percentage with up to three decimals as a decimal string', () => {
    expect(parseInterestRate('4.875')).toBe('4.875')
    expect(parseInterestRate('4,875')).toBe('4.875')
    expect(parseInterestRate(' 4,5 % ')).toBe('4.5')
    expect(parseInterestRate('4.500')).toBe('4.5')
    expect(parseInterestRate('05')).toBe('5')
    expect(parseInterestRate('100')).toBe('100')
    expect(parseInterestRate('100.000')).toBe('100')
    expect(parseInterestRate('0.001')).toBe('0.001')
    // Blank: no interest.
    expect(parseInterestRate('')).toBe('0')
  })

  it('refuses more than three decimals, more than 100 % and anything else', () => {
    for (const input of ['4.8755', '100.001', '101', '-1', 'abc', '4.', '.5', '1e2', '4,8,7']) {
      expect(parseInterestRate(input), input).toBeNull()
    }
  })

  it('reaches the database exactly as typed, and is shown as stored', () => {
    for (const rate of ['4.875', '0.001', '99.999', '12.3']) {
      expect(JSON.stringify(interestRateValue(rate))).toBe(rate)
    }
    expect(formatInterestRate(4.875)).toBe('4.875')
    expect(formatInterestRate(0.1)).toBe('0.1')
  })
})
