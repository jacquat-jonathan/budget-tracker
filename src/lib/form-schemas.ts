import { z } from 'zod'

import { isCalendarDate } from '@/lib/date'

/**
 * Field schemas shared by the step 2 forms. As in src/features/auth/schemas.ts, messages are
 * translation keys that the fields translate when rendering.
 */

/** Income amounts (docs/database.md): 1 rappen to CHF 10 million. */
export const MIN_INCOME_RAPPEN = 1
export const MAX_INCOME_RAPPEN = 1_000_000_000
/** Expectation amounts (docs/database.md): 0 to CHF 10 million, per month or per year. */
export const MIN_EXPECTATION_RAPPEN = 0
/** Transaction descriptions: at most 500 characters. */
export const DESCRIPTION_MAX_LENGTH = 500

/** Budget and income names: trimmed, 1 to 100 characters (docs/database.md). */
export const NAME_MAX_LENGTH = 100

/**
 * A money field holds integer rappen, null when empty, or NaN when the text is not an
 * amount (see MoneyField). The output is the rappen.
 */
export function rappenSchema({
  min = MIN_INCOME_RAPPEN,
  max = MAX_INCOME_RAPPEN,
  tooSmall = 'validation.amountTooSmall',
}: { min?: number; max?: number; tooSmall?: string } = {}) {
  return z
    .custom<number | null>((value) => value === null || typeof value === 'number')
    .superRefine((value, ctx) => {
      if (value === null) {
        ctx.addIssue({ code: 'custom', message: 'validation.amountRequired' })
      } else if (!Number.isSafeInteger(value)) {
        ctx.addIssue({ code: 'custom', message: 'validation.amountInvalid' })
      } else if (value < min) {
        ctx.addIssue({ code: 'custom', message: tooSmall })
      } else if (value > max) {
        ctx.addIssue({ code: 'custom', message: 'validation.amountTooLarge' })
      }
    })
    .transform((value) => value ?? 0)
}

/** A name as the database wants it: trimmed, 1 to 100 characters. */
export const nameSchema = z
  .string()
  .trim()
  .min(1, { error: 'validation.nameRequired' })
  .max(NAME_MAX_LENGTH, { error: 'validation.nameTooLong' })

/**
 * A calendar-date field holds "YYYY-MM-DD", "" when empty, or the raw text when it is not a
 * date (see CalendarDateField).
 */
export const optionalCalendarDateSchema = z
  .string()
  .refine((value) => value === '' || isCalendarDate(value), { error: 'validation.dateInvalid' })
  .transform((value) => (value === '' ? null : value))

export const calendarDateSchema = z
  .string()
  .refine((value) => value !== '', { error: 'validation.dateRequired' })
  .refine((value) => value === '' || isCalendarDate(value), { error: 'validation.dateInvalid' })

export const payDaySchema = z.number().int().min(1).max(31)

export const weekendRuleSchema = z.enum(['nearest', 'previous', 'next', 'none'])
