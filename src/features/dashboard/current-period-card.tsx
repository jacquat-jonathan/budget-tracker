import { CalendarCheckIcon, CalendarRangeIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { paths } from '@/app/paths'
import { CalendarDate } from '@/components/form/calendar-date-field'
import { ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useCurrentPeriod, useIncomes } from '@/features/budgets/budget-queries'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'
import { periodProgress } from '@/features/dashboard/period-progress'
import { formatCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'

/** The dashboard's first card: the current period at a glance. */
export function CurrentPeriodCard() {
  const { t } = useTranslation()
  const { budgetId, budget } = useCurrentBudget()
  const current = useCurrentPeriod(budgetId)
  const incomes = useIncomes(budgetId)

  if (current.isPending) return <LoadingState rows={1} className="md:col-span-2" />
  if (current.isError) {
    return (
      <ErrorState
        className="md:col-span-2"
        error={current.error}
        onRetry={() => void current.refetch()}
      />
    )
  }

  const period = current.data
  if (!period) {
    return (
      <Card className="md:col-span-2" data-testid="budget-ended-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarCheckIcon className="size-4 text-muted-foreground" aria-hidden />
            <h2>{t('dashboard.ended.title')}</h2>
          </CardTitle>
          <CardDescription>
            {budget.end_date
              ? t('dashboard.ended.description', { date: formatCalendarDate(budget.end_date) })
              : t('dashboard.ended.descriptionNoDate')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to={paths.periods}>{t('dashboard.ended.seePeriods')}</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={paths.settings}>{t('dashboard.ended.settings')}</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const { day, total, percent } = periodProgress(period, period.today ?? period.start_date)
  const primary = incomes.data?.find((income) => income.is_primary)
  const nextPayDate = primary?.next_pay_date ?? null

  return (
    <Card className="md:col-span-2" data-testid="current-period-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarRangeIcon className="size-4 text-muted-foreground" aria-hidden />
          <h2>{t('dashboard.period.title')}</h2>
        </CardTitle>
        <CardDescription>
          <CalendarDate value={period.start_date} /> – <CalendarDate value={period.end_date} />
          {period.end_is_manual && (
            <Badge variant="outline" className="ml-2">
              {t('periods.manualEnd')}
            </Badge>
          )}
        </CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link to={paths.periods}>{t('dashboard.period.allPeriods')}</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">{t('dashboard.period.dayOf', { day, total })}</span>
            <span className="text-muted-foreground">
              {t('dashboard.period.daysLeft', { count: total - day })}
            </span>
          </div>
          <Progress value={percent} aria-label={t('dashboard.period.dayOf', { day, total })} />
        </div>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <dt className="text-sm text-muted-foreground">{t('dashboard.period.incomeTotal')}</dt>
            <dd className="text-2xl font-semibold tabular-nums">
              {formatMoney(period.income_total ?? 0)}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-sm text-muted-foreground">{t('dashboard.period.nextPayDay')}</dt>
            <dd className="text-2xl font-semibold">
              {nextPayDate ? <CalendarDate value={nextPayDate} /> : '–'}
            </dd>
            {primary && (
              <dd className="text-sm text-muted-foreground">
                {t('dashboard.period.nextPayDayOf', { name: primary.name })}
              </dd>
            )}
          </div>
        </dl>
      </CardContent>
    </Card>
  )
}
