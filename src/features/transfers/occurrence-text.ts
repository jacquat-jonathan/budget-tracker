import { useTranslation } from 'react-i18next'

import type { OccurrenceKind } from '@/features/transfers/transfer-queries'
import { calendarDayNumber, formatCalendarDate } from '@/lib/date'

/** An occurrence as a checklist or preview row names it (R-ACCOUNT-510, R-ACCOUNT-518). */
export interface OccurrenceNames {
  kind: OccurrenceKind | null
  /** A dated occurrence's scheduled date; null for a period's own. */
  date: string | null
  /** A period's own occurrence's period number; null for a dated one. */
  seq: number | null
  /** When it is due (a fixed day's moved by its weekend rule); null when no longer planned. */
  dueDate: string | null
  /** The income an 'income_payday' occurrence follows. */
  incomeName: string | null
  /**
   * A row of a transfer's own schedule (checklist, preview): a null income name then means the
   * transfer no longer follows an income, not that the page does not know it.
   */
  incomeDropped?: boolean
  /** Its due date is shown right beside it: a payday's date is not said a second time. */
  besideDue?: boolean
}

/** The period a number names, as the page has it: its dates, and whether it is the row's own. */
export interface PeriodOfSeq {
  start: string
  end: string
  own: boolean
}

/**
 * What an occurrence is for, in words, from what the row carries and nothing worked out:
 * “for the period 25.11.2026 to 24.12.2026”, “on the payday of “Ben”, 10.12.2026”, “fixed day
 * 01.12.2026, moved off the weekend”. A period's own occurrence is told by its number: the
 * page looks that number up among the periods it has; a mark kept with another period's number
 * says it is not this period's, and one whose period is gone (merged back by a reopen) says so.
 */
// R-ACCOUNT-552: every row says what it is for, so two rows of one transfer never read the same.
export function useOccurrenceText() {
  const { t } = useTranslation()
  return (
    row: OccurrenceNames,
    periodOf: (seq: number) => PeriodOfSeq | null,
    /** What to say for a number the page has no period for (default: merged by a reopen). */
    gone?: string,
  ): string => {
    const fmt = formatCalendarDate
    switch (row.kind) {
      case 'period': {
        const period = row.seq === null ? null : periodOf(row.seq)
        if (!period) return gone ?? t('transfers.occurrence.periodGone')
        return t(period.own ? 'transfers.occurrence.period' : 'transfers.occurrence.periodOther', {
          start: fmt(period.start),
          end: fmt(period.end),
        })
      }
      case 'income_payday': {
        const date = row.date ? fmt(row.date) : ''
        const income = row.incomeName
        const dropped = row.incomeDropped === true
        // R-ACCOUNT-552: beside its due date, say how far the due date is from the payday
        // instead of the payday's date: the same date twice, or two dates that seem to disagree.
        const apart =
          row.besideDue && row.date && row.dueDate
            ? calendarDayNumber(row.dueDate) - calendarDayNumber(row.date)
            : null
        if (apart !== null && apart >= 0) {
          if (income) {
            return apart === 0
              ? t('transfers.occurrence.incomePaydayOn', { income })
              : t('transfers.occurrence.incomePaydayAfter', { income, count: apart, date })
          }
          if (dropped) {
            return apart === 0
              ? t('transfers.occurrence.incomePaydayDroppedOn')
              : t('transfers.occurrence.incomePaydayDroppedAfter', { count: apart, date })
          }
        }
        if (income) return t('transfers.occurrence.incomePayday', { income, date })
        return t(
          dropped
            ? 'transfers.occurrence.incomePaydayDropped'
            : 'transfers.occurrence.incomePaydayUnnamed',
          { date },
        )
      }
      case 'fixed_day':
        // The weekend rule moved its due date off the scheduled one: both are said.
        return row.date && row.dueDate && row.dueDate !== row.date
          ? t('transfers.occurrence.fixedDayMoved', { date: fmt(row.date) })
          : t('transfers.occurrence.fixedDay', { date: row.date ? fmt(row.date) : '' })
      default:
        return ''
    }
  }
}

/** The occurrence a transfer's transaction was recorded for, as transaction_list names it. */
interface TransactionOccurrence {
  transfer_occurrence_kind: OccurrenceKind | null
  transfer_occurrence_date: string | null
  transfer_occurrence_seq: number | null
}

/**
 * “Planned transfer “Savings”, for the period 23.10.2026 to 24.11.2026”: what a transfer's
 * transaction was recorded for (its date can lie in another period, a manual one done late). A
 * period's own is told by its number among the periods given; one not among them is not said.
 */
export function useTransactionOccurrence() {
  const { t } = useTranslation()
  const text = useOccurrenceText()
  return (
    row: TransactionOccurrence & { transfer_name: string | null },
    periods: readonly { seq: number; start_date: string; end_date: string }[],
  ): string | null => {
    if (!row.transfer_name) return null
    const occurrence = text(
      {
        kind: row.transfer_occurrence_kind,
        date: row.transfer_occurrence_date,
        seq: row.transfer_occurrence_seq,
        dueDate: null,
        incomeName: null,
      },
      (seq) => {
        const period = periods.find((item) => item.seq === seq)
        return period ? { start: period.start_date, end: period.end_date, own: true } : null
      },
      '',
    )
    return occurrence
      ? t('transfers.transaction.ofOccurrence', { name: row.transfer_name, occurrence })
      : t('transfers.transaction.of', { name: row.transfer_name })
  }
}
