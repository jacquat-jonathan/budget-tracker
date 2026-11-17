import type {
  ChecklistRow,
  CreateArgs,
  TransferCadence,
  TransferSchedule,
  TransferTermsArgs,
} from '@/features/transfers/transfer-queries'

/** What the transfer form holds (the terms and the period choices). */
export interface TransferFormValues {
  name: string
  fromAccountId: string
  toAccountId: string
  amount: number
  mode: 'automatic' | 'manual'
  schedule: TransferSchedule
  /** "" for the primary income. */
  incomeId: string
  offsetDays: number
  cadence: TransferCadence
  /** Monthly: the day of the month. */
  dayOfMonth: number
  /** Quarterly or yearly: the first (create) or a new next (edit, "" keeps it) due date. */
  firstDate: string
  /** Counts as spending in a category. */
  linked: boolean
  categoryId: string
  /** Create: record what already happened since `fromPeriodId`. Edit: a correction from it. */
  past: boolean
  fromPeriodId: string
}

/** The terms an edit compares with: those in force now, or in the corrected period. */
export interface TransferTermsBase {
  from_account_id: string
  to_account_id: string
  amount: number
  schedule: TransferSchedule
  offset_days: number | null
  day_of_month: number | null
  income_id: string | null
  is_automatic: boolean
  category_id: string | null
  cadence: TransferCadence | null
  first_date: string | null
}

/** A monthly fixed day is chosen as a day; a quarterly or yearly one by its date (its phase). */
export function needsFirstDate(values: Pick<TransferFormValues, 'schedule' | 'cadence'>) {
  return values.schedule === 'day_of_month' && values.cadence !== 'monthly'
}

/**
 * create_transfer's arguments for what the form holds (D-502): the earlier occurrences are
 * asked for only when the member chose to record what already happened (p_from_period_id);
 * otherwise nothing dated before today is planned (D-493). A quarterly or yearly transfer is
 * given its next due date as its first date, never one before today unless asked.
 */
// R-ACCOUNT-315: nothing before today unless the member asks for it.
export function createArgs(values: TransferFormValues): CreateArgs {
  const schedule =
    values.schedule === 'pay_date'
      ? {
          p_offset_days: values.offsetDays,
          ...(values.incomeId ? { p_income_id: values.incomeId } : {}),
        }
      : {
          p_cadence: values.cadence,
          ...(needsFirstDate(values)
            ? { p_first_date: values.firstDate }
            : { p_day_of_month: values.dayOfMonth }),
        }
  return {
    p_from_account_id: values.fromAccountId,
    p_to_account_id: values.toAccountId,
    p_amount: values.amount,
    p_schedule: values.schedule,
    p_is_automatic: values.mode === 'automatic',
    ...schedule,
    ...(values.linked && values.categoryId ? { p_category_id: values.categoryId } : {}),
    ...(values.past && values.fromPeriodId ? { p_from_period_id: values.fromPeriodId } : {}),
  }
}

/** Whether the schedule (one group of fields, D-160) differs from the terms it started from. */
export function scheduleChanged(base: TransferTermsBase, values: TransferFormValues): boolean {
  if (values.schedule !== base.schedule) return true
  if (values.schedule === 'pay_date') {
    return values.offsetDays !== base.offset_days || (values.incomeId || null) !== base.income_id
  }
  if (values.cadence !== base.cadence) return true
  if (values.cadence === 'monthly') return values.dayOfMonth !== base.day_of_month
  return values.firstDate !== ''
}

/**
 * The terms part of an edit: only what differs from the terms the form started from (for a
 * correction, those of its period), the schedule sent as one group when any of it changed.
 * An income kept from before is not sent again (it may have ended, D-396). A correction that
 * changes no term is no correction. preview_update_transfer receives exactly these.
 */
// R-VERSION-071: an edit applies from the current period, or from the corrected one.
export function editArgs(
  base: TransferTermsBase,
  values: TransferFormValues,
  correction: string | null,
): TransferTermsArgs {
  const category = values.linked && values.categoryId ? values.categoryId : null
  const schedule = scheduleChanged(base, values)
  const switched = values.schedule !== base.schedule
  const terms: TransferTermsArgs = {
    ...(values.fromAccountId !== base.from_account_id
      ? { p_from_account_id: values.fromAccountId }
      : {}),
    ...(values.toAccountId !== base.to_account_id ? { p_to_account_id: values.toAccountId } : {}),
    ...(values.amount !== base.amount ? { p_amount: values.amount } : {}),
    ...((values.mode === 'automatic') !== base.is_automatic
      ? { p_is_automatic: values.mode === 'automatic' }
      : {}),
    ...(category !== base.category_id
      ? category
        ? { p_category_id: category }
        : { p_clear_category: true }
      : {}),
  }
  if (schedule) {
    terms.p_schedule = values.schedule
    if (values.schedule === 'pay_date') {
      terms.p_offset_days = values.offsetDays
      const income = values.incomeId || null
      if (income !== (switched ? null : base.income_id)) {
        if (income) terms.p_income_id = income
        else terms.p_clear_income = true
      }
    } else {
      terms.p_cadence = values.cadence
      if (values.cadence === 'monthly') terms.p_day_of_month = values.dayOfMonth
      else if (values.firstDate) terms.p_first_date = values.firstDate
    }
  }
  if (correction && Object.keys(terms).length > 0) terms.p_from_period_id = correction
  return terms
}

/**
 * What can be done with an occurrence, from its state as the checklist gives it (the
 * contract's table): a manual one to do is done or skipped; an automatic one not yet marked by
 * a member can be said not to have happened; any member's mark, or a mark no longer planned,
 * can be undone. Every state has a way out.
 */
// R-ACCOUNT-005 R-ACCOUNT-240: the marks the contract allows, from every state.
/**
 * An occurrence on the page: its transfer, its period and its date. The same date can be an
 * occurrence of two periods (R-ACCOUNT-421), so the date alone never names one.
 */
// R-ACCOUNT-446: rows, focus and the rows kept in place are keyed with the period.
export function occurrenceKey(
  row: Pick<ChecklistRow, 'transfer_id' | 'period_id' | 'occurrence_date'>,
): string {
  return `${row.period_id ?? ''}|${row.transfer_id ?? ''}|${row.occurrence_date ?? ''}`
}

export function actionsFor(row: ChecklistRow) {
  const marked = (row.mark_revision ?? 0) > 0
  const assumed = row.assumed === true
  const planned = row.planned !== false
  const automatic = row.is_automatic === true
  const memberMark = marked && !assumed
  return {
    done: planned && !automatic && row.status === 'to_do',
    skip: planned && !automatic && row.status === 'to_do',
    notDone:
      planned &&
      automatic &&
      !memberMark &&
      (row.status === 'upcoming' || (row.status === 'done' && assumed)),
    // The catch-up's own transaction of a manual occurrence kept from when it was automatic
    // is a mark too (assumed): undo leads out of it.
    undo: !planned ? marked : memberMark || (marked && assumed && !automatic),
  }
}
