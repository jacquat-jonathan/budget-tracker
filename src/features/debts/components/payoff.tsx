import { CalendarClockIcon, CircleCheckIcon, TriangleAlertIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { Debt } from '@/features/debts/debt-queries'
import { useMonthYear } from '@/features/debts/use-month-year'
import { cn } from '@/lib/utils'

/**
 * The projection in words, as debt_overview gives it (R-DEBT-005, R-DEBT-074): paid off, ends
 * around a month (an estimate: future periods follow the primary income's schedule) with the
 * payments left, or never at this payment, as a warning with an icon and words.
 */
// R-DEBT-121: the database's projection, said in words; "never ends" never by colour alone.
export function Payoff({ debt, className }: { debt: Debt; className?: string }) {
  const { t } = useTranslation()
  const monthYear = useMonthYear()
  if (!debt.is_active || debt.payoff === null) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)} data-testid="payoff">
        {t('debts.payoff.none')}
      </p>
    )
  }
  if (debt.payoff === 'paid_off') {
    return (
      <p
        className={cn('flex items-center gap-1.5 text-sm font-medium text-positive', className)}
        data-testid="payoff"
      >
        <CircleCheckIcon className="size-4 shrink-0" aria-hidden />
        {t('debts.payoff.paidOff')}
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
          {t('debts.payoff.never')}
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
        <span className="block text-xs text-muted-foreground">{t('debts.payoff.estimate')}</span>
      </span>
    </p>
  )
}
