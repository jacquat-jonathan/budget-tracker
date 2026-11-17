import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  CalendarOffIcon,
  EllipsisVerticalIcon,
  ListIcon,
  PencilIcon,
  PlusIcon,
  ScaleIcon,
  Trash2Icon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'

import { paths, transactionsOf } from '@/app/paths'
import { CalendarDate } from '@/components/form/calendar-date-field'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { MoneyStat } from '@/components/money-stat'
import { usePageDetail } from '@/components/layout/page-detail'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useCurrentPeriod, usePeriods } from '@/features/budgets/budget-queries'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'
import { AdjustBalanceDialog } from '@/features/debts/components/adjust-balance-dialog'
import { DebtChart, KindLegendMark } from '@/features/debts/components/debt-chart'
import { DebtFormDialog } from '@/features/debts/components/debt-form-dialog'
import { Payoff } from '@/features/debts/components/payoff'
import { RemoveDebtDialog } from '@/features/debts/components/remove-debt-dialog'
import { useDeleteAdjustment } from '@/features/debts/debt-mutations'
import {
  HISTORY_AUTO_PAGES,
  HISTORY_PAGE,
  useDebt,
  useDebtHistory,
  type Debt,
  type HistoryEntry,
} from '@/features/debts/debt-queries'
import { useCategoryPath } from '@/features/subscriptions/subscription-views'
import { TransactionFormDialog } from '@/features/transactions/components/transaction-form-dialog'
import { useTransactionDateRange } from '@/features/transactions/transaction-queries'
import { formatCalendarDate } from '@/lib/date'
import { formatInterestRate } from '@/lib/interest-rate'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

/** Rows of the history table shown at once; more on request. */
const HISTORY_SHOWN = 50

type DialogState =
  | { kind: 'closed' }
  | { kind: 'payment' }
  | { kind: 'adjust' }
  | { kind: 'edit' }
  | { kind: 'remove' }
  | { kind: 'deleteAdjustment'; entry: HistoryEntry }

/**
 * One debt: its figures and projection, its evolution as a chart with the history as a table
 * (its text alternative), and its actions: record a payment, adjust the balance, delete an
 * adjustment, edit, remove. Every figure is the database's.
 */
