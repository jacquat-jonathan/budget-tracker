import {
  ArrowRightLeftIcon,
  HandCoinsIcon,
  LandmarkIcon,
  TriangleAlertIcon,
  WorkflowIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'

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
import {
  basisFigures,
  NOT_ASSIGNED,
  readMoneyFlow,
  type Basis,
  type FlowTotal,
  type MoneyFlow,
} from '@/features/money-flow/money-flow-model'
import { MoneyFlowTable } from '@/features/money-flow/money-flow-table'
import { useTransfers } from '@/features/transfers/transfer-queries'
import { formatCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

/** get_money_flow for one period: its plan, and what its transactions spent (D-524). */
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
 * Where a period's money comes from and where it goes (R-ACCOUNT-006, R-ACCOUNT-422): the
 * database's totals as four tiles, the diagram, its figures as tables, planned or actual and a
 * period picker in the address; flows only, no balances (R-ACCOUNT-075). A household without
 * accounts sees its incomes and what to set up next (D-501).
 */
export function MoneyFlowPage() {
  const { t } = useTranslation()
  const { budgetId } = useCurrentBudget()
  const current = useCurrentPeriod(budgetId)
  const periods = usePeriods(budgetId)
  const { period, setPeriod, unknown } = usePeriodParam(budgetId, periods.data, current.data)
  const olderPeriods = useOlderPeriodsOption(budgetId)
  const flow = useMoneyFlow(budgetId, period?.id ?? null)
  // Which transfers are counted as spending (linked to a category): only they record
  // transactions, so only they get a link to them. The read does not say; the list does.
  const transferList = useTransfers(budgetId)
  const counted = new Set(
    (transferList.data ?? []).filter((item) => item.category_id).map((item) => item.id),
  )
  const [params] = useSearchParams()
  const basis: Basis = params.get('basis') === 'actual' ? 'actual' : 'planned'

  const label = (item: PeriodSummary) =>
    t('income.fields.fromPeriod', {
      start: formatCalendarDate(item.start_date),
      end: formatCalendarDate(item.end_date),
    })
  const picker = period && periods.data && (
    <div className="flex w-full flex-col gap-1 sm:w-96">
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
  const nothing = data.incomes.length === 0 && data.spending.length === 0
  const total = data.total
  const periodLabel = period ? label(period) : ''
  const figures = total ? basisFigures(total, basis) : null
  const title =
    total && figures
      ? t(`moneyFlow.diagramTitle.${basis}`, {
          period: periodLabel,
          incomes: formatMoney(total.incomes),
          setAside: formatMoney(total.setAside),
          spendable: formatMoney(total.spendable),
          spending: formatMoney(figures.spending),
          rest: formatMoney(figures.rest),
        })
      : periodLabel

  return (
    // Wider than the usual page: the diagram's columns use the room; the tables keep theirs.
    <div className="flex max-w-[96rem] min-w-0 flex-col gap-6">
      {header}
      {unknown && (
        <Alert>
          <AlertDescription>{t('transfers.checklist.unknownPeriod')}</AlertDescription>
        </Alert>
      )}
      <BasisTabs basis={basis} />
      {nothing ? (
        <EmptyState
          icon={WorkflowIcon}
          title={t('moneyFlow.empty')}
          description={t('moneyFlow.emptyHelp')}
        />
      ) : (
        <>
          <section className="flex flex-col gap-1" aria-labelledby="money-flow-heading">
            <h2 id="money-flow-heading" className="text-lg font-semibold tracking-tight">
              {t(`moneyFlow.heading.${basis}`, { period: periodLabel })}
            </h2>
            <p className="text-sm text-muted-foreground">{t(`moneyFlow.intro.${basis}`)}</p>
            {basis === 'actual' && period?.is_current && (
              <p className="text-sm font-medium" data-testid="money-flow-running">
                {t('moneyFlow.running', { end: formatCalendarDate(period.end_date) })}
              </p>
            )}
          </section>
          {total && figures && <Tiles total={total} basis={basis} figures={figures} />}
          <Card>
            <CardContent className="flex min-w-0 flex-col gap-4">
              {data.incomes.length > 0 ? (
                <MoneyFlowDiagram
                  flow={data}
                  basis={basis}
                  title={title}
                  accountName={accountName}
                />
              ) : (
                <p className="text-sm text-muted-foreground">{t('moneyFlow.noIncome')}</p>
              )}
              {data.notAssigned && (
                <p className="text-xs text-muted-foreground">{t('moneyFlow.notAssignedHelp')}</p>
              )}
            </CardContent>
          </Card>
          {(noAccounts || data.transfers.length === 0 || data.notAssigned) && (
            <NextSteps
              noAccounts={noAccounts}
              noTransfers={data.transfers.length === 0}
              notAssigned={data.notAssigned !== null && !noAccounts}
            />
          )}
          <div className="max-w-5xl min-w-0">
            <MoneyFlowTable
              flow={data}
              basis={basis}
              accountName={accountName}
              periodId={period?.id ?? ''}
              counted={counted}
            />
          </div>
        </>
      )}
    </div>
  )
}

/** Planned or actual, kept in the address beside the period (`?basis=actual`). */
function BasisTabs({ basis }: { basis: Basis }) {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const to = (next: Basis) => {
    const after = new URLSearchParams(params)
    if (next === 'actual') after.set('basis', 'actual')
    else after.delete('basis')
    const search = after.toString()
    return { search: search ? `?${search}` : '' }
  }
  const item = (value: Basis) => (
    // R-APP-480: a basis is a history entry, so Back returns to the other one.
    <Link
      to={to(value)}
      aria-current={basis === value ? 'page' : undefined}
      className={cn(
        'inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:flex-none',
        basis === value
          ? 'bg-background text-foreground shadow-sm'
          : 'text-foreground/70 hover:text-foreground',
      )}
      data-testid={`basis-${value}`}
    >
      {t(`moneyFlow.basis.${value}`)}
    </Link>
  )
  return (
    <nav
      aria-label={t('moneyFlow.basis.label')}
      className="flex w-full gap-1 self-start rounded-lg bg-muted p-1 sm:w-auto"
    >
      {item('planned')}
      {item('actual')}
    </nav>
  )
}

/** The database's total row, four figures: nothing is added up on the page. */
// R-ACCOUNT-447: every figure on the page is one the read returned.
function Tiles({
  total,
  basis,
  figures,
}: {
  total: FlowTotal
  basis: Basis
  figures: { spending: number; rest: number }
}) {
  const { t } = useTranslation()
  // A shortfall reads in words, not only by colour.
  const short = figures.rest < 0
  const sentOn = total.setAside < 0
  return (
    <div className="@container">
      <dl
        className="grid grid-cols-1 gap-3 @[22rem]:grid-cols-2 @[52rem]:grid-cols-4"
        data-testid="money-flow-tiles"
      >
        <Tile label={t('moneyFlow.tiles.incomes')} amount={total.incomes} testId="tile-incomes" />
        <Tile
          label={t('moneyFlow.tiles.setAside')}
          amount={total.setAside}
          negative={sentOn}
          hint={sentOn ? t('moneyFlow.tiles.setAsideNegative') : t('moneyFlow.tiles.setAsideHelp')}
          testId="tile-set-aside"
        />
        <Tile
          label={t(`moneyFlow.tiles.spending.${basis}`)}
          amount={figures.spending}
          hint={t('moneyFlow.tiles.ofSpendable', { amount: formatMoney(total.spendable) })}
          testId="tile-spending"
        />
        <Tile
          label={t(`moneyFlow.tiles.rest.${basis}`)}
          amount={figures.rest}
          negative={short}
          hint={
            short ? t(`moneyFlow.tiles.short.${basis}`) : t(`moneyFlow.tiles.restHelp.${basis}`)
          }
          testId="tile-rest"
        />
      </dl>
    </div>
  )
}

function Tile({
  label,
  amount,
  hint,
  negative = false,
  testId,
}: {
  label: string
  amount: number
  hint?: string
  negative?: boolean
  testId: string
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-3 sm:p-4',
        negative && 'border-destructive/50',
      )}
      data-testid={testId}
    >
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'flex items-center gap-1.5 text-lg font-semibold tracking-tight tabular-nums @[52rem]:text-xl',
          negative && 'text-destructive',
        )}
      >
        {negative && <TriangleAlertIcon className="size-4 shrink-0" aria-hidden />}
        {/* An amount never breaks inside its figures: the tiles take one per row instead. */}
        <span className="min-w-0 whitespace-nowrap">{formatMoney(amount)}</span>
      </dd>
      {hint && (
        <dd
          className={cn(
            'text-xs',
            negative ? 'font-medium text-destructive' : 'text-muted-foreground',
          )}
        >
          {hint}
        </dd>
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
