import type { ParseKeys } from 'i18next'

/**
 * Errors from the database, mapped to translation keys. RPCs raise SQLSTATE P0001 with a
 * stable snake_case message (docs/database.md, "Error messages"); a few other codes can
 * reach the client. Anything unknown falls back to a generic message: the raw error is
 * never shown.
 */

/** The stable messages of docs/database.md, "Error messages". */
export const DB_ERROR_CODES = [
  'not_authenticated',
  'budget_not_found',
  'income_not_found',
  'period_not_found',
  'member_not_found',
  'invitation_not_found',
  'not_owner',
  'owner_cannot_leave',
  'member_has_primary_income',
  'already_member',
  'invalid_name',
  'invalid_amount',
  'invalid_pay_day',
  'invalid_weekend_rule',
  'invalid_email',
  'invalid_start_month',
  'invalid_end_date',
  'invalid_boundary',
  'invalid_period',
  'end_date_before_last_period',
  'income_is_primary',
  'income_ended',
  'income_not_in_force',
  'budget_ended',
  'budget_limit_reached',
  'member_limit_reached',
  'invitation_limit_reached',
  'income_limit_reached',
  'record_changed',
  'invalid_revision',
  'category_not_found',
  'transaction_not_found',
  'invalid_cadence',
  'invalid_kind',
  'invalid_description',
  'invalid_date',
  'invalid_category',
  'invalid_parent',
  'invalid_limit',
  'invalid_cursor',
  'date_outside_periods',
  'category_required',
  'category_is_group',
  'category_not_in_force',
  'category_ended',
  'other_name_required',
  'category_limit_reached',
  'transaction_limit_reached',
  'category_not_ended',
  'category_in_use',
  // Step 4
  'subscription_not_found',
  'debt_not_found',
  'adjustment_not_found',
  'subscription_ended',
  'debt_ended',
  'invalid_charge_date',
  'invalid_interest_rate',
  'invalid_link',
  'debt_not_in_force',
  'subscription_not_in_force',
  'not_a_charge',
  'debt_has_history',
  'subscription_limit_reached',
  'debt_limit_reached',
  'adjustment_limit_reached',
] as const

export type DbErrorCode = (typeof DB_ERROR_CODES)[number]

export type DbErrorKey =
  | `errors.db.${DbErrorCode}`
  | 'errors.forbidden'
  | 'errors.invalidValue'
  | 'errors.network'
  | 'errors.generic'

/** Codes meaning "this row is gone or not yours (any more)". */
export const NOT_FOUND_CODES: readonly DbErrorCode[] = [
  'budget_not_found',
  'income_not_found',
  'period_not_found',
  'member_not_found',
  'invitation_not_found',
  'category_not_found',
  'transaction_not_found',
  'subscription_not_found',
  'debt_not_found',
  'adjustment_not_found',
]

/** An error the client raises itself in the database's terms, e.g. a write that hit 0 rows. */
export class DbError extends Error {
  readonly code = 'P0001'
  constructor(message: DbErrorCode) {
    super(message)
    this.name = 'DbError'
  }
}

interface ErrorLike {
  code?: unknown
  message?: unknown
}

function asErrorLike(error: unknown): ErrorLike | null {
  return typeof error === 'object' && error !== null ? error : null
}

function isDbErrorCode(value: unknown): value is DbErrorCode {
  return typeof value === 'string' && (DB_ERROR_CODES as readonly string[]).includes(value)
}

/** The stable database error code carried by an error, if any. */
export function dbErrorCode(error: unknown): DbErrorCode | null {
  const like = asErrorLike(error)
  if (like?.code === 'P0001' && isDbErrorCode(like.message)) return like.message
  return null
}

const NETWORK_MESSAGE = /failed to fetch|networkerror|load failed|network request failed/i

function isNetworkError(error: unknown): boolean {
  // A failed fetch is a TypeError with one of these messages, depending on the browser;
  // any other TypeError is a bug in the client and must not read as "cannot reach the server".
  // supabase-js wraps it in an error whose message names the TypeError.
  const message = asErrorLike(error)?.message
  return typeof message === 'string' && NETWORK_MESSAGE.test(message)
}

/**
 * A call's own wording for some codes, where the generic text would be vague: for example
 * "already deleted" for delete_budget's budget_not_found.
 */
export type DbErrorOverrides = Partial<Record<DbErrorCode, ParseKeys>>

// R-APP-004: every stable code has its own text; anything else a generic one.
/** Translation key for any error a database call can produce. */
export function dbErrorKey(
  error: unknown,
  overrides: DbErrorOverrides = {},
): DbErrorKey | ParseKeys {
  const code = dbErrorCode(error)
  if (code) return overrides[code] ?? `errors.db.${code}`
  const like = asErrorLike(error)
  if (like?.code === '42501') return 'errors.forbidden'
  if (like?.code === '23514') return 'errors.invalidValue'
  if (isNetworkError(error)) return 'errors.network'
  return 'errors.generic'
}

export function isNotFoundError(error: unknown): boolean {
  const code = dbErrorCode(error)
  return code !== null && NOT_FOUND_CODES.includes(code)
}
