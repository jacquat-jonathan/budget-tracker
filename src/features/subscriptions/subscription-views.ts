import { useTranslation } from 'react-i18next'

import type { Debt } from '@/features/debts/debt-queries'
import type { Subscription } from '@/features/subscriptions/subscription-queries'
import type { FieldView } from '@/hooks/use-edit-base'
import { formatCalendarDate } from '@/lib/date'
import { formatInterestRate } from '@/lib/interest-rate'
import { formatMoney } from '@/lib/money'

/** "Streaming" or "Leisure › Streaming", as categories are named elsewhere. */
export function useCategoryPath() {
  const { t } = useTranslation()
  return (name: string | null, parent: string | null) =>
    name === null ? '' : parent ? t('categories.path', { parent, name }) : name
}

/**
 * Subscriptions' and debts' fields as a person reads them, for concurrent edits
 * (R-CONCURRENCY-091). A subscription's price, cadence and schedule only mean something
 * together: they are one field (R-SUBSCRIPTION-122). A debt's rate and planned payment are
 * independent.
 */
export function useSubscriptionViews() {
  const { t } = useTranslation()
  const path = useCategoryPath()
  return {
    subscription: (subscription: Subscription): FieldView[] => [
      { key: 'name', label: t('concurrent.fields.name'), value: subscription.name },
      {
        key: 'terms',
        label: t('subscriptions.fields.terms'),
        value: t('subscriptions.termsWithSchedule', {
          price: t(`subscriptions.pricePer.${subscription.cadence}`, {
            amount: formatMoney(subscription.price),
          }),
          date: formatCalendarDate(subscription.anchor_date),
        }),
        // One field for conflicts (D-160): the form's price, cadence and new next charge date.
        fields: ['price', 'cadence', 'chargeDate'],
      },
      {
        key: 'category',
        label: t('concurrent.fields.category'),
        value: path(subscription.category_name, subscription.parent_category_name),
        fields: ['categoryId'],
      },
    ],
    debt: (debt: Debt): FieldView[] => [
      { key: 'name', label: t('concurrent.fields.name'), value: debt.name },
      {
        key: 'category',
        label: t('concurrent.fields.category'),
        value: path(debt.category_name, debt.parent_category_name),
        fields: ['categoryId'],
      },
      {
        key: 'principal',
        label: t('debts.fields.principal'),
        value: formatMoney(debt.principal),
      },
      {
        key: 'rate',
        label: t('debts.fields.rate'),
        value:
          debt.interest_rate === 0
            ? t('debts.noInterest')
            : t('debts.ratePerYear', { rate: formatInterestRate(debt.interest_rate) }),
      },
      {
        key: 'payment',
        label: t('debts.fields.payment'),
        value: formatMoney(debt.monthly_payment),
        fields: ['monthlyPayment'],
      },
    ],
    /** The debt's balance as an adjustment sees it: changing it is what matters there. */
    debtBalance: (debt: Debt): FieldView[] => [
      { key: 'remaining', label: t('debts.remaining'), value: formatMoney(debt.remaining) },
    ],
  }
}
