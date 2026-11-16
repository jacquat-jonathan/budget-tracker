import {
  ArrowLeftRightIcon,
  BellRingIcon,
  CalendarOffIcon,
  CheckIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  PlusIcon,
  RepeatIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'

import { OlderPeriodsItem } from '@/features/budgets/older-periods-item'
import { pickPeriod, useOlderPeriodsOption } from '@/features/budgets/older-periods'
import { ChangedElsewhere, GoneElsewhere, SaveError } from '@/components/changed-elsewhere'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useAnswerCharge } from '@/features/subscriptions/subscription-mutations'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useBudgetStatus,
  useCurrentPeriod,
  usePeriods,
  type PeriodSummary,
} from '@/features/budgets/budget-queries'
import { ConfirmAllCharges } from '@/features/subscriptions/components/confirm-all-charges'
import { useAwaitingCharges } from '@/features/subscriptions/subscription-queries'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'
import { isVoid, useCategories, type Category } from '@/features/categories/category-queries'
import { isUuid } from '@/lib/uuid'
import {
  TransactionFormDialog,
  type DateRange,
} from '@/features/transactions/components/transaction-form-dialog'
import { useDeleteTransaction } from '@/features/transactions/transaction-mutations'
import {
  TRANSACTION_KINDS,
  useTransactions,
  type Transaction,
  type TransactionKind,
} from '@/features/transactions/transaction-queries'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { useRecord } from '@/features/budgets/record-queries'
import { useRecordViews } from '@/features/budgets/record-views'
import { useEditBase } from '@/hooks/use-edit-base'
import { calendarMonth, formatCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

type DialogState =
  | { kind: 'closed' }
  | { kind: 'add' }
  | { kind: 'edit'; transaction: Transaction }
  | { kind: 'delete'; transaction: Transaction }
  | { kind: 'dismiss'; transaction: Transaction }

const ALL = 'all'

/**
 * Transactions, newest first, a page at a time (R-TRANSACTION-095), filtered by period (the
 * current one by default), category and kind; the filters live in the address so a link
 * (from the progress view) opens a filtered list. Adding is the main action of the app, with
 * a fast path for several receipts in a row.
 */
// R-TRANSACTION-051: newest first, by the database's cursor, filters in the address.
export function TransactionsPage() {
  const { t } = useTranslation()
  const { budgetId } = useCurrentBudget()
  const periods = usePeriods(budgetId)
  const current = useCurrentPeriod(budgetId)
  const categories = useCategories(budgetId)
  const [params, setParams] = useSearchParams()
  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' })
  const close = () => setDialog({ kind: 'closed' })
  const charges = useAnswerCharge(budgetId)

  const periodList = periods.data
  // The current period by default; once the budget has ended, its last period.
  const periodParam = params.get('period')
  const defaultPeriod = current.data ?? periodList?.[0] ?? null
  const period =
    periodParam === ALL
      ? null
      : (periodList?.find((item) => item.id === periodParam) ?? defaultPeriod)
  // A category the budget does not have (another budget's, deleted, a stale link) falls back
  // to all categories, like an unknown period.
  const categoryParam = params.get('category')
  const categoryList = categories.data
  const categoryId =
    categoryParam && categoryList?.some((item) => item.id === categoryParam) ? categoryParam : null
  const kindParam = params.get('kind')
  const kind = (TRANSACTION_KINDS as readonly string[]).includes(kindParam ?? '')
    ? (kindParam as TransactionKind)
    : null
  // A link from a subscription, a debt or the charges card: one subscription's transactions,
  // one debt's payments, or the charges awaiting confirmation. Read only when asked for.
  const subscriptionParam = params.get('subscription')
  const debtParam = params.get('debt')
  const awaitingOnly = params.get('awaiting') === '1'
  // Read by id (undefined while unknown, null when the budget has no such record).
  const subscriptionRow = useRecord(
    'subscription_overview',
    budgetId,
    isUuid(subscriptionParam) ? subscriptionParam : undefined,
  )
  const debtRow = useRecord('debt_overview', budgetId, isUuid(debtParam) ? debtParam : undefined)
  const subscription = !isUuid(subscriptionParam) ? null : subscriptionRow
  const debt = !isUuid(debtParam) ? null : debtRow
  const filters = {
    from: period?.start_date ?? null,
    to: period?.end_date ?? null,
    categoryId,
    kind,
    subscriptionId: subscription?.id ?? null,
    debtId: debt?.id ?? null,
    awaitingOnly,
  }
  const ready =
    periodList !== undefined &&
    current.data !== undefined &&
    categoryList !== undefined &&
    subscription !== undefined &&
    debt !== undefined
  // Read once the filters are known, never first for all periods.
  const list = useTransactions(budgetId, filters, ready)
  useEffect(() => {
    if (categoryList && categoryParam && categoryId === null) {
      const next = new URLSearchParams(params)
      next.delete('category')
      setParams(next, { replace: true })
    }
  }, [categoryList, categoryParam, categoryId, params, setParams])
  // Like a category: a subscription or debt the budget does not have drops its filter.
  const unknownSubscription = subscriptionParam !== null && subscription === null
  const unknownDebt = debtParam !== null && debt === null
  useEffect(() => {
    if (!unknownSubscription && !unknownDebt) return
    const next = new URLSearchParams(params)
    if (unknownSubscription) next.delete('subscription')
    if (unknownDebt) next.delete('debt')
    setParams(next, { replace: true })
  }, [unknownSubscription, unknownDebt, params, setParams])
  const setFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value === null) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  // R-TRANSACTION-090: from the first period's start to today, not after an ended budget's end.
  const today = current.data?.today ?? periodList?.[0]?.today ?? null
  const range = useMemo<DateRange | null>(() => {
    if (!periodList || periodList.length === 0 || !today) return null
    const first = periodList.at(-1)
    const last = periodList[0]
    if (!first || !last) return null
    return { min: first.start_date, max: today < last.end_date ? today : last.end_date }
  }, [periodList, today])

  const header = (
    <PageHeader
      title={t('nav.transactions')}
      description={t('pages.transactions.description')}
      action={
        <Button onClick={() => setDialog({ kind: 'add' })} disabled={!range}>
          <PlusIcon />
          {t('transactions.add')}
        </Button>
      }
    />
  )

  const failed = [periods, current, categories].find((query) => query.isError)
  if (failed) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ErrorState
          error={failed.error}
          onRetry={() => {
            periods.refetch()
            current.refetch()
            categories.refetch()
          }}
        />
      </div>
    )
  }

  const rows = list.data?.pages.flat() ?? []
  const filtered =
    periodParam !== null ||
    categoryId !== null ||
    kind !== null ||
    !!subscription ||
    !!debt ||
    awaitingOnly
  const linkFilters = [
    subscription && {
      key: 'subscription',
      label: t('subscriptions.filterChip', { name: subscription.name }),
    },
    debt && { key: 'debt', label: t('debts.filterChip', { name: debt.name }) },
    awaitingOnly && { key: 'awaiting', label: t('charges.filterChip') },
  ].filter((item): item is { key: string; label: string } => !!item)

  return (
    <div className="flex flex-col gap-6">
      {header}
      {ready && current.data === null && (
        <Alert>
          <CalendarOffIcon aria-hidden />
          <AlertTitle>{t('budgetEnded.title')}</AlertTitle>
          <AlertDescription>{t('transactions.endedBudget')}</AlertDescription>
        </Alert>
      )}
      <div className="@container/filters">
        <Filters
          budgetId={budgetId}
          periods={periodList ?? []}
          period={period}
          allPeriods={periodParam === ALL}
          categories={categories.data ?? []}
          categoryId={categoryId}
          kind={kind}
          onPeriod={(value) => setFilter('period', value)}
          onCategory={(value) => setFilter('category', value)}
          onKind={(value) => setFilter('kind', value)}
        />
      </div>
      {linkFilters.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <LinkFilters filters={linkFilters} onRemove={(key) => setFilter(key, null)} />
          {awaitingOnly && <ConfirmAllAwaiting budgetId={budgetId} today={today} />}
        </div>
      )}
      {!ready || list.isPending ? (
        <LoadingState rows={5} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRightIcon}
          title={filtered ? t('transactions.emptyFiltered') : t('transactions.empty')}
          description={filtered ? t('transactions.emptyFilteredHelp') : t('transactions.emptyHelp')}
          action={
            range && (
              <Button onClick={() => setDialog({ kind: 'add' })}>
                <PlusIcon />
                {t('transactions.add')}
              </Button>
            )
          }
        />
      ) : (
        <TransactionList
          rows={rows}
          onEdit={(transaction) => setDialog({ kind: 'edit', transaction })}
          onDelete={(transaction) => setDialog({ kind: 'delete', transaction })}
          onAnswer={(transaction, answer) => {
            if (answer === 'confirm') charges.confirm.mutate(transaction)
            else setDialog({ kind: 'dismiss', transaction })
          }}
        />
      )}
      {list.hasNextPage && (
        <Button
          variant="outline"
          className="self-center"
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          {list.isFetchingNextPage ? t('common.loading') : t('transactions.loadMore')}
        </Button>
      )}

      {range && today && (
        <TransactionFormDialog
          budgetId={budgetId}
          open={dialog.kind === 'add' || dialog.kind === 'edit'}
          onOpenChange={(open) => {
            if (!open) close()
          }}
          transaction={dialog.kind === 'edit' ? dialog.transaction : undefined}
          range={range}
          today={today}
          ended={current.data === null}
          ownPeriod={
            dialog.kind === 'edit'
              ? (periodList?.find((item) => item.id === dialog.transaction.period_id) ?? null)
              : undefined
          }
        />
      )}
      <DeleteTransactionDialog
        budgetId={budgetId}
        transaction={dialog.kind === 'delete' ? dialog.transaction : null}
        onClose={close}
      />
      <ConfirmDialog
        open={dialog.kind === 'dismiss'}
        onOpenChange={(open) => {
          if (!open) close()
        }}
        title={t('charges.dismissTitle')}
        description={
          dialog.kind === 'dismiss' ? (
            <>
              <p>
                {t('charges.dismissDescription', {
                  what: t('charges.what', {
                    name: dialog.transaction.subscription_name ?? '',
                    amount: formatMoney(dialog.transaction.amount),
                    date: formatCalendarDate(dialog.transaction.date),
                  }),
                })}
              </p>
              <p>
                {t('charges.dismissNever', {
                  date: formatCalendarDate(
                    dialog.transaction.charge_date ?? dialog.transaction.date,
                  ),
                })}
              </p>
            </>
          ) : null
        }
        confirmLabel={t('charges.dismissConfirm')}
        destructive
        pending={charges.dismiss.isPending}
        onConfirm={() => {
          if (dialog.kind === 'dismiss') {
            charges.dismiss.mutate(dialog.transaction, { onSettled: close })
          }
        }}
      />
    </div>
  )
}

