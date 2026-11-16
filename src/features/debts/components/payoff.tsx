import { CalendarClockIcon, CircleCheckIcon, TriangleAlertIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { Debt } from '@/features/debts/debt-queries'
import { useMonthYear } from '@/features/debts/use-month-year'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

/**
 * The projection in words, as debt_overview gives it (R-DEBT-005, R-DEBT-074): paid off, ends
 * around a month (an estimate: future periods follow the primary income's schedule) with the
 * payments left, or never at this payment, as a warning with an icon and words.
 */
// R-DEBT-121: the database's projection, said in words; "never ends" never by colour alone,
// an end after the budget's end said as such.
export function Payoff({
  debt,
  budgetEnded = false,
  className,
}: {
  debt: Debt
  /** No current period: the database projects nothing for any debt. */
  budgetEnded?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const monthYear = useMonthYear()
  // Paid off (or overpaid) is a fact of the remaining amount, whatever the projection.
  if (debt.payoff === 'paid_off' || debt.remaining <= 0) {
    return (
      <p
        className={cn('flex items-center gap-1.5 text-sm font-medium text-positive', className)}
        data-testid="payoff"
      >
        <CircleCheckIcon className="size-4 shrink-0" aria-hidden />
        {debt.overpaid_by > 0
          ? t('debts.payoff.overpaid', { amount: formatMoney(debt.overpaid_by) })
          : t('debts.payoff.paidOff')}
      </p>
    )
  }
  if (debt.payoff === null) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)} data-testid="payoff">
        {debt.end_seq !== null
          ? t('debts.payoff.none')
          : budgetEnded
            ? t('debts.payoff.budgetEnded')
            : t('debts.payoff.unknown')}
      </p>
    )
  }
  if (debt.payoff === 'never') {
    return (
      <p
        className={cn(
          'flex items-start gap-1.5 rounded-md bg-destructive/10 px-2 py-1 text-sm font-medium text-destructive',
          className,
        )}
        data-testid="payoff"
        data-never
      >
        <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          {debt.monthly_payment === 0 ? t('debts.payoff.noPayment') : t('debts.payoff.never')}
          <span className="block text-xs font-normal">
            {debt.monthly_payment === 0
              ? t('debts.payoff.neverNoPayment')
              : t('debts.payoff.neverHelp')}
          </span>
        </span>
      </p>
    )
  }
  return (
    <p className={cn('flex items-start gap-1.5 text-sm', className)} data-testid="payoff">
      <CalendarClockIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span>
        <span className="font-medium">
          {debt.expected_end_date
            ? t('debts.payoff.ends', { month: monthYear(debt.expected_end_date) })
            : t('debts.payoff.endsNoDate')}
        </span>
        {' · '}
        {t('debts.payoff.paymentsLeft', { count: debt.payments_left ?? 0 })}
        {debt.expected_end_after_budget_end && (
          <span className="block text-xs font-medium" data-testid="payoff-after-budget-end">
            {t('debts.payoff.afterBudgetEnd')}
          </span>
        )}
        <span className="block text-xs text-muted-foreground">{t('debts.payoff.estimate')}</span>
      </span>
    </p>
  )
}
