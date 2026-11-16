import { zodResolver } from '@hookform/resolvers/zod'
import {
  CalendarClockIcon,
  CalendarOffIcon,
  CalendarRangeIcon,
  EllipsisVerticalIcon,
  HourglassIcon,
  RotateCcwIcon,
  SkipForwardIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { CalendarDate, CalendarDateField } from '@/components/form/calendar-date-field'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FieldGroup } from '@/components/ui/field'
import { budgetKeys } from '@/features/budgets/budget-keys'
import {
  unwrap,
  useCurrentPeriod,
  usePeriods,
  type PeriodSummary,
} from '@/features/budgets/budget-queries'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'
import { useAppMutation, useErrorMessage } from '@/hooks/use-app-mutation'
import { addDays, formatCalendarDate, isCalendarDate } from '@/lib/date'
import { calendarDateSchema, optionalCalendarDateSchema } from '@/lib/form-schemas'
import { formatMoney } from '@/lib/money'
import { supabase } from '@/lib/supabase'

/**
 * Periods run from one salary to the day before the next; stored periods are facts and are
 * identified by their dates. The four boundary operations of the contract are offered as
 * what happened to a salary, each with a preview of the resulting dates and how to undo it:
 *
 * - "The next salary is expected on …" (and reset to the projection): set_expected_pay_date.
 * - "The salary arrived early": record_early_pay_date, the current period closes.
 * - "This period's salary has not arrived yet": reopen_previous_period, the latest period
 *   is merged into the previous one.
 * - "This period's salary actually arrived on …": move_period_start.
 *
 * The database applies the rules (a period is 7 to 92 days, dates in range); the client
 * only previews dates the user typed.
 */

type Action =
  | { kind: 'expected'; period: PeriodSummary }
  | { kind: 'resetExpected'; period: PeriodSummary }
  | { kind: 'early'; period: PeriodSummary }
  | { kind: 'reopen'; period: PeriodSummary; previous: PeriodSummary }
  | { kind: 'moveStart'; period: PeriodSummary; previous: PeriodSummary }

interface BoundaryWrite {
  action: Action
  /** The date the user gave; null to reset (expected) or use the projection (reopen). */
  date: string | null
}

function useBoundaryAction(budgetId: string) {
  const { t } = useTranslation()
  return useAppMutation<null, BoundaryWrite>({
    errorDisplay: 'inline',
    mutationFn: async ({ action, date }) => {
      const pay = date ? { p_pay_date: date } : {}
      if (action.kind === 'expected' || action.kind === 'resetExpected') {
        unwrap(await supabase.rpc('set_expected_pay_date', { p_budget_id: budgetId, ...pay }))
      } else if (action.kind === 'early') {
        unwrap(
          await supabase.rpc('record_early_pay_date', {
            p_budget_id: budgetId,
            p_pay_date: date ?? '',
          }),
        )
      } else if (action.kind === 'reopen') {
        unwrap(await supabase.rpc('reopen_previous_period', { p_budget_id: budgetId, ...pay }))
      } else {
        unwrap(
          await supabase.rpc('move_period_start', {
            p_period_id: action.period.id,
            p_start_date: date ?? '',
          }),
        )
      }
      return null
    },
    success: (_data, { action }) =>
      action.kind === 'resetExpected' ? t('periods.resetDone') : t('periods.saved'),
    // A boundary operation can add, merge or change periods and the current one.
    invalidate: () => [budgetKeys.budget(budgetId)],
  })
}