/**
 * "All went through" over the list of the charges awaiting: the budget's count, and the oldest
 * date from the charges awaiting (oldest first). Read only while that filter is on.
 */
function ConfirmAllAwaiting({ budgetId, today }: { budgetId: string; today: string | null }) {
  const status = useBudgetStatus(budgetId)
  const awaiting = useAwaitingCharges(budgetId)
  return (
    <ConfirmAllCharges
      budgetId={budgetId}
      count={status.data?.charges_awaiting ?? 0}
      oldest={awaiting.data?.[0]?.date ?? null}
      today={today}
    />
  )
}

/**
 * The filters a link set (one subscription, one debt, the charges awaiting confirmation):
 * shown, kept in the address, each removable.
 */
// R-TRANSACTION-150: a link's filter is visible, removable and kept in the address.
function LinkFilters({
  filters,
  onRemove,
}: {
  filters: { key: string; label: string }[]
  onRemove: (key: string) => void
}) {
  const { t } = useTranslation()
  return (
    <ul
      className="flex flex-wrap gap-2"
      aria-label={t('charges.linkFilters')}
      data-testid="link-filters"
    >
      {filters.map((filter) => (
        <li key={filter.key}>
          <Badge variant="secondary" className="h-8 max-w-full gap-1 pr-1 pl-3 text-sm">
            <span className="truncate">{filter.label}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              className="rounded-full"
              onClick={() => onRemove(filter.key)}
              aria-label={t('charges.removeFilter', { what: filter.label })}
            >
              <XIcon />
            </Button>
          </Badge>
        </li>
      ))}
    </ul>
  )
}

