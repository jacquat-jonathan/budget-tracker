import { HandCoinsIcon, LandmarkIcon, ArrowRightLeftIcon, WorkflowIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { paths } from '@/app/paths'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  unwrap,
  useCurrentPeriod,
  usePeriodDependentQuery,
  usePeriods,
  type PeriodSummary,
} from '@/features/budgets/budget-queries'
import { budgetKeys } from '@/features/budgets/budget-keys'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'
import { pickPeriod, useOlderPeriodsOption } from '@/features/budgets/older-periods'
import { OlderPeriodsItem } from '@/features/budgets/older-periods-item'
import { usePeriodParam } from '@/features/budgets/use-period-param'
import { MoneyFlowDiagram } from '@/features/money-flow/money-flow-diagram'
import { NOT_ASSIGNED, readMoneyFlow, type MoneyFlow } from '@/features/money-flow/money-flow-model'
import { MoneyFlowTable } from '@/features/money-flow/money-flow-table'
import { formatCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { supabase } from '@/lib/supabase'

/** get_money_flow for one period: the plan in force there, never transactions (D-356). */
function useMoneyFlow(budgetId: string, periodId: string | null) {
  return usePeriodDependentQuery(
    budgetId,
    budgetKeys.moneyFlow(budgetId, periodId ?? ''),
    async (): Promise<MoneyFlow | null> =>
      periodId === null
        ? null
        : readMoneyFlow(
            unwrap(
              await supabase.rpc('get_money_flow', {
                p_budget_id: budgetId,
                p_period_id: periodId,
              }),
            ),
          ),
  )
}

/**
 * Where a period's money comes from and where the plan sends it (R-ACCOUNT-006): the diagram,
 * its figures as tables, and a period picker; flows only, no balances (R-ACCOUNT-075). A
 * household without accounts sees its incomes and what to set up next (D-501).
 */
export function MoneyFlowPage() {
  const { t } = useTranslation()
  const { budgetId } = useCurrentBudget()
  const current = useCurrentPeriod(budgetId)
  const periods = usePeriods(budgetId)
  const { period, setPeriod, unknown } = usePeriodParam(budgetId, periods.data, current.data)
  const olderPeriods = useOlderPeriodsOption(budgetId)
  const flow = useMoneyFlow(budgetId, period?.id ?? null)

  const label = (item: PeriodSummary) =>
    t('income.fields.fromPeriod', {
      start: formatCalendarDate(item.start_date),
      end: formatCalendarDate(item.end_date),
    })
  const picker = period && periods.data && (
    <div className="flex w-full flex-col gap-1 sm:w-72">
      <label htmlFor="money-flow-period" className="text-sm font-medium">
        {t('moneyFlow.period')}
      </label>
      <Select value={period.id} onValueChange={pickPeriod(olderPeriods, setPeriod)}>
        <SelectTrigger id="money-flow-period" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {!periods.data.some((item) => item.id === period.id) && (
            <SelectItem value={period.id}>{label(period)}</SelectItem>
          )}
          {periods.data.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.is_current ? t('moneyFlow.currentPeriod', { label: label(item) }) : label(item)}
            </SelectItem>
          ))}
          <OlderPeriodsItem option={olderPeriods} />
        </SelectContent>
      </Select>
    </div>
  )
  const header = (
    <PageHeader
      title={t('nav.moneyFlow')}
      description={t('pages.moneyFlow.description')}
      action={picker}
    />
  )
  const failed = [current, periods, flow].find((query) => query.isError)
  if (failed) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ErrorState
          error={failed.error}
          onRetry={() => {
            current.refetch()
            periods.refetch()
            flow.refetch()
          }}
        />
      </div>
    )
  }
  const data = flow.data
  if (!data || period === undefined) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <LoadingState rows={4} />
      </div>
    )
  }
  const names = new Map(data.accounts.map((account) => [account.id, account.name]))
  const accountName = (id: string | null) =>
    id === null || id === NOT_ASSIGNED ? t('moneyFlow.notAssigned') : (names.get(id) ?? '–')
  const noAccounts = data.accounts.length === 0
  const nothing = data.incomes.length === 0
  const title = t('moneyFlow.diagramTitle', {
    period: period ? label(period) : '',
    incomes: formatMoney(data.total?.incomes ?? 0),
    transfers: formatMoney(data.total?.transfers ?? 0),
  })

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      {header}
      {unknown && (
        <Alert>
          <AlertDescription>{t('transfers.checklist.unknownPeriod')}</AlertDescription>
        </Alert>
      )}
      {nothing ? (
        <EmptyState
          icon={WorkflowIcon}
          title={t('moneyFlow.empty')}
          description={t('moneyFlow.emptyHelp')}
        />
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-col gap-4">
              <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">{t('moneyFlow.incomesTotal')}</dt>
                  <dd className="text-xl font-semibold tabular-nums">
                    {formatMoney(data.total?.incomes ?? 0)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('moneyFlow.transfersTotal')}</dt>
                  <dd className="text-xl font-semibold tabular-nums">
                    {formatMoney(data.total?.transfers ?? 0)}
                  </dd>
                </div>
              </dl>
              <MoneyFlowDiagram flow={data} title={title} />
              <p className="text-xs text-muted-foreground">{t('moneyFlow.howToRead')}</p>
            </CardContent>
          </Card>
          {(noAccounts || data.transfers.length === 0 || data.notAssigned) && (
            <NextSteps
              noAccounts={noAccounts}
              noTransfers={data.transfers.length === 0}
              notAssigned={data.notAssigned !== null && !noAccounts}
            />
          )}
          <MoneyFlowTable flow={data} accountName={accountName} />
          <p className="text-xs text-muted-foreground">{t('moneyFlow.spendingNote')}</p>
        </>
      )}
    </div>
  )
}

/** What to set up next, said only for what is missing (D-501: optional, never blocking). */
function NextSteps({
  noAccounts,
  noTransfers,
  notAssigned,
}: {
  noAccounts: boolean
  noTransfers: boolean
  notAssigned: boolean
}) {
  const { t } = useTranslation()
  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-dashed p-4"
      aria-labelledby="money-flow-next"
      data-testid="money-flow-next"
    >
      <h2 id="money-flow-next" className="font-medium">
        {t('moneyFlow.next.title')}
      </h2>
      <ul className="flex flex-col gap-3 text-sm">
        {noAccounts && (
          <Step
            icon={LandmarkIcon}
            text={t('moneyFlow.next.accounts')}
            to={paths.accounts}
            action={t('moneyFlow.next.accountsAction')}
          />
        )}
        {notAssigned && (
          <Step
            icon={HandCoinsIcon}
            text={t('moneyFlow.next.assign')}
            to={paths.income}
            action={t('moneyFlow.next.assignAction')}
          />
        )}
        {!noAccounts && noTransfers && (
          <Step
            icon={ArrowRightLeftIcon}
            text={t('moneyFlow.next.transfers')}
            to={paths.transfers}
            action={t('moneyFlow.next.transfersAction')}
          />
        )}
      </ul>
    </section>
  )
}

function Step({
  icon: Icon,
  text,
  to,
  action,
}: {
  icon: typeof LandmarkIcon
  text: string
  to: string
  action: string
}) {
  return (
    <li className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <span className="flex items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        {text}
      </span>
      <Button asChild variant="outline" size="sm" className="self-start sm:self-auto">
        <Link to={to}>{action}</Link>
      </Button>
    </li>
  )
}
