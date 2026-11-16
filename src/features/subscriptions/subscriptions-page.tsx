import {
  HourglassIcon,
  ListIcon,
  BellRingIcon,
  CalendarOffIcon,
  ChevronDownIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  PlusIcon,
  RepeatIcon,
  Trash2Icon,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { paths, transactionsOf } from '@/app/paths'
import { CalendarDate } from '@/components/form/calendar-date-field'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
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
import { useCurrentPeriod, usePeriods, type PeriodSummary } from '@/features/budgets/budget-queries'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'
import { EndSubscriptionDialog } from '@/features/subscriptions/components/end-subscription-dialog'
import { SubscriptionFormDialog } from '@/features/subscriptions/components/subscription-form-dialog'
import {
  isVoidSubscription,
  useSubscriptions,
  type Subscription,
} from '@/features/subscriptions/subscription-queries'
import { useCategoryPath } from '@/features/subscriptions/subscription-views'
import { formatCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'

type DialogState =
  | { kind: 'closed' }
  | { kind: 'add' }
  | { kind: 'edit'; subscription: Subscription }
  | { kind: 'end'; subscription: Subscription }

/**
 * Subscriptions in force with their next charge date and monthly cost, the total committed
 * per month (the current period's committed figure), and the ended ones folded away. Every
 * figure and date is the database's.
 */
// R-SUBSCRIPTION-120: next charge, monthly cost, charges to confirm, all read, never computed.
export function SubscriptionsPage() {
  const { t } = useTranslation()
  const { budgetId, budget } = useCurrentBudget()
  const subscriptions = useSubscriptions(budgetId)
  const current = useCurrentPeriod(budgetId)
  const periods = usePeriods(budgetId)
  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' })
  const close = () => setDialog({ kind: 'closed' })
  const ended = current.isSuccess && current.data === null

  const header = (
    <PageHeader
      title={t('nav.subscriptions')}
      description={t('pages.subscriptions.description')}
      action={
        <Button onClick={() => setDialog({ kind: 'add' })} disabled={!current.isSuccess}>
          <PlusIcon />
          {t('subscriptions.add')}
        </Button>
      }
    />
  )

  const failed = [subscriptions, current, periods].find((query) => query.isError)
  if (failed) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ErrorState
          error={failed.error}
          onRetry={() => {
            subscriptions.refetch()
            current.refetch()
            periods.refetch()
          }}
        />
      </div>
    )
  }
  if (!subscriptions.data || current.data === undefined || !periods.data) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <LoadingState rows={3} />
      </div>
    )
  }

  const all = subscriptions.data
  // Once the budget has ended nothing is "in force now"; those not ended are still listed.
  const active = all.filter((item) => item.is_active || (ended && item.end_seq === null))
  const endedList = all.filter((item) => !active.includes(item) && !isVoidSubscription(item))
  const period = current.data

  return (
    <div className="flex flex-col gap-6">
      {header}
      {ended && (
        <Alert>
          <CalendarOffIcon aria-hidden />
          <AlertTitle>{t('budgetEnded.title')}</AlertTitle>
          <AlertDescription>{t('subscriptions.endedBudget')}</AlertDescription>
        </Alert>
      )}
      {period && active.length > 0 && <CommittedSummary period={period} count={active.length} />}
      {active.length === 0 ? (
        <EmptyState
          icon={RepeatIcon}
          title={t('subscriptions.empty')}
          description={t('subscriptions.emptyHelp')}
          action={
            <Button onClick={() => setDialog({ kind: 'add' })}>
              <PlusIcon />
              {t('subscriptions.addFirst')}
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3" aria-label={t('subscriptions.listLabel')}>
          {active.map((subscription) => (
            <SubscriptionCard
              key={subscription.id}
              subscription={subscription}
              budgetHasEnd={budget.end_date !== null}
              today={current.data?.today ?? periods.data?.[0]?.today ?? null}
              onEdit={() => setDialog({ kind: 'edit', subscription })}
              onEnd={() => setDialog({ kind: 'end', subscription })}
            />
          ))}
        </ul>
      )}
      {endedList.length > 0 && (
        <EndedSubscriptions subscriptions={endedList} periods={periods.data} />
      )}

      <SubscriptionFormDialog
        budgetId={budgetId}
        open={dialog.kind === 'add' || dialog.kind === 'edit'}
        onOpenChange={(open) => {
          if (!open) close()
        }}
        subscription={dialog.kind === 'edit' ? dialog.subscription : undefined}
        periods={periods.data}
        currentPeriod={period}
      />
      <EndSubscriptionDialog
        budgetId={budgetId}
        subscription={dialog.kind === 'end' ? dialog.subscription : null}
        periods={periods.data}
        currentPeriod={period}
        onClose={close}
      />
    </div>
  )
}

/** The current period's committed figure: the monthly costs of the subscriptions in force. */
function CommittedSummary({ period, count }: { period: PeriodSummary; count: number }) {
  const { t } = useTranslation()
  return (
    <Card size="sm" data-testid="committed-summary">
      <CardContent className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-col">
          <span className="text-muted-foreground">{t('subscriptions.committedPerMonth')}</span>
          <span className="text-xs text-muted-foreground">
            {t('subscriptions.committedHelp', { count })}
          </span>
        </div>
        <span className="text-2xl font-semibold tabular-nums" data-testid="committed-total">
          {formatMoney(period.committed_total ?? 0)}
        </span>
      </CardContent>
    </Card>
  )
}