// R-DEBT-122: the evolution, the history and every action on one debt.
export function DebtDetailPage() {
  const { t } = useTranslation()
  const { debtId = '' } = useParams()
  const { budgetId } = useCurrentBudget()
  const read = useDebt(budgetId, debtId)
  // While a dialog is open, the debt it was opened on stays on screen even if another member
  // deletes it meanwhile: the dialog says so itself.
  const [lastSeen, setLastSeen] = useState<Debt | null>(null)
  if (read.data && read.data !== lastSeen) setLastSeen(read.data)
  const history = useDebtHistory(budgetId, debtId)
  const pages = history.data?.pages
  const entries = useMemo(() => pages?.flat(), [pages])
  // The chart reads the whole history by itself, up to a stated cap (D-231).
  const pageCount = pages?.length ?? 0
  const { hasNextPage, isFetchingNextPage, fetchNextPage, isError: historyFailed } = history
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !historyFailed && pageCount < HISTORY_AUTO_PAGES) {
      void fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, historyFailed, pageCount, fetchNextPage])
  const chartCap = HISTORY_AUTO_PAGES * HISTORY_PAGE
  const chartComplete = !hasNextPage || (entries?.length ?? 0) >= chartCap
  const current = useCurrentPeriod(budgetId)
  const periods = usePeriods(budgetId)
  const { range, today, ended } = useTransactionDateRange(budgetId)
  const path = useCategoryPath()
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' })
  const close = () => setDialog({ kind: 'closed' })
  const deleteAdjustment = useDeleteAdjustment(budgetId)

  const back = (
    <Button asChild variant="ghost" size="sm" className="self-start">
      <Link to={paths.debts}>
        <ArrowLeftIcon aria-hidden />
        {t('debts.backToList')}
      </Link>
    </Button>
  )
  const debt = read.data ?? (dialog.kind !== 'closed' ? lastSeen : read.data)
  usePageDetail(debt?.name)
  if (read.isError && !debt) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        <ErrorState error={read.error} onRetry={() => void read.refetch()} />
      </div>
    )
  }
  if (debt === null) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        <EmptyState title={t('debts.notFound')} description={t('debts.notFoundHelp')} />
      </div>
    )
  }
  const failed = [current, periods].find((query) => query.isError)
  if (failed) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        <ErrorState error={failed.error} onRetry={failed.refetch} />
      </div>
    )
  }
  if (debt === undefined || current.data === undefined || !periods.data) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        <LoadingState rows={4} />
      </div>
    )
  }
  // Not ended: payments can still be dated in its periods, and it can be corrected from one of
  // them, even once the budget has ended (R-BUDGET-130). An ended debt is frozen: no payment,
  // adjustment, edit or removal (D-209), and the page says why.
  const notEnded = debt.end_seq === null
  const editable = notEnded
  const share = debt.paid_percent

  return (
    <div className="flex flex-col gap-6">
      {back}
      {/* The name over its actions: a long name never squeezes into a narrow column. */}
      <div className="flex flex-col gap-3">
        <PageHeader
          title={debt.name}
          description={path(debt.category_name, debt.parent_category_name)}
        />
        <div className="flex flex-wrap gap-2">
          {notEnded && range && (
            <Button onClick={() => setDialog({ kind: 'payment' })}>
              <PlusIcon />
              {t('debts.recordPayment')}
            </Button>
          )}
          {notEnded && range && (
            <Button variant="outline" onClick={() => setDialog({ kind: 'adjust' })}>
              <ScaleIcon />
              {t('debts.adjust.action')}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label={t('debts.actionsFor', { name: debt.name })}
              >
                <EllipsisVerticalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem onSelect={() => setDialog({ kind: 'edit' })} disabled={!editable}>
                <PencilIcon />
                {t('debts.edit')}
              </DropdownMenuItem>
              {!editable && (
                <p className="max-w-56 px-2 pb-1.5 pl-8 text-xs text-muted-foreground">
                  {t('debts.endedNoEdit')}
                </p>
              )}
              <DropdownMenuItem asChild>
                <Link to={transactionsOf({ debt: debt.id })}>
                  <ListIcon />
                  {t('debts.seeTransactions')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setDialog({ kind: 'remove' })}
                disabled={!editable}
              >
                <Trash2Icon />
                {debt.removal_deletes ? t('debts.remove.delete') : t('debts.remove.endAction')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {!notEnded && (
        <Alert>
          <CalendarOffIcon aria-hidden />
          <AlertTitle>{t('debts.endedTitleOne')}</AlertTitle>
          <AlertDescription>{t('debts.endedOneHelp')}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardContent className="flex flex-col gap-5">
          {/* One column on a phone: seven-figure amounts never meet. */}
          <dl className="grid grid-cols-1 gap-x-4 gap-y-5 min-[480px]:grid-cols-2 xl:grid-cols-4">
            {debt.overpaid_by > 0 ? (
              <MoneyStat
                label={t('debts.overpaid')}
                amount={debt.overpaid_by}
                emphasis
                hint={t('debts.overpaidHint')}
                testId="detail-remaining"
              />
            ) : (
              <MoneyStat
                label={t('debts.remaining')}
                amount={debt.remaining}
                emphasis
                testId="detail-remaining"
              />
            )}
            <MoneyStat label={t('debts.paid')} amount={debt.paid_total} />
            <MoneyStat
              label={t('debts.interestAdded')}
              amount={debt.interest_total}
              hint={t('debts.interestHint')}
            />
            <MoneyStat
              label={t('debts.adjustments')}
              amount={debt.adjustment_total}
              hint={t('debts.adjustmentsHint')}
            />
          </dl>
          <div className="flex flex-col gap-1">
            <Progress value={share} aria-label={t('debts.paidShare', { percent: share })} />
            <p className="text-xs text-muted-foreground">
              {t('debts.principalWas', {
                amount: formatMoney(debt.principal),
                date: formatCalendarDate(debt.opened_on),
              })}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
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
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-xs text-muted-foreground">{t('debts.projection')}</dt>
              <dd>
                <Payoff debt={debt} budgetEnded={ended} />
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('debts.chart.title')}</h2>
          </CardTitle>
          <CardDescription>{t('debts.chart.description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {history.isError && !entries ? (
            <ErrorState error={history.error} onRetry={() => void history.refetch()} />
          ) : !entries || !chartComplete ? (
            <LoadingState rows={2} />
          ) : (
            <>
              <DebtChart
                entries={entries.slice(0, chartCap)}
                today={today}
                cappedAt={hasNextPage || entries.length > chartCap ? chartCap : null}
              />
              <HistoryTable
                budgetId={budgetId}
                debt={debt}
                frozen={!notEnded}
                onDeleteAdjustment={(entry) => {
                  deleteAdjustment.reset()
                  setDialog({ kind: 'deleteAdjustment', entry })
                }}
              />
            </>
          )}
        </CardContent>
      </Card>

      {range && today && (
        <TransactionFormDialog
          budgetId={budgetId}
          open={dialog.kind === 'payment'}
          onOpenChange={(open) => {
            if (!open) close()
          }}
          range={range}
          today={today}
          ended={ended}
          prefill={{ categoryId: debt.category_id, debtId: debt.id }}
        />
      )}
      {range && today && (
        <AdjustBalanceDialog
          budgetId={budgetId}
          debt={dialog.kind === 'adjust' ? debt : null}
          range={range}
          today={today}
          ended={ended}
          onClose={close}
        />
      )}
      <DebtFormDialog
        budgetId={budgetId}
        open={dialog.kind === 'edit'}
        onOpenChange={(open) => {
          if (!open) close()
        }}
        debt={debt}
        periods={periods.data}
        currentPeriod={current.data}
      />
      <RemoveDebtDialog
        budgetId={budgetId}
        debt={dialog.kind === 'remove' ? debt : null}
        periods={periods.data}
        currentPeriod={current.data}
        onClose={close}
        onRemoved={(outcome) => {
          if (outcome === 'deleted') void navigate(paths.debts)
        }}
      />
      <ConfirmDialog
        open={dialog.kind === 'deleteAdjustment'}
        onOpenChange={(open) => {
          if (!open) close()
        }}
        title={t('debts.adjust.deleteTitle')}
        description={
          dialog.kind === 'deleteAdjustment' ? (
            <p>
              {t('debts.adjust.deleteDescription', {
                amount: formatMoney(dialog.entry.amount),
                date: formatCalendarDate(dialog.entry.date),
              })}
            </p>
          ) : null
        }
        confirmLabel={t('debts.adjust.delete')}
        destructive
        pending={deleteAdjustment.isPending}
        error={deleteAdjustment.error}
        errorMessages={{ debt_ended: 'debts.endedErrors.deleteAdjustment' }}
        onConfirm={() => {
          if (dialog.kind !== 'deleteAdjustment') return
          // The debt's revision, as the contract asks: another change to the debt refuses it.
          deleteAdjustment.mutate(
            { adjustmentId: dialog.entry.entry_id, debtRevision: debt.revision },
            { onSuccess: close },
          )
        }}
      />
    </div>
  )
}

/**
 * The history, newest first as the database pages it (p_newest_first, D-290): the chart's text
 * alternative, 50 rows at a time, the next (older) page read with its cursor on request.
 * Payments lead to their transactions; adjustments can be deleted, unless the debt has ended.
 */
// R-DEBT-191: the latest events first, a page at a time.
function HistoryTable({
  budgetId,
  debt,
  frozen,
  onDeleteAdjustment,
}: {
  budgetId: string
  debt: Debt
  /** Ended: its adjustments can no longer be deleted (D-209). */
  frozen: boolean
  onDeleteAdjustment: (entry: HistoryEntry) => void
}) {
  const { t } = useTranslation()
  const history = useDebtHistory(budgetId, debt.id, {
    newestFirst: true,
    pageSize: HISTORY_SHOWN,
  })
  const rows = useMemo(() => history.data?.pages.flat() ?? [], [history.data])
  const more = history.hasNextPage
  const loadingMore = history.isFetchingNextPage
  const loadFailed = history.isFetchNextPageError
  if (history.isError && !history.data) {
    return <ErrorState error={history.error} onRetry={() => void history.refetch()} />
  }
  if (!history.data) return <LoadingState rows={2} />
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{t('debts.history.title')}</h3>
      <Table data-testid="debt-history" aria-label={t('debts.history.label', { name: debt.name })}>
        <TableHeader>
          <TableRow>
            <TableHead className="w-full">{t('debts.history.entry')}</TableHead>
            {/* On a phone the amount joins the event's second line: three columns fit. */}
            <TableHead className="hidden text-right sm:table-cell">
              {t('debts.history.amount')}
            </TableHead>
            <TableHead className="text-right">{t('debts.history.balance')}</TableHead>
            <TableHead>
              <span className="sr-only">{t('common.actions')}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((entry) => (
            <TableRow key={`${entry.kind}-${entry.entry_id}`} data-testid="history-row">
              <TableCell className="max-w-0 whitespace-normal">
                <div className="flex items-center gap-1.5">
                  <KindLegendMark kind={entry.kind} />
                  <span className="font-medium">{t(`debts.history.kind.${entry.kind}`)}</span>
                </div>
                {/* On a phone the amount has its own line: never cut off. */}
                <div className="text-xs text-muted-foreground tabular-nums">
                  <CalendarDate value={entry.date} />
                  <span className="sm:hidden"> · {formatMoney(entry.amount)}</span>
                </div>
                {entry.description && (
                  <div className="truncate text-xs text-muted-foreground">{entry.description}</div>
                )}
              </TableCell>
              <TableCell
                className={cn(
                  'hidden text-right tabular-nums sm:table-cell',
                  entry.amount < 0 && 'text-positive',
                )}
              >
                {formatMoney(entry.amount)}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {/* Below zero it is overpaid: said so, never a negative "remaining". */}
                {entry.balance < 0
                  ? t('debts.overpaidAmount', { amount: formatMoney(-entry.balance) })
                  : formatMoney(entry.balance)}
              </TableCell>
              <TableCell className="pr-0 text-right">
                {entry.kind === 'payment' && entry.period_id && (
                  <Button asChild variant="ghost" size="icon-xs">
                    <Link
                      to={transactionsOf({ debt: debt.id, period: entry.period_id })}
                      aria-label={t('debts.history.seePayment', {
                        amount: formatMoney(-entry.amount),
                        date: formatCalendarDate(entry.date),
                      })}
                      title={t('debts.history.see')}
                    >
                      <ArrowUpRightIcon />
                    </Link>
                  </Button>
                )}
                {entry.kind === 'adjustment' && !frozen && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onDeleteAdjustment(entry)}
                    aria-label={t('debts.adjust.deleteFor', {
                      amount: formatMoney(entry.amount),
                      date: formatCalendarDate(entry.date),
                    })}
                  >
                    <Trash2Icon />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground" data-testid="history-shown">
        {more
          ? t('debts.history.shownSoFar', { count: rows.length })
          : t('debts.history.shownAll', { count: rows.length })}
      </p>
      {loadFailed && <p className="text-sm text-destructive">{t('debts.history.loadFailed')}</p>}
      {more && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          disabled={loadingMore}
          onClick={() => void history.fetchNextPage()}
          data-testid="history-more"
        >
          {loadingMore
            ? t('common.loading')
            : t('debts.history.showMore', { count: HISTORY_SHOWN })}
        </Button>
      )}
    </div>
  )
}
