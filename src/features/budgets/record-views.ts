import { useTranslation } from 'react-i18next'

import type { IncomeOverview, MyBudget } from '@/features/budgets/budget-queries'
import type { Category } from '@/features/categories/category-queries'
import type { Transaction } from '@/features/transactions/transaction-queries'
import type { FieldView } from '@/hooks/use-edit-base'
import { formatCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'

/**
 * Each editable record's fields as a person reads them: what a form compares to notice
 * another member's change, and what it shows of their version (R-CONCURRENCY-091).
 */
export function useRecordViews() {
  const { t } = useTranslation()
  const label = (
    key:
      | 'name'
      | 'amount'
      | 'payDay'
      | 'weekendRule'
      | 'kind'
      | 'date'
      | 'category'
      | 'note'
      | 'endDate',
  ) => t(`concurrent.fields.${key}`)
  return {
    budgetName: (budget: MyBudget): FieldView[] => [
      { key: 'name', label: label('name'), value: budget.name },
    ],
    budgetPrimary: (budget: MyBudget, incomes: readonly IncomeOverview[]): FieldView[] => [
      {
        key: 'primary',
        label: t('concurrent.fields.primary'),
        value:
          incomes.find((income) => income.id === budget.primary_income_id)?.name ??
          t('concurrent.none'),
      },
    ],
    budgetEnd: (budget: MyBudget): FieldView[] => [
      {
        key: 'endDate',
        label: label('endDate'),
        value: budget.end_date_entered
          ? formatCalendarDate(budget.end_date_entered)
          : t('concurrent.none'),
      },
    ],
    income: (income: IncomeOverview): FieldView[] => [
      { key: 'name', label: label('name'), value: income.name },
      { key: 'amount', label: label('amount'), value: formatMoney(income.amount) },
      {
        // One field: a pay day only means something with its weekend rule (D-160).
        key: 'payDay',
        fields: ['payDay', 'weekendRule'],
        label: label('payDay'),
        value: t('income.payDayWithRule', {
          day: income.pay_day,
          rule: t(`income.weekendRule.${income.weekend_rule}.short`),
        }),
      },
      {
        key: 'account',
        fields: ['accountId'],
        label: t('accounts.income.viewLabel'),
        value: income.account_name ?? t('accounts.income.none'),
      },
    ],
    category: (category: Category): FieldView[] => [
      { key: 'name', label: label('name'), value: category.name },
      ...(category.is_group || category.amount === null || category.cadence === null
        ? []
        : [
            {
              // One field: an amount only means something with its cadence (D-160).
              key: 'amount',
              fields: ['amount', 'cadence'],
              label: label('amount'),
              value: t(`concurrent.amountPer.${category.cadence}`, {
                amount: formatMoney(category.amount),
              }),
            },
          ]),
    ],
    transaction: (transaction: Transaction): FieldView[] => [
      { key: 'kind', label: label('kind'), value: t(`transactions.kind.${transaction.kind}`) },
      { key: 'amount', label: label('amount'), value: formatMoney(transaction.amount) },
      { key: 'date', label: label('date'), value: formatCalendarDate(transaction.date) },
      {
        key: 'category',
        fields: ['categoryId'],
        label: label('category'),
        value: transaction.category_name
          ? transaction.parent_category_name
            ? t('categories.path', {
                parent: transaction.parent_category_name,
                name: transaction.category_name,
              })
            : transaction.category_name
          : t('concurrent.none'),
      },
      {
        key: 'note',
        fields: ['description'],
        label: label('note'),
        value: transaction.description ?? t('concurrent.none'),
      },
    ],
  }
}
