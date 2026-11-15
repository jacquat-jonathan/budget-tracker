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
  'end_date_before_last_period',
  'boundary_is_budget_end',
  'income_is_primary',
  'income_ended',
  'budget_ended',
  'budget_limit_reached',
  'member_limit_reached',
  'invitation_limit_reached',
  'income_limit_reached',
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

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true
  const message = asErrorLike(error)?.message
  // supabase-js reports a failed fetch as an error whose message names the TypeError.
  return typeof message === 'string' && /failed to fetch|networkerror|load failed/i.test(message)
}

/** Translation key for any error a database call can produce. */
export function dbErrorKey(error: unknown): DbErrorKey {
  const code = dbErrorCode(error)
  if (code) return `errors.db.${code}`
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
