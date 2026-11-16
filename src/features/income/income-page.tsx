import {
  CalendarOffIcon,
  EllipsisVerticalIcon,
  HandCoinsIcon,
  PencilIcon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CalendarDate } from '@/components/form/calendar-date-field'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/features/auth/auth-context'
import {
  memberName,
  useCurrentPeriod,
  useIncomes,
  useMembers,
  usePeriods,
  type BudgetMember,
  type IncomeOverview,
  type PeriodSummary,
} from '@/features/budgets/budget-queries'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'
import { IncomeFormDialog } from '@/features/income/components/income-form-dialog'
import { MakePrimaryDialog } from '@/features/income/components/make-primary-dialog'
import { RemoveIncomeDialog } from '@/features/income/components/remove-income-dialog'
import { SalaryArrivedPrompt } from '@/features/income/components/salary-arrived-prompt'
import { useRemoveIncome, useSetPrimaryIncome } from '@/features/income/income-mutations'
import { previousOf } from '@/features/income/pay-date-preview'
import type { ArrivedOffer } from '@/features/periods/boundary-ranges'
import { nextSalary, type NextSalary } from '@/features/periods/next-salary'
import { formatCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'

type DialogState =
  | { kind: 'closed' }
  | { kind: 'add' }
  | { kind: 'edit'; income: IncomeOverview }
  | { kind: 'remove'; income: IncomeOverview }
  | { kind: 'primary'; income: IncomeOverview }

export function IncomePage() {
  const { t } = useTranslation()
  const { budgetId, budget } = useCurrentBudget()
  const incomes = useIncomes(budgetId)
  const members = useMembers(budgetId)
  const current = useCurrentPeriod(budgetId)
  const periods = usePeriods(budgetId)
  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' })
  const remove = useRemoveIncome(budgetId)
  const makePrimary = useSetPrimaryIncome(budgetId)
  // R-PERIOD-037: what to ask about a salary already due under new primary terms.
  const [arrived, setArrived] = useState<ArrivedOffer | null>(null)

  const queries = [incomes, members, current]
  const failed = queries.find((query) => query.isError)
  const ended = current.isSuccess && current.data === null

  const header = (
    <PageHeader
      title={t('nav.income')}
      description={t('pages.income.description')}
      action={
        <Button
          onClick={() => setDialog({ kind: 'add' })}
          disabled={!current.isSuccess || ended}
          title={ended ? t('income.endedNoAdd') : undefined}
        >
          <PlusIcon />
          {t('income.add')}
        </Button>
      }
    />
  )

  if (failed) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ErrorState
          error={failed.error}
          onRetry={() =>
            queries.forEach((query) => {
              void query.refetch()
            })
          }
        />
      </div>
    )
  }
  if (!incomes.data || !members.data || current.data === undefined) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <LoadingState />
      </div>
    )
  }

  const memberList = members.data
  const currentPeriod = current.data
  const active = incomes.data.filter((income) => income.is_active)
  const endedIncomes = incomes.data.filter((income) => !income.is_active)
  // The primary income's next salary is the current period's, as everywhere else.
  const next = nextSalary(currentPeriod, budget.end_date_entered)
  // Another income's next pay date is its own schedule, within the budget's life only.
  const lastDay = currentPeriod ? budget.end_date : null

  return (
    <div className="flex flex-col gap-6">
      {header}
      {ended && (
        <Alert>
          <CalendarOffIcon aria-hidden />
          <AlertTitle>{t('budgetEnded.title')}</AlertTitle>
          <AlertDescription>{t('income.endedDescription')}</AlertDescription>
        </Alert>
      )}
      {currentPeriod && (
        <Card size="sm">
          <CardContent className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-muted-foreground">{t('income.monthlyTotal')}</span>
            <span className="text-2xl font-semibold tabular-nums" data-testid="monthly-total">
              {formatMoney(currentPeriod.income_total ?? 0)}
            </span>
          </CardContent>
        </Card>
      )}
      {active.length === 0 ? (
        <EmptyState icon={HandCoinsIcon} title={t('income.empty')} />
      ) : (
        <ul className="flex flex-col gap-3">
          {active.map((income) => (
            <IncomeCard
              key={income.id}
              income={income}
              members={memberList}
              ended={ended}
              nextPayDate={nextPayDateOf(income, next, ended, lastDay)}
              onEdit={() => setDialog({ kind: 'edit', income })}
              onRemove={() => {
                remove.reset()
                setDialog({ kind: 'remove', income })
              }}
              onMakePrimary={() => {
                makePrimary.reset()
                setDialog({ kind: 'primary', income })
              }}
              makingPrimary={makePrimary.isPending}
            />
          ))}
        </ul>
      )}
      {endedIncomes.length > 0 && (
        <EndedIncomes incomes={endedIncomes} members={memberList} periods={periods.data ?? []} />
      )}

      <IncomeFormDialog
        budgetId={budgetId}
        open={dialog.kind === 'add' || dialog.kind === 'edit'}
        onOpenChange={(open) => {
          if (!open) setDialog({ kind: 'closed' })
        }}
        income={dialog.kind === 'edit' ? dialog.income : undefined}
        members={memberList}
        periods={periods.data ?? []}
        currentPeriod={currentPeriod}
        onSalaryMayHaveArrived={setArrived}
      />
      <MakePrimaryDialog
        budgetId={budgetId}
        income={dialog.kind === 'primary' ? dialog.income : null}
        currentPeriod={currentPeriod}
        previousPeriod={previousOf(periods.data ?? [], currentPeriod)}
        mutation={makePrimary}
        onClose={() => setDialog({ kind: 'closed' })}
        onSalaryMayHaveArrived={setArrived}
      />
      <SalaryArrivedPrompt
        offer={arrived}
        periodStart={currentPeriod?.start_date ?? null}
        onClose={() => setArrived(null)}
      />
      <RemoveIncomeDialog
        income={dialog.kind === 'remove' ? dialog.income : null}
        periods={periods.data ?? []}
        mutation={remove}
        onClose={() => setDialog({ kind: 'closed' })}
      />
    </div>
  )
}