function SubscriptionCard({
  subscription,
  budgetHasEnd,
  today,
  onEdit,
  onEnd,
}: {
  subscription: Subscription
  onEdit: () => void
  onEnd: () => void
  /** The budget has an end date: a subscription with no charge left before it says so. */
  budgetHasEnd: boolean
  /** The database's today: a next charge date not after it is a charge held back. */
  today: string | null
}) {
  const { t } = useTranslation()
  const path = useCategoryPath()
  const awaiting = subscription.awaiting_count
  return (
    <li data-testid="subscription-card">
      <Card size="sm">
        <CardContent className="flex items-start gap-3">
          <span className="mt-0.5 hidden size-9 shrink-0 items-center justify-center rounded-full bg-muted sm:flex">
            <RepeatIcon className="size-4 text-muted-foreground" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="truncate font-medium">{subscription.name}</h2>
              {awaiting > 0 && (
                <Badge
                  asChild
                  variant="outline"
                  className="border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"
                >
                  <Link to={paths.dashboard} data-testid="awaiting-badge">
                    <BellRingIcon aria-hidden />
                    {t('subscriptions.awaiting', { count: awaiting })}
                  </Link>
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {t(`subscriptions.pricePer.${subscription.cadence}`, {
                amount: formatMoney(subscription.price),
              })}
              {' · '}
              {path(subscription.category_name, subscription.parent_category_name)}
            </p>
            {/* Each label sits on its value: a label that wraps (French) never shifts the other. */}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:flex sm:gap-x-8 [&>div]:flex [&>div]:flex-col [&>div]:justify-end">
              <div>
                <dt className="text-muted-foreground">{t('subscriptions.nextCharge')}</dt>
                <dd className="font-medium" data-testid="next-charge">
                  {subscription.next_charge_date &&
                  today !== null &&
                  subscription.next_charge_date <= today ? (
                    // R-SUBSCRIPTION-190: its date has come and the charge waits for room.
                    <span className="flex flex-col font-normal" data-testid="charge-held">
                      <span className="flex items-center gap-1 font-medium text-amber-800 dark:text-amber-200">
                        <HourglassIcon className="size-3.5" aria-hidden />
                        {t('subscriptions.held.title', {
                          date: formatCalendarDate(subscription.next_charge_date),
                        })}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t('subscriptions.held.why')}
                      </span>
                    </span>
                  ) : subscription.next_charge_date ? (
                    <CalendarDate value={subscription.next_charge_date} />
                  ) : budgetHasEnd ? (
                    // R-SUBSCRIPTION-151: no next date, because none falls before the budget ends.
                    <span className="font-normal text-muted-foreground">
                      {t('subscriptions.noFurtherCharge')}
                    </span>
                  ) : (
                    '–'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('subscriptions.monthlyCost')}</dt>
                <dd className="font-medium tabular-nums" data-testid="monthly-cost">
                  {formatMoney(subscription.monthly_cost)}
                </dd>
              </div>
            </dl>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('subscriptions.actionsFor', { name: subscription.name })}
              >
                <EllipsisVerticalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem onSelect={onEdit}>
                <PencilIcon />
                {t('subscriptions.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={transactionsOf({ subscription: subscription.id })}>
                  <ListIcon />
                  {t('subscriptions.seeTransactions')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onEnd}>
                <Trash2Icon />
                {subscription.removal_deletes
                  ? t('subscriptions.remove.delete')
                  : t('subscriptions.remove.endAction')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardContent>
      </Card>
    </li>
  )
}

/** Ended subscriptions, folded away: past periods keep them and their charges. */
function EndedSubscriptions({
  subscriptions,
  periods,
}: {
  subscriptions: Subscription[]
  periods: PeriodSummary[]
}) {
  const { t } = useTranslation()
  const path = useCategoryPath()
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section className="flex flex-col gap-3">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="self-start px-2" data-testid="ended-toggle">
            <ChevronDownIcon
              className={open ? 'rotate-180 transition-transform' : 'transition-transform'}
              aria-hidden
            />
            {t('subscriptions.endedTitle', { count: subscriptions.length })}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{t('subscriptions.endedHelp')}</p>
          <ul className="flex flex-col divide-y rounded-xl border">
            {subscriptions.map((subscription) => {
              const lastPeriod = periods.find(
                (period) => period.seq === (subscription.end_seq ?? 0) - 1,
              )
              return (
                <li
                  key={subscription.id}
                  className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                  data-testid="ended-subscription"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{subscription.name}</p>
                    <p className="text-muted-foreground">
                      {t(`subscriptions.pricePer.${subscription.cadence}`, {
                        amount: formatMoney(subscription.price),
                      })}
                      {' · '}
                      {path(subscription.category_name, subscription.parent_category_name)}
                    </p>
                  </div>
                  <p className="text-muted-foreground">
                    {lastPeriod
                      ? t('subscriptions.lastCounted', {
                          date: formatCalendarDate(lastPeriod.end_date),
                        })
                      : t('subscriptions.endedLabel')}
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
