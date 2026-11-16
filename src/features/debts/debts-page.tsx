import { CalendarOffIcon, ChevronRightIcon, CreditCardIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'

import { debtPath } from '@/app/paths'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useCurrentPeriod, usePeriods } from '@/features/budgets/budget-queries'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'
import { DebtFormDialog } from '@/features/debts/components/debt-form-dialog'
import { Payoff } from '@/features/debts/components/payoff'
import { isVoidDebt, paidShare, useDebts, type Debt } from '@/features/debts/debt-queries'
import { useCategoryPath } from '@/features/subscriptions/subscription-views'
import { formatInterestRate } from '@/lib/interest-rate'
import { formatMoney } from '@/lib/money'

/**
 * The debts in force: what remains of each, how much is paid off, the planned payment and
 * rate, and the projection in words; the total remaining; ended ones below. Every figure is
 * the database's: the only thing done here is adding up the remaining amounts it gives.
 */
// R-DEBT-121: remaining, paid off, projection and total, from debt_overview.
export function DebtsPage() {
  const { t } = useTranslation()
  const { budgetId } = useCurrentBudget()
  const debts = useDebts(budgetId)
  const current = useCurrentPeriod(budgetId)
  const periods = usePeriods(budgetId)
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const ended = current.isSuccess && current.data === null

  const header = (
    <PageHeader
      title={t('nav.debts')}
      description={t('pages.debts.description')}
      action={
        <Button onClick={() => setAdding(true)} disabled={!current.isSuccess || ended}>
          <PlusIcon />
          {t('debts.add')}
        </Button>
      }
    />
  )
  const failed = [debts, current, periods].find((query) => query.isError)
  if (failed) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ErrorState
          error={failed.error}
          onRetry={() => {
            debts.refetch()
            current.refetch()
            periods.refetch()
          }}
        />
      </div>
    )
  }
  if (!debts.data || current.data === undefined || !periods.data) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <LoadingState rows={3} />
      </div>
    )
  }
  const active = debts.data.filter((debt) => debt.is_active)
  const endedDebts = debts.data.filter((debt) => !debt.is_active && !isVoidDebt(debt))
  // D-191: the total is the sum of the remaining amounts the database gives (integers).
  const total = active.reduce((sum, debt) => sum + debt.remaining, 0)

  return (
    <div className="flex flex-col gap-6">
      {header}
      {ended && (
        <Alert>
          <CalendarOffIcon aria-hidden />
          <AlertTitle>{t('budgetEnded.title')}</AlertTitle>
          <AlertDescription>{t('debts.endedBudget')}</AlertDescription>
        </Alert>
      )}
      {active.length > 0 && (
        <Card size="sm" data-testid="debts-total">
          <CardContent className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-muted-foreground">
              {t('debts.totalRemaining', { count: active.length })}
            </span>
            <span className="text-2xl font-semibold tabular-nums">{formatMoney(total)}</span>
          </CardContent>
        </Card>
      )}
      {active.length === 0 ? (
        <EmptyState
          icon={CreditCardIcon}
          title={t('debts.empty')}
          description={t('debts.emptyHelp')}
          action={
            !ended && (
              <Button onClick={() => setAdding(true)}>
                <PlusIcon />
                {t('debts.addFirst')}
              </Button>
            )
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2" aria-label={t('debts.listLabel')}>
          {active.map((debt) => (
            <DebtCard key={debt.id} debt={debt} />
          ))}
        </ul>
      )}
      {endedDebts.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">{t('debts.endedTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('debts.endedHelp')}</p>
          <ul className="flex flex-col divide-y rounded-xl border">
            {endedDebts.map((debt) => (
              <li key={debt.id}>
                <Link
                  to={debtPath(debt.id)}
                  className="flex items-center gap-3 p-3 text-sm hover:bg-muted/50"
                  data-testid="ended-debt"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{debt.name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {t('debts.remainingAmount', { amount: formatMoney(debt.remaining) })}
                  </span>
                  <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <DebtFormDialog
        budgetId={budgetId}
        open={adding}
        onOpenChange={setAdding}
        periods={periods.data}
        currentPeriod={current.data}
        onCreated={(id) => void navigate(debtPath(id))}
      />
    </div>
  )
}

function DebtCard({ debt }: { debt: Debt }) {
  const { t } = useTranslation()
  const path = useCategoryPath()
  const share = paidShare(debt)
  return (
    <li data-testid="debt-card">
      <Card size="sm" className="relative h-full">
        <CardContent className="flex h-full flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate font-medium">
                <Link
                  to={debtPath(debt.id)}
                  className="underline-offset-4 after:absolute after:inset-0 hover:underline"
                >
                  {debt.name}
                </Link>
              </h2>
              <p className="truncate text-xs text-muted-foreground">
                {path(debt.category_name, debt.parent_category_name)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs text-muted-foreground">{t('debts.remaining')}</p>
              <p className="text-lg font-semibold tabular-nums" data-testid="debt-remaining">
                {formatMoney(debt.remaining)}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Progress value={share} aria-label={t('debts.paidShare', { percent: share })} />
            <p className="text-xs text-muted-foreground tabular-nums">
              {t('debts.paidSoFar', { amount: formatMoney(debt.paid_total), percent: share })}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">{t('debts.fields.payment')}</dt>
              <dd className="font-medium tabular-nums">{formatMoney(debt.monthly_payment)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('debts.fields.rate')}</dt>
              <dd className="font-medium tabular-nums">
                {debt.interest_rate === 0
                  ? t('debts.noInterest')
                  : t('debts.ratePerYear', { rate: formatInterestRate(debt.interest_rate) })}
              </dd>
            </div>
          </dl>
          <Payoff debt={debt} className="mt-auto" />
        </CardContent>
      </Card>
    </li>
  )
}