// R-PERIOD-051: salary-phrased actions, each with a preview and how to undo it.
export function PeriodsPage() {
  const { t } = useTranslation()
  const { budgetId, budget } = useCurrentBudget()
  const periods = usePeriods(budgetId)
  // Whether the budget has ended is the database's answer, not the absence of a row.
  const current = useCurrentPeriod(budgetId)
  const [action, setAction] = useState<Action | null>(null)
  const write = useBoundaryAction(budgetId)
  const close = () => setAction(null)
  const open = (next: Action) => {
    write.reset()
    setAction(next)
  }

  const header = <PageHeader title={t('nav.periods')} description={t('periods.description')} />

  const failed = [periods, current].find((query) => query.isError)
  if (failed) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ErrorState
          error={failed.error}
          onRetry={() => {
            periods.refetch()
            current.refetch()
          }}
        />
      </div>
    )
  }
  if (periods.data === undefined || current.data === undefined) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <LoadingState rows={4} />
      </div>
    )
  }

  const list = periods.data
  const ended = current.data === null
  const range = (period: PeriodSummary) =>
    `${formatCalendarDate(period.start_date)} – ${formatCalendarDate(period.end_date)}`

  return (
    <div className="flex flex-col gap-6">
      {header}
      <ListConsistency list={list} current={current.data} refetch={periods.refetch} />
      {ended && (
        <Alert>
          <CalendarOffIcon aria-hidden />
          <AlertTitle>{t('budgetEnded.title')}</AlertTitle>
          <AlertDescription>
            {budget.end_date
              ? t('periods.endedDescription', { date: formatCalendarDate(budget.end_date) })
              : t('dashboard.ended.descriptionNoDate')}
          </AlertDescription>
        </Alert>
      )}
      {list.length === 0 ? (
        <EmptyState icon={CalendarRangeIcon} title={t('periods.empty')} />
      ) : (
        <ol className="flex flex-col divide-y rounded-xl border" aria-label={t('nav.periods')}>
          {list.map((period, index) => {
            // Newest first: the previous period is the next row.
            const previous = list[index + 1]
            const isCurrent = period.is_current === true
            const entered = budget.end_date_entered
            const isLast =
              entered !== null && period.start_date <= entered && entered <= period.end_date
            return (
              <li
                key={period.id}
                data-testid="period-row"
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium tabular-nums">
                      <CalendarDate value={period.start_date} /> –{' '}
                      <CalendarDate value={period.end_date} />
                    </h2>
                    {isCurrent && <Badge>{t('periods.current')}</Badge>}
                    {previous?.end_is_manual && (
                      <Badge variant="outline">{t('periods.manualStart')}</Badge>
                    )}
                    {period.end_is_manual && (
                      <Badge variant="outline">{t('periods.manualEnd')}</Badge>
                    )}
                    {isLast && <Badge variant="secondary">{t('periods.lastPeriod')}</Badge>}
                  </div>
                  {isCurrent && (
                    <p className="text-sm text-muted-foreground">
                      {period.end_is_manual
                        ? t('periods.nextExpectedManual', {
                            date: formatCalendarDate(addDays(period.end_date, 1)),
                          })
                        : t('periods.nextExpected', {
                            date: formatCalendarDate(addDays(period.end_date, 1)),
                          })}
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <div className="sm:text-right">
                    <p className="text-xs text-muted-foreground">{t('periods.incomeTotal')}</p>
                    <p className="font-medium tabular-nums">
                      {formatMoney(period.income_total ?? 0)}
                    </p>
                  </div>
                  {(isCurrent || previous) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          aria-label={t('periods.actionsFor', { range: range(period) })}
                        >
                          <EllipsisVerticalIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="max-w-80 min-w-64">
                        {isCurrent && (
                          <DropdownMenuItem onSelect={() => open({ kind: 'expected', period })}>
                            <CalendarClockIcon />
                            {t('periods.actions.expected')}
                          </DropdownMenuItem>
                        )}
                        {isCurrent && (
                          <DropdownMenuItem onSelect={() => open({ kind: 'early', period })}>
                            <SkipForwardIcon />
                            {t('periods.actions.early')}
                          </DropdownMenuItem>
                        )}
                        {isCurrent && previous && (
                          <DropdownMenuItem
                            onSelect={() => open({ kind: 'reopen', period, previous })}
                          >
                            <HourglassIcon />
                            {t('periods.actions.notYet')}
                          </DropdownMenuItem>
                        )}
                        {previous && (
                          <DropdownMenuItem
                            onSelect={() => open({ kind: 'moveStart', period, previous })}
                          >
                            <CalendarClockIcon />
                            {t('periods.actions.moveStart')}
                          </DropdownMenuItem>
                        )}
                        {isCurrent && period.end_is_manual && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => open({ kind: 'resetExpected', period })}
                            >
                              <RotateCcwIcon />
                              {t('periods.actions.resetExpected')}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <BoundaryDialog action={action} mutation={write} onClose={close} />
    </div>
  )
}

const requiredDate = z.object({ date: calendarDateSchema })
const optionalDate = z.object({ date: optionalCalendarDateSchema })
type DateInput = z.input<typeof optionalDate>
type DateValues = z.output<typeof optionalDate>

function BoundaryDialog({
  action,
  mutation,
  onClose,
}: {
  action: Action | null
  mutation: ReturnType<typeof useBoundaryAction>
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={action !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
    >
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md">
        {action && (
          <>
            <DialogHeader>
              <DialogTitle>{t(`periods.dialogs.${action.kind}.title`)}</DialogTitle>
              <DialogDescription>
                {t(`periods.dialogs.${action.kind}.description`)}
              </DialogDescription>
            </DialogHeader>
            <BoundaryForm action={action} mutation={mutation} onClose={onClose} />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function BoundaryForm({
  action,
  mutation,
  onClose,
}: {
  action: Action
  mutation: ReturnType<typeof useBoundaryAction>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const { period } = action
  const today = period.today ?? period.end_date
  const fmt = formatCalendarDate
  // Reset takes no date; reopening may take one (otherwise the projection).
  const hasField = action.kind !== 'resetExpected'
  const optional = action.kind === 'reopen'

  const defaultDate =
    action.kind === 'expected'
      ? addDays(period.end_date, 1)
      : action.kind === 'early'
        ? today
        : action.kind === 'moveStart'
          ? period.start_date
          : ''
  const form = useForm<DateInput, unknown, DateValues>({
    resolver: zodResolver(optional || !hasField ? optionalDate : requiredDate),
    defaultValues: { date: defaultDate },
  })
  const date = useWatch({ control: form.control, name: 'date' })
  const valid = isCalendarDate(date)

  /** The resulting dates, worded from the user's point of view, and how to undo. */
  const preview: { result: string | null; undo: string } = (() => {
    switch (action.kind) {
      case 'expected':
        return {
          result: valid
            ? t('periods.preview.expected', { end: fmt(addDays(date, -1)), date: fmt(date) })
            : null,
          undo: t('periods.undo.expected'),
        }
      case 'resetExpected':
        return { result: t('periods.preview.resetExpected'), undo: t('periods.undo.resetExpected') }
      case 'early':
        return {
          result: valid
            ? t('periods.preview.early', { end: fmt(addDays(date, -1)), start: fmt(date) })
            : null,
          undo: t('periods.undo.early'),
        }
      case 'reopen':
        return {
          result: valid
            ? t('periods.preview.reopenUntil', {
                start: fmt(action.previous.start_date),
                end: fmt(addDays(date, -1)),
              })
            : t('periods.preview.reopenProjected', { start: fmt(action.previous.start_date) }),
          undo: t('periods.undo.reopen', { date: fmt(period.start_date) }),
        }
      case 'moveStart':
        return {
          result: valid
            ? t('periods.preview.moveStart', { end: fmt(addDays(date, -1)), start: fmt(date) })
            : null,
          undo: t('periods.undo.moveStart', { date: fmt(period.start_date) }),
        }
    }
  })()

  const onSubmit = form.handleSubmit((values) =>
    mutation
      .mutateAsync({ action, date: hasField ? values.date : null }, { onSuccess: onClose })
      .catch(() => undefined),
  )

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate>
      <FieldGroup>
        {mutation.isError && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(mutation.error)}</AlertDescription>
          </Alert>
        )}
        <p className="text-sm">
          {t('periods.thisPeriod', { start: fmt(period.start_date), end: fmt(period.end_date) })}
        </p>
        {hasField && (
          <CalendarDateField
            control={form.control}
            name="date"
            label={t(`periods.dialogs.${action.kind}.field`)}
            autoFocus
            description={t(`periods.dialogs.${action.kind}.range`, { today: fmt(today) })}
          />
        )}
        {action.kind === 'reopen' && (
          <p className="text-sm text-muted-foreground">{t('periods.reopenMoves')}</p>
        )}
        {preview.result && (
          <Alert data-testid="boundary-preview">
            <CalendarRangeIcon aria-hidden />
            <AlertDescription>
              <p>{preview.result}</p>
              <p className="text-muted-foreground">{preview.undo}</p>
            </AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending
              ? t('common.saving')
              : action.kind === 'resetExpected'
                ? t('periods.reset')
                : t('common.save')}
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  )
}

/**
 * The current period the database gave must be in the list; if a read raced the period's
 * creation (another tab, or get_current_period creating it), read the list again once.
 */
function ListConsistency({
  list,
  current,
  refetch,
}: {
  list: PeriodSummary[]
  current: PeriodSummary | null
  refetch: () => void
}) {
  const missing = current !== null && !list.some((period) => period.id === current.id)
  useEffect(() => {
    if (missing) refetch()
  }, [missing, refetch])
  return null
}
