import { unwrap } from '@/features/budgets/budget-queries'
import type { Transaction } from '@/features/transactions/transaction-queries'
import { formatCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { supabase } from '@/lib/supabase'

/**
 * A transaction to review that can get a category in the review: an expense or a refund that
 * is not linked to a subscription, a debt or a planned transfer, and not frozen. Others keep
 * the edit form.
 */
export function canCategoriseInReview(row: Transaction): boolean {
  return (
    row.review_state === 'to_review' &&
    row.kind !== 'extra_income' &&
    row.debt_ended !== true &&
    !row.subscription_id &&
    !row.debt_id &&
    !row.transfer_id
  )
}

/** How a row is named to the user: what, amount, date. */
export function reviewRowLabel(row: Transaction): string {
  const what = row.description || row.category_name || ''
  return `${what}, ${formatMoney(row.amount)}, ${formatCalendarDate(row.date)}`
}

/** The category was saved but the confirmation was refused: the row stays to review. */
export class NotConfirmed extends Error {
  readonly after: Transaction
  readonly reason: unknown
  constructor(after: Transaction, reason: unknown) {
    super('not_confirmed')
    this.after = after
    this.reason = reason
  }
}

/**
 * One row: its category with the existing update_transaction call (every other field as it
 * is), then confirm_import with the revision that call answered. Two calls; the second
 * refused leaves the category saved and the row to review (NotConfirmed).
 */
export async function categoriseAndConfirm(
  row: Transaction,
  categoryId: string,
): Promise<Transaction> {
  const description = row.description?.trim() ?? ''
  const after = unwrap(
    await supabase.rpc('update_transaction', {
      p_transaction_id: row.id,
      p_expected_revision: row.revision,
      p_kind: row.kind,
      p_amount: row.amount,
      p_date: row.date,
      p_category_id: categoryId,
      ...(description ? { p_description: description } : {}),
    }),
  )[0]
  if (!after) throw new Error('transaction_not_found')
  try {
    unwrap(
      await supabase.rpc('confirm_import', {
        p_transaction_id: after.id,
        p_expected_revision: after.revision,
      }),
    )
  } catch (error) {
    throw new NotConfirmed(after, error)
  }
  return after
}
