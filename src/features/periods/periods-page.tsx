import { zodResolver } from '@hookform/resolvers/zod'
import {
  CalendarClockIcon,
  CalendarOffIcon,
  CalendarRangeIcon,
  EllipsisVerticalIcon,
  HourglassIcon,
  PieChartIcon,
  RotateCcwIcon,
  SkipForwardIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { z } from 'zod'

import { useBudgetEnded } from '@/features/budgets/budget-ended'
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
import {
  earlyRange,
  earlyUnavailable,
  inRange,
  isEmpty,
  moveStartRange,
  type DateRange,
} from '@/features/periods/boundary-ranges'
import { nextSalary } from '@/features/periods/next-salary'
import { progressPath } from '@/features/progress/progress-path'
import { useAppMutation, useErrorMessage } from '@/hooks/use-app-mutation'
import { isRecordChanged } from '@/hooks/use-edit-base'
import { dbErrorCode, dbErrorKey } from '@/lib/db-errors'
import { addDays, formatCalendarDate, isCalendarDate } from '@/lib/date'
import { calendarDateSchema, optionalCalendarDateSchema } from '@/lib/form-schemas'
import type { Database } from '@/lib/database.types'
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
  /** `date`: proposed from the prompt after a pay-day correction (R-PERIOD-037). */
  | { kind: 'early'; period: PeriodSummary; date?: string }
  | { kind: 'reopen'; period: PeriodSummary; previous: PeriodSummary }
  | { kind: 'moveStart'; period: PeriodSummary; previous: PeriodSummary; date?: string }
  /** The boundary before `period` back to the schedule's day; clears the "set by hand" mark. */
  | { kind: 'moveSchedule'; period: PeriodSummary; previous: PeriodSummary; start: string }

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
      // R-PERIOD-055 R-CONCURRENCY-100: every operation names the period the user was looking at, with
      // its revision; another member acting first, or a retry of a call that went through,
      // is refused (record_changed), never applied twice.
      const named = {
        p_budget_id: budgetId,
        p_period_id: action.period.id,
        p_expected_revision: action.period.revision,
      }
      if (action.kind === 'expected' || action.kind === 'resetExpected') {
        unwrap(await supabase.rpc('set_expected_pay_date', { ...named, ...pay }))
      } else if (action.kind === 'early') {
        unwrap(await supabase.rpc('record_early_pay_date', { ...named, p_pay_date: date ?? '' }))
      } else if (action.kind === 'reopen') {
        unwrap(await supabase.rpc('reopen_previous_period', { ...named, ...pay }))
      } else {
        unwrap(
          await supabase.rpc('move_period_start', {
            p_period_id: action.period.id,
            p_expected_revision: action.period.revision,
            // Without a date: back to the day the schedule gives (R-PERIOD-100).
            ...(action.kind === 'moveStart' && date ? { p_start_date: date } : {}),
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
  // Ended from the budget's own end, never from a missing current period.
  const current = useCurrentPeriod(budgetId)
  const ended = useBudgetEnded(budgetId)
  const [action, setAction] = useState<Action | null>(null)
  const write = useBoundaryAction(budgetId)
  // Arriving from "has this salary already arrived?" (R-PERIOD-037): open the operation it
  // offered, with its date.
  const [searchParams, setSearchParams] = useSearchParams()
  const record = searchParams.get('record')
  const requestedDate = searchParams.get('date')
  const requestedKind = record === 'early' || record === 'moveStart' ? record : null
  const currentRow = current.data
  const previousRow =
    currentRow && periods.data
      ? periods.data.find((period) => period.seq === currentRow.seq - 1)
      : undefined
  const ready = currentRow !== undefined && periods.data !== undefined
  if (requestedKind && ready && action === null && currentRow) {
    const date = requestedDate ?? undefined
    if (requestedKind === 'early') setAction({ kind: 'early', period: currentRow, date })
    else if (previousRow)
      setAction({ kind: 'moveStart', period: currentRow, previous: previousRow, date })
  }
  useEffect(() => {
    if (requestedKind && ready) setSearchParams({}, { replace: true })
  }, [requestedKind, ready, setSearchParams])
  const close = () => setAction(null)
  const open = (next: Action) => {
    write.reset()
    setChangedElsewhere(false)
    setAction(next)
  }
  // The periods changed under an open action (another member, or an earlier attempt that
  // went through): the action is closed and the page, read again, says so.
  const [changedElsewhere, setChangedElsewhere] = useState(false)

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
  const range = (period: PeriodSummary) =>
    `${formatCalendarDate(period.start_date)} – ${formatCalendarDate(period.end_date)}`

  return (
    <div className="flex flex-col gap-6">
      {header}
      <ListConsistency list={list} current={current.data} refetch={periods.refetch} />
      {changedElsewhere && (
        <Alert data-testid="periods-changed" className="border-amber-500/50 bg-amber-500/5">
          <RotateCcwIcon aria-hidden />
          <AlertTitle>{t('periods.changedTitle')}</AlertTitle>
          <AlertDescription>
            <p>{t('periods.changedDescription')}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => setChangedElsewhere(false)}
            >
              {t('budgetLost.dismiss')}
            </Button>
          </AlertDescription>
        </Alert>
      )}
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
            const next = isCurrent ? nextSalary(period, entered) : null
            const early = isCurrent ? earlyUnavailable(period, entered) : null
            const moveStartEmpty = previous
              ? isEmpty(moveStartRange(period, previous, entered))
              : true
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
                      <Badge variant="outline" title={t('periods.manualPastHint')}>
                        {t('periods.manualStart')}
                      </Badge>
                    )}
                    {period.end_is_manual && (
                      <Badge
                        variant="outline"
                        title={
                          isCurrent ? t('periods.manualCurrentHint') : t('periods.manualPastHint')
                        }
                      >
                        {t('periods.manualEnd')}
                      </Badge>
                    )}
                    {isLast && <Badge variant="secondary">{t('periods.lastPeriod')}</Badge>}
                  </div>
                  {next && (
                    <p className="text-sm text-muted-foreground" data-testid="next-salary">
                      {next.kind === 'lastPeriod'
                        ? t('periods.lastPeriodNote', { date: formatCalendarDate(next.endDate) })
                        : next.kind === 'expected' && next.manual
                          ? t('periods.nextExpectedManual', { date: formatCalendarDate(next.date) })
                          : next.kind === 'expected'
                            ? t('periods.nextExpected', { date: formatCalendarDate(next.date) })
                            : null}
                    </p>
                  )}
                </div>
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 sm:justify-end">
                  <div className="min-w-0 sm:text-right">
                    <p className="text-xs text-muted-foreground">{t('periods.incomeTotal')}</p>
                    <p className="font-medium whitespace-nowrap tabular-nums">
                      {formatMoney(period.income_total ?? 0)}
                    </p>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link
                      to={progressPath(period.id)}
                      aria-label={t('periods.progressFor', { range: range(period) })}
                    >
                      <PieChartIcon />
                      {t('periods.progress')}
                    </Link>
                  </Button>
                  {isCurrent || previous ? (
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
                          <DropdownMenuItem
                            disabled={early !== null}
                            onSelect={() => open({ kind: 'early', period })}
                          >
                            <SkipForwardIcon />
                            {t('periods.actions.early')}
                          </DropdownMenuItem>
                        )}
                        {early && (
                          <p className="px-2 pb-1.5 pl-8 text-xs text-muted-foreground">
                            {early.reason === 'budgetEnds'
                              ? t('periods.unavailable.budgetEnds', {
                                  date: formatCalendarDate(early.endDateEntered),
                                })
                              : t('periods.unavailable.tooSoon', {
                                  date: formatCalendarDate(early.earliest),
                                })}
                          </p>
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
                            disabled={moveStartEmpty}
                            onSelect={() => open({ kind: 'moveStart', period, previous })}
                          >
                            <CalendarClockIcon />
                            {t('periods.actions.moveStart')}
                          </DropdownMenuItem>
                        )}
                        {previous && moveStartEmpty && (
                          <p className="px-2 pb-1.5 pl-8 text-xs text-muted-foreground">
                            {t('periods.unavailable.moveStart')}
                          </p>
                        )}
                        {previous?.end_is_manual && (
                          <MoveScheduleItem
                            period={period}
                            onOpen={(start) =>
                              open({ kind: 'moveSchedule', period, previous, start })
                            }
                          />
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
                  ) : (
                    // Keeps the progress link at the same place in every row.
                    <span className="size-7 shrink-0" aria-hidden />
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
      {/* R-PERIOD-191: the newest periods first; older ones a page at a time, on request. */}
      {periods.hasOlder && (
        <Button
          variant="outline"
          className="self-center"
          disabled={periods.loadingOlder}
          onClick={() => void periods.loadOlder()}
          data-testid="periods-older"
        >
          {periods.loadingOlder
            ? t('common.loading')
            : t('periods.showOlder', { count: list.length })}
        </Button>
      )}

      <BoundaryDialog
        action={action}
        mutation={write}
        onClose={close}
        onChangedElsewhere={() => {
          close()
          setChangedElsewhere(true)
        }}
      />
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
  onChangedElsewhere,
}: {
  action: Action | null
  mutation: ReturnType<typeof useBoundaryAction>
  onClose: () => void
  onChangedElsewhere: () => void
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
              <DialogTitle className="pr-8">
                {t(`periods.dialogs.${action.kind}.title`)}
              </DialogTitle>
              <DialogDescription>
                {t(`periods.dialogs.${action.kind}.description`)}
              </DialogDescription>
            </DialogHeader>
            <BoundaryForm
              action={action}
              mutation={mutation}
              onClose={onClose}
              onChangedElsewhere={onChangedElsewhere}
            />
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
  onChangedElsewhere,
}: {
  action: Action
  mutation: ReturnType<typeof useBoundaryAction>
  onClose: () => void
  onChangedElsewhere: () => void
}) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const { period } = action
  const today = period.today ?? period.end_date
  const fmt = formatCalendarDate
  // Reset takes no date; reopening may take one (otherwise the projection).
  const hasField = action.kind !== 'resetExpected' && action.kind !== 'moveSchedule'
  const optional = action.kind === 'reopen'

  const { budget } = useCurrentBudget()
  // R-PERIOD-054: the dates the database can accept, for "arrived early" and "moved start".
  const range: DateRange | null =
    action.kind === 'early'
      ? earlyRange(period, budget.end_date_entered)
      : action.kind === 'moveStart'
        ? moveStartRange(period, action.previous, budget.end_date_entered)
        : null
  const defaultDate =
    action.kind === 'expected'
      ? addDays(period.end_date, 1)
      : action.kind === 'early'
        ? (action.date ?? range?.max ?? today)
        : action.kind === 'moveStart'
          ? (action.date ?? period.start_date)
          : ''
  const form = useForm<DateInput, unknown, DateValues>({
    resolver: zodResolver(optional || !hasField ? optionalDate : requiredDate),
    defaultValues: { date: defaultDate },
  })
  const date = useWatch({ control: form.control, name: 'date' })
  const typed = isCalendarDate(date)
  const outsideRange = typed && range !== null && !inRange(date, range) ? range : null
  const outside = outsideRange !== null
  const valid = typed && !outside
  const budgetId = budget.id
  const reopenPreview = useReopenPreview(budgetId, action.kind === 'reopen')

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
      case 'moveSchedule':
        return {
          result: t('periods.preview.moveScheduleTo', {
            start: fmt(action.start),
            end: fmt(addDays(action.start, -1)),
          }),
          undo: t('periods.undo.moveStart', { date: fmt(period.start_date) }),
        }
    }
  })()

  const onSubmit = form.handleSubmit((values) =>
    mutation
      .mutateAsync({ action, date: hasField ? values.date : null }, { onSuccess: onClose })
      .catch((error: unknown) => {
        if (isRecordChanged(error)) onChangedElsewhere()
      }),
  )

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate>
      <FieldGroup>
        {mutation.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              {/* This action has no date field: its own words for a date that does not work. */}
              {action.kind === 'moveSchedule' && dbErrorCode(mutation.error) === 'invalid_boundary'
                ? t('periods.moveScheduleRefused')
                : errorMessage(mutation.error)}
            </AlertDescription>
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
            description={
              range
                ? t('periods.range.between', { min: fmt(range.min), max: fmt(range.max) })
                : t(`periods.dialogs.${action.kind}.range`, { today: fmt(today) })
            }
          />
        )}
        {outsideRange && (
          <Alert data-testid="boundary-outside">
            <AlertDescription>
              {t('periods.range.outside', {
                min: fmt(outsideRange.min),
                max: fmt(outsideRange.max),
              })}
            </AlertDescription>
          </Alert>
        )}
        {action.kind === 'reopen' && <ReopenPreview preview={reopenPreview} />}
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
          <Button
            type="submit"
            disabled={
              mutation.isPending ||
              outside ||
              // R-PERIOD-053: a reopen is confirmed only with its list in front of the user.
              (action.kind === 'reopen' && !reopenPreview.isSuccess)
            }
          >
            {mutation.isPending
              ? t('common.saving')
              : action.kind === 'resetExpected'
                ? t('periods.reset')
                : action.kind === 'moveSchedule'
                  ? t('periods.moveBack')
                  : t('common.save')}
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  )
}

