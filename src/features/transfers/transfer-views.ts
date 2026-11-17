import { useTranslation } from 'react-i18next'

import { useCategoryPath, useChargeDayText } from '@/features/subscriptions/subscription-views'
import type { Transfer, TransferCadence } from '@/features/transfers/transfer-queries'
import type { FieldView } from '@/hooks/use-edit-base'
import { calendarMonth, isCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'

/** The terms a sentence is made of: a transfer's, or a checklist or flow row's. */
interface ScheduleTerms {
  schedule: 'pay_date' | 'day_of_month'
  offset_days: number | null
  day_of_month: number | null
  cadence: TransferCadence | null
  income_name: string | null
  follows_primary?: boolean
  /** A yearly schedule says its month: the first date's (its phase). */
  first_date?: string | null
}

/** "On payday", "2 days after payday of “Sam’s salary”", "Every month on the 1st"… */
export function useScheduleText() {
  const { t, i18n } = useTranslation()
  const dayText = useChargeDayText()
  return (terms: ScheduleTerms) => {
    if (terms.schedule === 'pay_date') {
      const offset = terms.offset_days ?? 0
      const when =
        offset === 0 ? t('transfers.when.payday') : t('transfers.when.after', { count: offset })
      // A chosen income that ended or was deleted: it follows the primary income (D-426).
      return terms.income_name && !terms.follows_primary
        ? t('transfers.when.ofIncome', { when, income: terms.income_name })
        : when
    }
    if (terms.cadence === 'yearly' && terms.first_date && isCalendarDate(terms.first_date)) {
      const { year, month } = calendarMonth(terms.first_date)
      const day = Number(terms.first_date.slice(8, 10))
      // A fixed UTC instant formatted in UTC: no time zone can move it to another day.
      const date = new Intl.DateTimeFormat(i18n.language, {
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
      }).format(Date.UTC(year, month - 1, day))
      return t('transfers.when.yearlyOn', { date })
    }
    return t(`transfers.when.${terms.cadence ?? 'monthly'}`, {
      day: dayText(terms.day_of_month ?? 1),
    })
  }
}

/** "CHF 500.00", or "CHF 7'056.00 once a year" for a quarterly or yearly one. */
export function useAmountText() {
  const { t } = useTranslation()
  return (amount: number, cadence: TransferCadence | null) =>
    cadence === 'quarterly' || cadence === 'yearly'
      ? t(`transfers.amountPer.${cadence}`, { amount: formatMoney(amount) })
      : formatMoney(amount)
}

/** A transfer's fields as a person reads them, for concurrent edits (R-CONCURRENCY-091). */
export function useTransferViews() {
  const { t } = useTranslation()
  const schedule = useScheduleText()
  const amount = useAmountText()
  const path = useCategoryPath()
  return (transfer: Transfer): FieldView[] => [
    { key: 'name', label: t('concurrent.fields.name'), value: transfer.name },
    {
      key: 'accounts',
      label: t('transfers.fields.accounts'),
      value: t('transfers.fromTo', {
        from: transfer.from_account_name,
        to: transfer.to_account_name,
      }),
      fields: ['fromAccountId', 'toAccountId'],
    },
    {
      key: 'amount',
      label: t('transfers.fields.amount'),
      value: amount(transfer.amount, transfer.cadence),
    },
    {
      key: 'mode',
      label: t('transfers.fields.mode'),
      value: t(transfer.is_automatic ? 'transfers.mode.automatic' : 'transfers.mode.manual'),
      fields: ['mode'],
    },
    {
      // One field for conflicts (D-160): when it runs only means something as a whole.
      key: 'schedule',
      label: t('transfers.fields.when'),
      value: schedule(transfer),
      fields: ['schedule', 'incomeId', 'offsetDays', 'cadence', 'dayOfMonth', 'firstDate'],
    },
    {
      key: 'category',
      label: t('concurrent.fields.category'),
      value: transfer.category_id
        ? path(transfer.category_name, transfer.parent_category_name)
        : t('transfers.noCategory'),
      fields: ['linked', 'categoryId'],
    },
  ]
}
