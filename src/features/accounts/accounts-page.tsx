import {
  CalendarOffIcon,
  ChevronDownIcon,
  EllipsisVerticalIcon,
  LandmarkIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  WorkflowIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { paths } from '@/app/paths'
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
import { useAccounts, isVoidAccount, type Account } from '@/features/accounts/account-queries'
import { ACCOUNT_ICONS, useHolderText } from '@/features/accounts/account-views'
import { AccountFormDialog } from '@/features/accounts/components/account-form-dialog'
import { CloseAccountDialog } from '@/features/accounts/components/close-account-dialog'
import { useBudgetEnded } from '@/features/budgets/budget-ended'
import {
  useCurrentPeriod,
  useMembers,
  usePeriods,
  type PeriodSummary,
} from '@/features/budgets/budget-queries'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'
import { formatCalendarDate } from '@/lib/date'

type DialogState =
  | { kind: 'closed' }
  | { kind: 'add' }
  | { kind: 'edit'; account: Account }
  | { kind: 'close'; account: Account }

/**
 * The household's accounts (R-ACCOUNT-001): those in force, with their kind, bank and holder,
 * and the closed ones folded away. Optional: nothing elsewhere needs them (D-501).
 */
export function AccountsPage() {
  const { t } = useTranslation()
  const { budgetId } = useCurrentBudget()
  const accounts = useAccounts(budgetId)
  const current = useCurrentPeriod(budgetId)
  const periods = usePeriods(budgetId)
  const members = useMembers(budgetId)
  const ended = useBudgetEnded(budgetId)
  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' })
  const close = () => setDialog({ kind: 'closed' })

  const header = (
    <PageHeader
      title={t('nav.accounts')}
      description={t('pages.accounts.description')}
      action={
        <Button
          onClick={() => setDialog({ kind: 'add' })}
          disabled={!current.isSuccess || !periods.data}
        >
          <PlusIcon />
          {t('accounts.add')}
        </Button>
      }
    />
  )
  const failed = [accounts, current, periods].find((query) => query.isError)
  if (failed) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ErrorState
          error={failed.error}
          onRetry={() => {
            accounts.refetch()
            current.refetch()
            periods.refetch()
          }}
        />
      </div>
    )
  }
  if (!accounts.data || current.data === undefined || !periods.data) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <LoadingState rows={3} />
      </div>
    )
  }
  const all = accounts.data
  // Once the budget has ended nothing is "in force now"; those never closed stay listed.
  const open = all.filter((item) => item.is_active || (ended && item.end_seq === null))
  const closedList = all.filter((item) => !open.includes(item) && !isVoidAccount(item))

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {header}
      {ended && (
        <Alert>
          <CalendarOffIcon aria-hidden />
          <AlertTitle>{t('budgetEnded.title')}</AlertTitle>
          <AlertDescription>{t('accounts.addNoteEnded')}</AlertDescription>
        </Alert>
      )}
      {open.length === 0 ? (
        <EmptyState
          icon={LandmarkIcon}
          title={t('accounts.empty')}
          description={
            <>
              <span className="block">{t('accounts.emptyHelp')}</span>
              <span className="mt-1 block">{t('accounts.suggestions')}</span>
            </>
          }
          action={
            <Button onClick={() => setDialog({ kind: 'add' })}>
              <PlusIcon />
              {t('accounts.addFirst')}
            </Button>
          }
        />
      ) : (
        <>
          <ul className="flex flex-col gap-3" aria-label={t('accounts.listLabel')}>
            {open.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                onEdit={() => setDialog({ kind: 'edit', account })}
                onClose={() => setDialog({ kind: 'close', account })}
              />
            ))}
          </ul>
          <Button asChild variant="outline" className="self-start">
            <Link to={paths.moneyFlow}>
              <WorkflowIcon />
              {t('nav.moneyFlow')}
            </Link>
          </Button>
        </>
      )}
      {closedList.length > 0 && (
        <ClosedAccounts
          accounts={closedList}
          periods={periods.data}
          onEdit={(account) => setDialog({ kind: 'edit', account })}
        />
      )}
      <AccountFormDialog
        budgetId={budgetId}
        open={dialog.kind === 'add' || dialog.kind === 'edit'}
        onOpenChange={(next) => {
          if (!next) close()
        }}
        account={dialog.kind === 'edit' ? dialog.account : undefined}
        members={members.data ?? []}
        periods={periods.data}
        currentPeriod={current.data}
        initialKind={open.length === 0 ? 'current' : open.length === 1 ? 'savings' : undefined}
      />
      <CloseAccountDialog
        budgetId={budgetId}
        account={dialog.kind === 'close' ? dialog.account : null}
        periods={periods.data}
        currentPeriod={current.data}
        onClose={close}
      />
    </div>
  )
}

function AccountCard({
  account,
  onEdit,
  onClose,
}: {
  account: Account
  onEdit: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const holder = useHolderText()
  const Icon = ACCOUNT_ICONS[account.kind]
  return (
    <li data-testid="account-card">
      <Card size="sm">
        <CardContent className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
            <Icon className="size-4 text-muted-foreground" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="truncate font-medium">{account.name}</h2>
              {account.in_use && (
                <Badge variant="secondary" title={t('accounts.inUseHelp')}>
                  {t('accounts.inUse')}
                </Badge>
              )}
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {[t(`accounts.kinds.${account.kind}`), account.bank_label, holder(account)]
                .filter((part): part is string => Boolean(part))
                .join(' · ')}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('accounts.actionsFor', { name: account.name })}
              >
                <EllipsisVerticalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem onSelect={onEdit}>
                <PencilIcon />
                {t('accounts.edit')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onClose}>
                <Trash2Icon />
                {account.removal_deletes ? t('accounts.deleteAction') : t('accounts.closeAction')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardContent>
      </Card>
    </li>
  )
}

/** Closed accounts, folded away: earlier periods keep them. They can still be renamed. */
function ClosedAccounts({
  accounts,
  periods,
  onEdit,
}: {
  accounts: Account[]
  periods: PeriodSummary[]
  onEdit: (account: Account) => void
}) {
  const { t } = useTranslation()
  const holder = useHolderText()
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section className="flex flex-col gap-3">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="self-start px-2" data-testid="closed-accounts-toggle">
            <ChevronDownIcon
              className={open ? 'rotate-180 transition-transform' : 'transition-transform'}
              aria-hidden
            />
            {t('accounts.closedTitle', { count: accounts.length })}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{t('accounts.closedHelp')}</p>
          <ul className="flex flex-col divide-y rounded-xl border">
            {accounts.map((account) => {
              const from = periods.find((period) => period.seq === account.end_seq)
              return (
                <li
                  key={account.id}
                  className="flex items-center gap-3 p-3 text-sm"
                  data-testid="closed-account"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{account.name}</p>
                    <p className="truncate text-muted-foreground">
                      {[t(`accounts.kinds.${account.kind}`), holder(account)].join(' · ')}
                      {from &&
                        ` · ${t('accounts.closedFrom', { date: formatCalendarDate(from.start_date) })}`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('accounts.actionsFor', { name: account.name })}
                    onClick={() => onEdit(account)}
                  >
                    <PencilIcon />
                  </Button>
                </li>
              )
            })}
          </ul>
        </CollapsibleContent>
      </section>
    </Collapsible>
  )
}
