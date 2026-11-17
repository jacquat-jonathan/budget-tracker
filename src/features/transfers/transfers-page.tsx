import {
  ArrowRightLeftIcon,
  CalendarOffIcon,
  ChevronDownIcon,
  EllipsisVerticalIcon,
  LandmarkIcon,
  ListIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'

import { paths, transactionsOf } from '@/app/paths'
import { CalendarDate } from '@/components/form/calendar-date-field'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAccounts } from '@/features/accounts/account-queries'
import { useBudgetEnded } from '@/features/budgets/budget-ended'
import {
  useCurrentPeriod,
  useIncomes,
  usePeriods,
  type PeriodSummary,
} from '@/features/budgets/budget-queries'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'
import { useCategoryPath } from '@/features/subscriptions/subscription-views'
import { Checklist } from '@/features/transfers/components/checklist'
import { FromTo, ModeBadge } from '@/features/transfers/components/transfer-bits'
import { EndTransferDialog } from '@/features/transfers/components/end-transfer-dialog'
import { TransferFormDialog } from '@/features/transfers/components/transfer-form-dialog'
import { isVoidTransfer, useTransfers, type Transfer } from '@/features/transfers/transfer-queries'
import { useAmountText, useScheduleText } from '@/features/transfers/transfer-views'
import { formatCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

type View = 'checklist' | 'planned'

/**
 * The page's two views, in the address (`?view=planned`; the checklist by default), so the
 * planned transfers never sit below a long checklist and a link or the back button returns
 * to either. The period of the checklist stays in the address beside it.
 */
// D-543: the checklist and the planned transfers are two views of the page.
function ViewTabs({ view, plannedCount }: { view: View; plannedCount: number }) {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const to = (next: View) => {
    const after = new URLSearchParams(params)
    if (next === 'planned') after.set('view', 'planned')
    else after.delete('view')
    const search = after.toString()
    return { search: search ? `?${search}` : '' }
  }
  const item = (value: View, label: string) => (
    // R-APP-480: a view is a history entry, so Back returns to the other view.
    <Link
      to={to(value)}
      aria-current={view === value ? 'page' : undefined}
      className={cn(
        'inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:flex-none',
        view === value
          ? 'bg-background text-foreground shadow-sm'
          : 'text-foreground/70 hover:text-foreground',
      )}
      data-testid={`view-${value}`}
    >
      {label}
    </Link>
  )
  return (
    <nav
      aria-label={t('transfers.views.label')}
      className="flex w-full gap-1 self-start rounded-lg bg-muted p-1 sm:w-auto"
    >
      {item('checklist', t('transfers.checklist.title'))}
      {item('planned', t('transfers.views.planned', { count: plannedCount }))}
    </nav>
  )
}

type DialogState =
  | { kind: 'closed' }
  | { kind: 'add' }
  | { kind: 'edit'; transfer: Transfer }
  | { kind: 'end'; transfer: Transfer }

/**
 * The transfers page: a period's checklist on top (what to do, what was done), then the
 * planned transfers with their next due date and monthly share, as the database gives them.
 */
export function TransfersPage() {
  const { t } = useTranslation()
  const { budgetId } = useCurrentBudget()
  const transfers = useTransfers(budgetId)
  const accounts = useAccounts(budgetId)
  const incomes = useIncomes(budgetId)
  const current = useCurrentPeriod(budgetId)
  const periods = usePeriods(budgetId)
  const ended = useBudgetEnded(budgetId)
  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' })
  const close = () => setDialog({ kind: 'closed' })
  const [params] = useSearchParams()
  const view: View = params.get('view') === 'planned' ? 'planned' : 'checklist'

  const openAccounts = (accounts.data ?? []).filter(
    (account) => account.is_active || (ended && account.end_seq === null),
  )
  const canAdd = openAccounts.length >= 2 && current.isSuccess && periods.data !== undefined
  const header = (
    <PageHeader
      title={t('nav.transfers')}
      description={t('pages.transfers.description')}
      action={
        <Button onClick={() => setDialog({ kind: 'add' })} disabled={!canAdd}>
          <PlusIcon />
          {t('transfers.add')}
        </Button>
      }
    />
  )
  const failed = [transfers, accounts, current, periods, incomes].find((query) => query.isError)
  if (failed) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ErrorState
          error={failed.error}
          onRetry={() => {
            for (const query of [transfers, accounts, current, periods, incomes]) query.refetch()
          }}
        />
      </div>
    )
  }
  if (
    !transfers.data ||
    !accounts.data ||
    current.data === undefined ||
    !periods.data ||
    !incomes.data
  ) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <LoadingState rows={3} />
      </div>
    )
  }

  const all = transfers.data.filter((item) => !isVoidTransfer(item))
  const active = all.filter((item) => item.is_active || (ended && item.end_seq === null))
  const endedList = all.filter((item) => !active.includes(item))
  const needAccounts = (
    <EmptyState
      icon={LandmarkIcon}
      title={t('transfers.needAccounts')}
      description={t(
        openAccounts.length === 1 ? 'transfers.needAccountsOne' : 'transfers.needAccountsNone',
      )}
      action={
        <Button asChild>
          <Link to={paths.accounts}>
            <LandmarkIcon />
            {t('transfers.goToAccounts')}
          </Link>
        </Button>
      }
    />
  )
  const planned = (
    <section className="flex flex-col gap-3" aria-labelledby="planned-transfers">
      <h2 id="planned-transfers" className="text-lg font-semibold" tabIndex={-1}>
        {t('transfers.plannedTitle')}
      </h2>
      {active.length > 0 ? (
        <ul className="flex flex-col gap-3" aria-label={t('transfers.plannedTitle')}>
          {active.map((transfer) => (
            <TransferCard
              key={transfer.id}
              transfer={transfer}
              today={current.data?.today ?? periods.data?.[0]?.today ?? null}
              onEdit={() => setDialog({ kind: 'edit', transfer })}
              onEnd={() => setDialog({ kind: 'end', transfer })}
            />
          ))}
        </ul>
      ) : openAccounts.length < 2 ? (
        needAccounts
      ) : (
        <EmptyState
          icon={ArrowRightLeftIcon}
          title={t('transfers.empty')}
          description={t('transfers.emptyHelp')}
          action={
            <Button onClick={() => setDialog({ kind: 'add' })} disabled={!canAdd}>
              <PlusIcon />
              {t('transfers.addFirst')}
            </Button>
          }
        />
      )}
      {endedList.length > 0 && <EndedTransfers transfers={endedList} periods={periods.data} />}
    </section>
  )

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {header}
      {ended && (
        <Alert>
          <CalendarOffIcon aria-hidden />
          <AlertTitle>{t('budgetEnded.title')}</AlertTitle>
          <AlertDescription>{t('transfers.endedBudget')}</AlertDescription>
        </Alert>
      )}
      {all.length === 0 ? (
        // D-501: accounts come first; nothing else asks for them. Once anything was planned,
        // its checklists and the ended transfers stay reachable, even with every account closed.
        openAccounts.length < 2 ? (
          needAccounts
        ) : (
          planned
        )
      ) : (
        <>
          <ViewTabs view={view} plannedCount={active.length} />
          {view === 'planned' ? (
            planned
          ) : (
            <Checklist budgetId={budgetId} periods={periods.data} current={current.data} />
          )}
        </>
      )}
      <TransferFormDialog
        budgetId={budgetId}
        open={dialog.kind === 'add' || dialog.kind === 'edit'}
        onOpenChange={(next) => {
          if (!next) close()
        }}
        transfer={dialog.kind === 'edit' ? dialog.transfer : undefined}
        accounts={accounts.data}
        incomes={incomes.data}
        periods={periods.data}
        currentPeriod={current.data}
      />
      <EndTransferDialog
        budgetId={budgetId}
        transfer={dialog.kind === 'end' ? dialog.transfer : null}
        periods={periods.data}
        currentPeriod={current.data}
        onClose={close}
      />
    </div>
  )
}

