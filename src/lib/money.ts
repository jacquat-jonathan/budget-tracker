/**
 * Money helpers. Amounts are always integer rappen (1 CHF = 100 rappen) in code and in the
 * database; these helpers convert at the edge only.
 *
 * Display format is Swiss: an apostrophe groups thousands and a dot separates rappen,
 * for example "CHF 1'234.50" or "CHF -12.00".
 */

const CURRENCY = 'CHF'

export interface FormatMoneyOptions {
  /** Prefix the amount with "CHF ". Defaults to true. */
  currency?: boolean
}

// C-MONEY-001: amounts are integer rappen.
function assertRappen(rappen: number): void {
  if (!Number.isSafeInteger(rappen)) {
    throw new RangeError(`Money amounts must be integer rappen, received ${String(rappen)}`)
  }
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, "'")
}

/** Format integer rappen as Swiss francs, e.g. 123450 -> "CHF 1'234.50". */
export function formatMoney(rappen: number, options: FormatMoneyOptions = {}): string {
  assertRappen(rappen)
  const { currency = true } = options
  const sign = rappen < 0 ? '-' : ''
  const absolute = Math.abs(rappen)
  const francs = Math.trunc(absolute / 100)
  const cents = absolute % 100
  const amount = `${sign}${groupThousands(String(francs))}.${String(cents).padStart(2, '0')}`
  return currency ? `${CURRENCY} ${amount}` : amount
}

/**
 * Parse an amount typed by a user into integer rappen. Returns null when the input is not a
 * valid amount.
 *
 * Accepted: optional "CHF" before or after, optional sign, thousands grouped with an
 * apostrophe (' or ’) or spaces, a dot or a comma as decimal separator with at most two
 * decimals, and the Swiss ".-" / ".–" notation for whole francs.
 * Examples: "1'234.50", "1 234,5", "CHF 12", "12.-", "-0.05", ".50".
 */
export function parseMoney(input: string): number | null {
  let value = input
    .replace(/[\s\u00a0\u202f]/g, '')
    .replace(/^chf/i, '')
    .replace(/chf$/i, '')
    .replace(/['’ʼ]/g, '')
    .replace(/[.,][-–—]$/, '')

  let sign = 1
  if (value.startsWith('-') || value.startsWith('+')) {
    if (value.startsWith('-')) sign = -1
    value = value.slice(1)
  }

  const match = /^(\d*)(?:[.,](\d{0,2}))?$/.exec(value)
  if (!match) return null

  const francsPart = match[1] ?? ''
  const centsPart = match[2] ?? ''
  if (francsPart === '' && centsPart === '') return null

  const francs = francsPart === '' ? 0 : Number(francsPart)
  const cents = centsPart === '' ? 0 : Number(centsPart.padEnd(2, '0'))
  const rappen = francs * 100 + cents
  if (!Number.isSafeInteger(rappen)) return null

  // Avoid returning -0 for inputs such as "-0".
  return rappen === 0 ? 0 : sign * rappen
}
