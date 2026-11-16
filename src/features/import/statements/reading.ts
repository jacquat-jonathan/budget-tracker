/**
 * Exact reading of statement amounts, dates and numbers. No floating-point arithmetic on
 * money: amounts become integer rappen through the shared money helper, products with a rate
 * are computed with BigInt, and dates stay strings.
 */
import { isCalendarDate } from '@/lib/date'
import { parseMoney } from '@/lib/money'

import type { CalendarDate, Rappen } from './types'

// Digits with ' (or ’) grouping thousands, or plain digits, a dot and exactly two decimals.
// No sign, no currency, no other separator: anything else is not a statement amount.
const AMOUNT = /^(?:0|[1-9]\d{0,2}(?:['’]\d{3})+|[1-9]\d*)\.\d{2}$/
const WHOLE_FRANCS = /^(?:0|[1-9]\d{0,2}(?:['’]\d{3})+|[1-9]\d*)$/

// R-IMPORT-089: statement amounts are read exactly into integer rappen.
/**
 * Read a statement amount ("1'234.50", "0.05") into integer rappen; null for anything else.
 * There is no sign: the column (or the trailing minus on the card bill) gives the direction.
 */
export function readAmount(text: string): Rappen | null {
  if (!AMOUNT.test(text)) return null
  const rappen = parseMoney(text)
  return rappen !== null && Number.isSafeInteger(rappen) && rappen >= 0 ? rappen : null
}

/**
 * Read an amount of the card bill's CHF column: an amount, optionally followed by " -" (space,
 * hyphen) for a credit. Returns null for anything else.
 */
export function readCardAmount(text: string): { amount: Rappen; credit: boolean } | null {
  const credit = text.endsWith(' -')
  const amount = readAmount(credit ? text.slice(0, -2) : text)
  return amount === null ? null : { amount, credit }
}

/** Read whole francs without decimals ("5'000", as card limits are printed) into rappen. */
export function readWholeFrancs(text: string): Rappen | null {
  if (WHOLE_FRANCS.test(text)) return parseMoney(text)
  return readAmount(text)
}

const SHORT_DATE = /^(\d{2})\.(\d{2})\.(\d{2})$/
const LONG_DATE = /^(\d{2})\.(\d{2})\.(\d{4})$/

// R-IMPORT-089 C-DATE-002: a statement date becomes a calendar date string, never a Date.
/**
 * Read "DD.MM.YY" or "DD.MM.YYYY" into "YYYY-MM-DD"; null when it is not a real date.
 * A two-digit year is always 20YY (00 to 99 give 2000 to 2099), as the statements print
 * them; a statement from the 1900s or after 2099 cannot occur.
 */
export function readDate(text: string): CalendarDate | null {
  const short = SHORT_DATE.exec(text)
  const long = short ? null : LONG_DATE.exec(text)
  const match = short ?? long
  if (!match) return null
  const [, day = '', month = '', year = ''] = match
  const fullYear = short ? `20${year}` : year
  const date = `${fullYear}-${month}-${day}`
  return isCalendarDate(date) ? date : null
}

const DECIMAL = /^(\d+)\.(\d+)$/

/** A positive decimal as printed ("0.9041442"), as an integer and its scale (10^decimals). */
export function readDecimal(
  text: string,
): { units: bigint; scale: bigint; decimals: number } | null {
  const match = DECIMAL.exec(text)
  if (!match) return null
  const [, whole = '', fraction = ''] = match
  return {
    units: BigInt(whole + fraction),
    scale: 10n ** BigInt(fraction.length),
    decimals: fraction.length,
  }
}

/**
 * Exact product of an amount in hundredths and a printed decimal (an exchange rate or a
 * percentage divided by 100 by the caller): returns numerator and denominator in hundredths.
 */
export function multiplyByDecimal(
  hundredths: number,
  decimal: { units: bigint; scale: bigint },
): { numerator: bigint; denominator: bigint } {
  return { numerator: BigInt(hundredths) * decimal.units, denominator: decimal.scale }
}

/** True when |printed - numerator/denominator| < tolerance (all in the same unit). */
export function isWithin(
  printed: number,
  exact: { numerator: bigint; denominator: bigint },
  tolerance: number,
): boolean {
  const difference = BigInt(printed) * exact.denominator - exact.numerator
  const absolute = difference < 0n ? -difference : difference
  return absolute < BigInt(tolerance) * exact.denominator
}

/** The exact value rounded to the nearest unit (half away from zero), for reporting only. */
export function roundExact(exact: { numerator: bigint; denominator: bigint }): number {
  const { numerator, denominator } = exact
  const sign = numerator < 0n ? -1n : 1n
  const absolute = numerator < 0n ? -numerator : numerator
  return Number(sign * ((absolute * 2n + denominator) / (denominator * 2n)))
}

/** Exponent of the minor unit of a currency (ISO 4217); 2 unless listed. */
const MINOR_UNIT_EXPONENT: Record<string, number> = {
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
}

/**
 * An amount printed with two decimals, in the minor unit of its currency (hundredths for EUR,
 * whole yen for JPY, thousandths for KWD). Null when it cannot be expressed exactly (a JPY
 * amount with non-zero decimals).
 */
export function toMinorUnits(hundredths: number, currency: string): number | null {
  const exponent = MINOR_UNIT_EXPONENT[currency] ?? 2
  if (exponent === 2) return hundredths
  if (exponent === 3) return hundredths * 10
  return hundredths % 100 === 0 ? hundredths / 100 : null
}

/** A Swiss QR reference: 27 digits, the last one a modulo-10 recursive check digit. */
export function isValidQrReference(digits: string): boolean {
  if (!/^\d{27}$/.test(digits)) return false
  const table = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5]
  let carry = 0
  for (const digit of digits.slice(0, 26)) {
    carry = table[(carry + Number(digit)) % 10] ?? 0
  }
  return (10 - carry) % 10 === Number(digits[26])
}

/** An ISIN: two letters, nine alphanumerics, a check digit (Luhn over the expanded digits). */
export function isValidIsin(isin: string): boolean {
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) return false
  const expanded = isin
    .slice(0, 11)
    .replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55))
  let sum = 0
  let double = true
  for (let index = expanded.length - 1; index >= 0; index -= 1) {
    let value = Number(expanded[index])
    if (double) {
      value *= 2
      if (value > 9) value -= 9
    }
    sum += value
    double = !double
  }
  return (10 - (sum % 10)) % 10 === Number(isin[11])
}

/** An IBAN: country, check digits, up to 30 alphanumerics, valid modulo 97. */
export function isValidIban(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  let remainder = 0
  for (const character of rearranged) {
    const value = /\d/.test(character) ? character : String(character.charCodeAt(0) - 55)
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder === 1
}

/** Collapse runs of whitespace into one space and trim. */
export function collapseSpaces(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}