/**
 * "Back to the schedule", as preview_move_period_start answers for this period: offered with
 * the start the schedule gives when the move would be accepted, its refusal in words when not,
 * nothing when the period already starts there. Asked when the menu opens.
 */
// R-PERIOD-151: offered only when the database would accept it, with the date it would give.
function MoveScheduleItem({
  period,
  onOpen,
}: {
  period: PeriodSummary
  onOpen: (start: string) => void
}) {
  const { t } = useTranslation()
  const preview = useQuery({
    queryKey: [...budgetKeys.budget(period.budget_id), 'move-schedule', period.id] as const,
    staleTime: 0,
    queryFn: async () =>
      unwrap(await supabase.rpc('preview_move_period_start', { p_period_id: period.id }))[0] ??
      null,
  })
  const answer = preview.data
  if (answer?.refusal === 'already_on_schedule') return null
  const refusal =
    answer && !answer.accepted
      ? answer.refusal === 'invalid_boundary'
        ? t('periods.moveScheduleRefused')
        : t(dbErrorKey({ code: 'P0001', message: answer.refusal }))
      : null
  return (
    <>
      <DropdownMenuItem
        disabled={!answer?.accepted}
        onSelect={() => {
          if (answer?.accepted) onOpen(answer.scheduled_start)
        }}
        data-testid="move-schedule"
      >
        <RotateCcwIcon />
        {answer?.accepted
          ? t('periods.actions.moveScheduleTo', {
              date: formatCalendarDate(answer.scheduled_start),
            })
          : t('periods.actions.moveSchedule')}
      </DropdownMenuItem>
      {(preview.isPending || refusal || preview.isError) && (
        <p className="max-w-72 px-2 pb-1.5 pl-8 text-xs text-muted-foreground">
          {preview.isPending
            ? t('common.loading')
            : preview.isError
              ? t(dbErrorKey(preview.error))
              : refusal}
        </p>
      )}
    </>
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

type ReopenChange = Database['public']['Functions']['preview_reopen']['Returns'][number]

/** R-PERIOD-053: what reopening would move, from preview_reopen, before it is confirmed. */
function useReopenPreview(budgetId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...budgetKeys.budget(budgetId), 'preview-reopen'] as const,
    enabled,
    staleTime: 0,
    queryFn: async (): Promise<ReopenChange[]> =>
      unwrap(await supabase.rpc('preview_reopen', { p_budget_id: budgetId })),
  })
}

