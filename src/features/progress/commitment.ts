/**
 * What is committed inside one planned amount, as the database gives it: the subscriptions'
 * monthly costs and the planned transfers' committed amount, each its own figure (never added
 * into one shown figure), and the planned amount they are part of.
 */
export interface Commitment {
  planned: number
  subscriptions: number
  transfers: number
}

/**
 * More is committed than planned. A comparison only: the two committed figures are never shown
 * added up.
 */
// R-PROGRESS-531: a commitment above the plan is said in words.
export function isOverCommitted({ planned, subscriptions, transfers }: Commitment): boolean {
  return subscriptions + transfers > planned
}

/** Some line of a list is committed above its own plan. */
export function someOverCommitted(lines: readonly Commitment[]): boolean {
  return lines.some(isOverCommitted)
}