function TransferCard({
  transfer,
  today,
  onEdit,
  onEnd,
}: {
  transfer: Transfer
  today: string | null
  onEdit: () => void
  onEnd: () => void
}) {
  const { t } = useTranslation()
  const schedule = useScheduleText()
  const amount = useAmountText()
  const path = useCategoryPath()
  return (
    <li data-testid="transfer-card">
      <Card size="sm">
        <CardContent className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="truncate font-medium">{transfer.name}</h3>
              <ModeBadge automatic={transfer.is_automatic} />
            </div>
            <p className="flex min-w-0 flex-col gap-0.5 text-sm text-muted-foreground">
              <FromTo from={transfer.from_account_name} to={transfer.to_account_name} />
              <span>
                {schedule(transfer)} · {amount(transfer.amount, transfer.cadence)}
              </span>
              {transfer.category_id && (
                <span>
                  {t('transfers.countsIn', {
                    category: path(transfer.category_name, transfer.parent_category_name),
                  })}
                </span>
              )}
              {transfer.follows_primary && (
                <span data-testid="follows-primary">{t('transfers.followsPrimary')}</span>
              )}
            </p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:flex sm:gap-x-8 [&>div]:flex [&>div]:flex-col [&>div]:justify-end">
              <div>
                <dt className="text-muted-foreground">{t('transfers.nextDue')}</dt>
                <dd className="font-medium" data-testid="next-due">
                  {transfer.next_due_date ? (
                    <CalendarDate value={transfer.next_due_date} />
                  ) : (
                    <span className="font-normal text-muted-foreground">
                      {t('transfers.noNextDue')}
                    </span>
                  )}
                  {transfer.next_due_date && today && transfer.next_due_date === today && (
                    <span className="font-normal text-muted-foreground">
                      {' '}
                      · {t('transfers.today')}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('transfers.monthlyShare')}</dt>
                <dd className="font-medium tabular-nums" data-testid="monthly-share">
                  {formatMoney(transfer.monthly_amount)}
                </dd>
              </div>
            </dl>
            <Link
              to={transactionsOf({ transfer: transfer.id })}
              className="inline-flex items-center gap-1 self-start text-sm text-primary underline-offset-4 hover:underline"
              aria-label={t('transfers.itsTransactionsFor', { name: transfer.name })}
              data-testid="transfer-transactions"
            >
              <ListIcon className="size-3.5" aria-hidden />
              {t('transfers.itsTransactions')}
            </Link>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('transfers.actionsFor', { name: transfer.name })}
              >
                <EllipsisVerticalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem onSelect={onEdit}>
                <PencilIcon />
                {t('transfers.edit')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onEnd}>
                <Trash2Icon />
                {transfer.removal_deletes ? t('transfers.end.delete') : t('transfers.end.confirm')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardContent>
      </Card>
    </li>
  )
}

function EndedTransfers({
  transfers,
  periods,
}: {
  transfers: Transfer[]
  periods: PeriodSummary[]
}) {
  const { t } = useTranslation()
  const amount = useAmountText()
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section className="flex flex-col gap-3">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="self-start px-2" data-testid="ended-transfers-toggle">
            <ChevronDownIcon
              className={open ? 'rotate-180 transition-transform' : 'transition-transform'}
              aria-hidden
            />
            {t('transfers.endedTitle', { count: transfers.length })}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{t('transfers.endedHelp')}</p>
          <ul className="flex flex-col divide-y rounded-xl border">
            {transfers.map((transfer) => {
              const last = periods.find((period) => period.seq === (transfer.end_seq ?? 0) - 1)
              return (
                <li
                  key={transfer.id}
                  className="flex flex-col gap-0.5 p-3 text-sm"
                  data-testid="ended-transfer"
                >
                  <p className="truncate font-medium">{transfer.name}</p>
                  <p className="text-muted-foreground">
                    <FromTo from={transfer.from_account_name} to={transfer.to_account_name} />
                    {' · '}
                    {amount(transfer.amount, transfer.cadence)}
                    {last &&
                      ` · ${t('transfers.lastCounted', { date: formatCalendarDate(last.end_date) })}`}
                  </p>
                </li>
              )
            })}
          </ul>
        </CollapsibleContent>
      </section>
    </Collapsible>
  )
}
