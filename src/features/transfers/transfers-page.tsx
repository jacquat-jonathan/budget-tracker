import {
  ArrowRightLeftIcon,
  CalendarOffIcon,
  ChevronDownIcon,
  EllipsisVerticalIcon,
  LandmarkIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { paths } from '@/app/paths'
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

  const all = transfers.data
  const active = all.filter((item) => item.is_active || (ended && item.end_seq === null))
  const endedList = all.filter((item) => !active.includes(item) && !isVoidTransfer(item))

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      {header}
      {ended && (
        <Alert>
          <CalendarOffIcon aria-hidden />
          <AlertTitle>{t('budgetEnded.title')}</AlertTitle>
          <AlertDescription>{t('transfers.endedBudget')}</AlertDescription>
        </Alert>
      )}
      {openAccounts.length < 2 && active.length === 0 ? (
        // D-501: accounts come first; nothing else asks for them.
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
      ) : (
        <>
          {all.length > 0 && (
            <Checklist budgetId={budgetId} periods={periods.data} current={current.data} />
          )}
          <section className="flex flex-col gap-3" aria-labelledby="planned-transfers">
            <h2 id="planned-transfers" className="text-lg font-semibold">
              {t('transfers.plannedTitle')}
            </h2>
            {active.length === 0 ? (
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
            ) : (
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
            )}
            {endedList.length > 0 && (
              <EndedTransfers transfers={endedList} periods={periods.data} />
            )}
          </section>
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
