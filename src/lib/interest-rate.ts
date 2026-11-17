/**
 * A debt's yearly interest rate: a percentage with at most three decimals, 0 to 100
 * (docs/database.md). It is read and validated as a decimal string, never through float
 * arithmetic: "4,875" -> "4.875". The database takes it as a JSON number; a number with at
 * most three decimals is written back exactly as typed, so the conversion is exact.
 */

const RATE = /^(\d{1,3})(?:[.,](\d{1,3}))?$/

export const MAX_INTEREST_RATE = 100

/**
 * The rate typed by a user as a canonical decimal string ("4.875", "5", "0"), or null when it
 * is not a rate from 0 to 100 with at most three decimals. Blank is "0" (no interest).
 */
// R-DEBT-120: a decimal string, at most three decimals, 0 to 100, no float arithmetic.
export function parseInterestRate(input: string): string | null {
  const value = input.replace(/[\s%]/g, '')
  if (value === '') return '0'
  const match = RATE.exec(value)
  if (!match) return null
  const whole = String(Number(match[1] ?? '0'))
  const decimals = (match[2] ?? '').replace(/0+$/, '')
  if (Number(whole) > MAX_INTEREST_RATE) return null
  if (Number(whole) === MAX_INTEREST_RATE && decimals !== '') return null
  return decimals === '' ? whole : `${whole}.${decimals}`
}

/** The canonical rate string as the number the API takes (exact: at most three decimals). */
export function interestRateValue(rate: string): number {
  return Number(rate)
}

/** A rate the database returned, as written ("4.875"), for display and for a form. */
export function formatInterestRate(rate: number): string {
  // The shortest decimal that reads back as this number: the digits the database stored.
  return String(rate)
}