const KNOWN_KINDS = ['income', 'category', 'subscription', 'debt'] as const
const KNOWN_CHANGES = [
  'added',
  'ended',
  'removed',
  'terms_changed',
  'made_primary',
  'interest_removed',
] as const
/** A category's changes have their own words (its expectation, "in use" rather than "count"). */
const CATEGORY_CHANGES = ['added', 'ended', 'removed', 'terms_changed'] as const

function ReopenPreview({ preview }: { preview: ReturnType<typeof useReopenPreview> }) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  if (preview.isError) {
    return (
      <Alert variant="destructive" data-testid="reopen-preview-failed">
        <AlertDescription>
          <p>{t('periods.reopen.failed', { reason: errorMessage(preview.error) })}</p>
          <p>{t('periods.reopen.required')}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={preview.isFetching}
            onClick={() => void preview.refetch()}
          >
            {t('states.retry')}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }
  if (preview.data === undefined) return <LoadingState rows={1} />
  if (preview.data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="reopen-preview">
        {t('periods.reopen.nothing')}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="reopen-preview">
      <p className="font-medium">{t('periods.reopen.title')}</p>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        {preview.data.map((item) => {
          // R-PERIOD-193: at most 1000 rows; the last says how many more are not listed.
          if (item.record_kind === 'more') {
            return (
              <li key="more" data-testid="reopen-more">
                {t('periods.reopen.more', { count: Number(item.record_name) || 0 })}
              </li>
            )
          }
          // Later steps add kinds and changes: unknown ones get a generic sentence.
          const kind = (KNOWN_KINDS as readonly string[]).includes(item.record_kind)
            ? t(`periods.reopen.kinds.${item.record_kind as (typeof KNOWN_KINDS)[number]}`, {
                name: item.record_name,
              })
            : t('periods.reopen.kinds.other', { name: item.record_name })
          const change =
            item.record_kind === 'category' &&
            (CATEGORY_CHANGES as readonly string[]).includes(item.change)
              ? t(
                  `periods.reopen.categoryChanges.${item.change as (typeof CATEGORY_CHANGES)[number]}`,
                )
              : (item.record_kind === 'subscription' || item.record_kind === 'debt') &&
                  item.change === 'removed'
                ? // Kept without being in force when it has charges, payments or adjustments.
                  t(`periods.reopen.removedKept.${item.record_kind}`)
                : (KNOWN_CHANGES as readonly string[]).includes(item.change)
                  ? t(`periods.reopen.changes.${item.change as (typeof KNOWN_CHANGES)[number]}`)
                  : t('periods.reopen.changes.other')
          return (
            <li key={`${item.record_kind}-${item.record_id}-${item.change}`}>
              {t('periods.reopen.item', { kind, change })}
              {item.replaces_previous && item.change !== 'removed'
                ? ` ${t('periods.reopen.replaces')}`
                : ''}
            </li>
          )
        })}
      </ul>
      <p className="text-muted-foreground">{t('periods.reopen.datesOnly')}</p>
    </div>
  )
}