function Filters({
  budgetId,
  periods,
  period,
  allPeriods,
  categories,
  categoryId,
  kind,
  onPeriod,
  onCategory,
  onKind,
}: {
  budgetId: string
  periods: PeriodSummary[]
  period: PeriodSummary | null
  allPeriods: boolean
  categories: Category[]
  categoryId: string | null
  kind: TransactionKind | null
  onPeriod: (value: string | null) => void
  onCategory: (value: string | null) => void
  onKind: (value: string | null) => void
}) {
  const { t } = useTranslation()
  const olderPeriods = useOlderPeriodsOption(budgetId)
  // A category without a plan (void) is offered only when a link selected it.
  const shown = (category: Category) => !isVoid(category) || category.id === categoryId
  const tops = categories.filter((category) => category.parent_id === null && shown(category))
  const label = (item: PeriodSummary) =>
    t('income.fields.fromPeriod', {
      start: formatCalendarDate(item.start_date),
      end: formatCalendarDate(item.end_date),
    })
  return (
    <div
      // Three across only when the page is wide enough for full period labels (container
      // query): with the sidebar open on a tablet, the period gets a row of its own.
      className="grid grid-cols-2 gap-2 @3xl/filters:grid-cols-3 @3xl/filters:gap-3"
      role="group"
      aria-label={t('transactions.filters.label')}
    >
      <div className="col-span-2 flex flex-col gap-1.5 @3xl/filters:col-span-1">
        <Label htmlFor="filter-period" className="max-sm:sr-only">
          {t('transactions.filters.period')}
        </Label>
        <Select
          value={allPeriods ? ALL : (period?.id ?? ALL)}
          onValueChange={pickPeriod(olderPeriods, onPeriod)}
        >
          <SelectTrigger id="filter-period" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="max-h-80">
            <SelectItem value={ALL}>{t('transactions.filters.allPeriods')}</SelectItem>
            <SelectSeparator />
            {periods.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.is_current
                  ? t('transactions.filters.currentPeriod', { range: label(item) })
                  : label(item)}
              </SelectItem>
            ))}
            <OlderPeriodsItem option={olderPeriods} />
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-category" className="max-sm:sr-only">
          {t('transactions.filters.category')}
        </Label>
        <Select
          value={categoryId ?? ALL}
          onValueChange={(value) => onCategory(value === ALL ? null : value)}
        >
          <SelectTrigger id="filter-category" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="max-h-80">
            <SelectItem value={ALL}>{t('transactions.filters.allCategories')}</SelectItem>
            <SelectSeparator />
            {tops.map((top) => {
              const subs = categories.filter((item) => item.parent_id === top.id && shown(item))
              const endedNote = (item: Category) =>
                item.is_active === true
                  ? item.name
                  : t('transactions.filters.ended', { name: item.name })
              return top.is_group ? (
                <SelectGroup key={top.id}>
                  <SelectLabel>{top.name}</SelectLabel>
                  <SelectItem value={top.id} className="pl-5">
                    {t('transactions.filters.wholeGroup', { name: top.name })}
                  </SelectItem>
                  {subs.map((sub) => (
                    <SelectItem key={sub.id} value={sub.id} className="pl-5">
                      {endedNote(sub)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ) : (
                <SelectItem key={top.id} value={top.id}>
                  {endedNote(top)}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-kind" className="max-sm:sr-only">
          {t('transactions.filters.kind')}
        </Label>
        <Select value={kind ?? ALL} onValueChange={(value) => onKind(value === ALL ? null : value)}>
          <SelectTrigger id="filter-kind" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={ALL}>{t('transactions.filters.allKinds')}</SelectItem>
            {TRANSACTION_KINDS.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`transactions.kindPlural.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

/** A calendar date's weekday, read from the string, in the UI language (no time zone). */
function weekday(date: string, language: string): string {
  const { year, month } = calendarMonth(date)
  const day = Number(date.slice(8, 10))
  return new Intl.DateTimeFormat(language, { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  )
}

/** Transactions grouped by day, newest first. */
function TransactionList({
  rows,
  onEdit,
  onDelete,
  onAnswer,
}: {
  rows: Transaction[]
  onEdit: (transaction: Transaction) => void
  onDelete: (transaction: Transaction) => void
  onAnswer: (transaction: Transaction, answer: 'confirm' | 'dismiss') => void
}) {
  const { t, i18n } = useTranslation()
  const days: { date: string; items: Transaction[] }[] = []
  for (const row of rows) {
    const last = days.at(-1)
    if (last?.date === row.date) last.items.push(row)
    else days.push({ date: row.date, items: [row] })
  }
  return (
    <div className="flex flex-col gap-4" data-testid="transaction-list">
      {days.map((day) => (
        <section key={day.date} aria-label={formatCalendarDate(day.date)}>
          <h2 className="mb-1.5 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <span className="capitalize">{weekday(day.date, i18n.language)}</span>{' '}
            <time dateTime={day.date} className="tabular-nums">
              {formatCalendarDate(day.date)}
            </time>
          </h2>
          <ul className="flex flex-col divide-y rounded-xl border bg-card">
            {day.items.map((row) => (
              <TransactionRow
                key={row.id}
                row={row}
                // A payment of an ended debt is frozen (transaction_list.debt_ended).
                frozen={row.debt_ended === true}
                onEdit={onEdit}
                onDelete={onDelete}
                onAnswer={onAnswer}
              />
            ))}
          </ul>
        </section>
      ))}
      <span className="sr-only">{t('transactions.count', { count: rows.length })}</span>
    </div>
  )
}

/** A debt payment or a subscription charge, and whether it awaits confirmation. */
// R-SUBSCRIPTION-123: automatic charges and those awaiting confirmation are marked, in words.
function LinkBadges({ row }: { row: Transaction }) {
  const { t } = useTranslation()
  if (row.review_state === 'awaiting_confirmation') {
    return (
      <Badge
        variant="outline"
        className="shrink-0 border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"
        data-testid="awaiting-confirmation"
      >
        <BellRingIcon aria-hidden />
        <span className="max-sm:sr-only">{t('transactions.awaiting')}</span>
        <span className="sm:hidden" aria-hidden>
          {t('transactions.awaitingShort')}
        </span>
      </Badge>
    )
  }
  if (row.charge_date) {
    return (
      <Badge variant="secondary" className="hidden shrink-0 sm:inline-flex" data-testid="automatic">
        <RepeatIcon aria-hidden />
        {t('transactions.automatic')}
      </Badge>
    )
  }
  return null
}

/** What links a transaction to a debt or a subscription, in words; null when nothing does. */
function useLinkNote() {
  const { t } = useTranslation()
  return (row: Transaction): string | null =>
    row.debt_name
      ? t('transactions.paymentOnNote', { name: row.debt_name })
      : row.subscription_name
        ? row.charge_date
          ? t('transactions.automaticOf', { name: row.subscription_name })
          : t('transactions.subscriptionOf', { name: row.subscription_name })
        : null
}

function TransactionRow({
  row,
  frozen,
  onEdit,
  onDelete,
  onAnswer,
}: {
  row: Transaction
  /** A payment of an ended debt: it can be looked at, not changed or deleted. */
  frozen: boolean
  onEdit: (transaction: Transaction) => void
  onDelete: (transaction: Transaction) => void
  onAnswer?: (transaction: Transaction, answer: 'confirm' | 'dismiss') => void
}) {
  const { t } = useTranslation()
  const linkNote = useLinkNote()
  const incoming = row.kind !== 'expense'
  const what =
    row.kind === 'extra_income'
      ? t('transactions.kind.extra_income')
      : row.parent_category_name
        ? t('categories.path', { parent: row.parent_category_name, name: row.category_name ?? '' })
        : (row.category_name ?? '')
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 sm:px-4" data-testid="transaction-row">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{row.description || what}</span>
          {row.kind === 'refund' && (
            // On a phone the badge would crowd out the name: it joins the line below.
            <Badge variant="secondary" className="hidden sm:inline-flex">
              {t('transactions.kind.refund')}
            </Badge>
          )}
          <LinkBadges row={row} />
        </div>
        <span className="truncate text-xs text-muted-foreground">
          {/* The parts that apply, joined: never a separator with nothing after it. */}
          {[
            row.kind === 'refund' ? (
              <span key="refund" className="sm:hidden">
                {t('transactions.kind.refund')}
              </span>
            ) : null,
            linkNote(row),
            row.description ? what : null,
            row.recorded_by_name
              ? t('transactions.recordedBy', { name: row.recorded_by_name })
              : null,
          ]
            .filter((part) => part !== null)
            .flatMap((part, index) => (index === 0 ? [part] : [' · ', part]))}
        </span>
      </div>
      <span
        className={cn('shrink-0 text-right font-medium tabular-nums', incoming && 'text-positive')}
        data-testid="transaction-amount"
      >
        {incoming ? `+${formatMoney(row.amount)}` : formatMoney(row.amount)}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('transactions.actionsFor', {
              what: row.description || what,
              amount: formatMoney(row.amount),
              date: formatCalendarDate(row.date),
            })}
          >
            <EllipsisVerticalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {row.review_state === 'awaiting_confirmation' && onAnswer && (
            <>
              <DropdownMenuItem onSelect={() => onAnswer(row, 'confirm')}>
                <CheckIcon />
                {t('charges.wentThrough')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAnswer(row, 'dismiss')}>
                <XIcon />
                {t('charges.didNot')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onSelect={() => onEdit(row)}>
            <PencilIcon />
            {frozen ? t('debts.frozenView') : t('transactions.edit')}
          </DropdownMenuItem>
          {/* R-DEBT-151: a payment of an ended debt cannot be deleted; the menu says why. */}
          <DropdownMenuItem
            variant="destructive"
            disabled={frozen}
            onSelect={() => onDelete(row)}
            className="flex-wrap"
          >
            <Trash2Icon />
            {t('transactions.delete')}
            {frozen && (
              <span className="basis-full pl-6 text-xs text-muted-foreground">
                {t('debts.frozenDelete')}
              </span>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}

function DeleteTransactionDialog({
  budgetId,
  transaction,
  onClose,
}: {
  budgetId: string
  transaction: Transaction | null
  onClose: () => void
}) {
  return (
    <AlertDialog
      open={transaction !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <AlertDialogContent>
        {transaction && (
          <DeleteTransactionBody budgetId={budgetId} transaction={transaction} onClose={onClose} />
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}

function DeleteTransactionBody({
  budgetId,
  transaction: opened,
  onClose,
}: {
  budgetId: string
  transaction: Transaction
  onClose: () => void
}) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage({ debt_ended: 'debts.endedErrors.frozenPayment' })
  const views = useRecordViews()
  const live = useRecord('transaction_list', budgetId, opened.id)
  const removal = useEditBase(opened, live, views.transaction)
  const transaction = live ?? removal.base ?? opened
  const blocked = removal.changed || removal.gone
  const remove = useDeleteTransaction(budgetId)
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{t('transactions.deleteTitle')}</AlertDialogTitle>
        <AlertDialogDescription>
          {t('transactions.deleteDescription', {
            amount: formatMoney(transaction.amount),
            date: formatCalendarDate(transaction.date),
          })}
        </AlertDialogDescription>
      </AlertDialogHeader>
      {removal.gone && <GoneElsewhere />}
      {removal.changed && (
        <ChangedElsewhere
          kind="remove"
          changes={removal.theirs}
          onKeepMine={() => {
            removal.adopt()
            remove.reset()
          }}
        />
      )}
      <SaveError error={remove.error} hidden={blocked} message={errorMessage} />
      <AlertDialogFooter>
        <AlertDialogCancel disabled={remove.isPending}>{t('common.cancel')}</AlertDialogCancel>
        <Button
          variant="destructive"
          disabled={remove.isPending || blocked}
          onClick={() =>
            remove.mutate(
              { transaction, revision: (removal.base ?? transaction).revision },
              { onSuccess: onClose },
            )
          }
        >
          {remove.isPending ? t('common.saving') : t('transactions.delete')}
        </Button>
      </AlertDialogFooter>
    </>
  )
}
