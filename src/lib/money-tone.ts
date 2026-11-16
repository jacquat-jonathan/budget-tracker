/** How an amount reads: neutral, good (a surplus, money in) or bad (over, a deficit). */
export type MoneyTone = 'neutral' | 'positive' | 'negative'

/** The tone of an amount that is good when positive (a result, what is left). */
export function signTone(amount: number): MoneyTone {
  return amount < 0 ? 'negative' : amount > 0 ? 'positive' : 'neutral'
}