/** Whose income it is, as a member list can say it. */
function useOwnerLabel(): (income: IncomeOverview, members: BudgetMember[]) => string {
  const { t } = useTranslation()
  const { user } = useAuth()
  return (income, members) => {
    if (!income.user_id) return t('income.owner.deletedAccount')
    const member = members.find((item) => item.user_id === income.user_id)
    // A former member: the database still gives their name (user_display_name).
    if (!member) {
      return income.user_display_name
        ? t('income.owner.formerMemberNamed', { name: income.user_display_name })
        : t('income.owner.formerMember')
    }
    const name = memberName(member) ?? t('members.unknownName')
    return income.user_id === user?.id ? t('members.you', { name }) : name
  }
}

/**
 * The next pay date shown on an income's card: for the primary income the next salary of
 * the current period (none in the last period or once the budget has ended); for another
 * income its own schedule, unless the budget has ended or ends before it.
 */
function nextPayDateOf(
  income: IncomeOverview,
  next: NextSalary,
  ended: boolean,
  lastDay: string | null,
): string | null {
  if (ended) return null
  if (income.is_primary) return next.kind === 'expected' ? next.date : null
  const date = income.next_pay_date
  return date && (lastDay === null || date <= lastDay) ? date : null
}

function IncomeCard({
  income,
  members,
  ended,
  nextPayDate,
  onEdit,
  onRemove,
  onMakePrimary,
  makingPrimary,
}: {
  income: IncomeOverview
  members: BudgetMember[]
  ended: boolean
  /** From nextPayDateOf. */
  nextPayDate: string | null
  onEdit: () => void
  onRemove: () => void
  onMakePrimary: () => void
  makingPrimary: boolean
}) {
  const { t } = useTranslation()
  const ownerLabel = useOwnerLabel()
  const primary = income.is_primary === true

  return (
    <li>
      <Card size="sm" data-testid="income-card">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <h2 className="truncate">{income.name}</h2>
            {primary && (
              <Badge>
                <StarIcon aria-hidden />
                {t('income.primary')}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>{ownerLabel(income, members)}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">{t('income.fields.amount')}</dt>
              <dd className="font-medium tabular-nums">{formatMoney(income.amount)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('income.fields.payDay')}</dt>
              <dd>
                {t('income.payDayWithRule', {
                  day: income.pay_day,
                  rule: t(`income.weekendRule.${income.weekend_rule}.short`),
                })}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('income.nextPayDate')}</dt>
              <dd data-testid="income-next-pay-date">
                {nextPayDate ? <CalendarDate value={nextPayDate} /> : '–'}
              </dd>
            </div>
          </dl>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="self-end"
                aria-label={t('income.actionsFor', { name: income.name })}
              >
                <EllipsisVerticalIcon />
                <span>{t('common.actions')}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuItem onSelect={onEdit} disabled={ended}>
                <PencilIcon />
                {t('income.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={primary || ended || makingPrimary}
                onSelect={onMakePrimary}
              >
                <StarIcon />
                {t('income.makePrimary')}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" disabled={primary} onSelect={onRemove}>
                <Trash2Icon />
                {t('income.remove')}
              </DropdownMenuItem>
              {primary && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  {t('income.primaryCannotRemove')}
                </p>
              )}
              {ended && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  {t('income.endedNoEdit')}
                </p>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </CardContent>
      </Card>
    </li>
  )
}

function EndedIncomes({
  incomes,
  members,
  periods,
}: {
  incomes: IncomeOverview[]
  members: BudgetMember[]
  periods: PeriodSummary[]
}) {
  const { t } = useTranslation()
  const ownerLabel = useOwnerLabel()

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">{t('income.endedTitle')}</h2>
      <p className="text-sm text-muted-foreground">{t('income.endedHelp')}</p>
      <ul className="flex flex-col divide-y rounded-xl border">
        {incomes.map((income) => {
          // end_seq is the first period it no longer counts in.
          const lastPeriod = periods.find((period) => period.seq === (income.end_seq ?? 0) - 1)
          return (
            <li
              key={income.id}
              className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{income.name}</p>
                <p className="text-muted-foreground">{ownerLabel(income, members)}</p>
              </div>
              <p className="text-muted-foreground">
                {lastPeriod
                  ? t('income.lastCounted', { date: formatCalendarDate(lastPeriod.end_date) })
                  : t('income.endedLabel')}
              </p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
