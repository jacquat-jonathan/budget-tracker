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
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { ConfirmDialog } from '@/components/confirm-dialog'
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
import { unwrap, usePeriods, type PeriodSummary } from '@/features/budgets/budget-queries'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'
import { monthLabel, monthOf } from '@/features/budgets/start-months'
import { useAppMutation, useErrorMessage } from '@/hooks/use-app-mutation'
import { addDays, addMonths, formatCalendarDate, isCalendarDate } from '@/lib/date'
import { calendarDateSchema } from '@/lib/form-schemas'
import { currentLanguage } from '@/lib/i18n'
import { formatMoney } from '@/lib/money'
import { supabase } from '@/lib/supabase'

/**
 * Periods: one per calendar month, each starting on that month's salary (R-PERIOD-021).
 * Boundaries are changed as what happened to a salary, never as a raw end date:
 *
 * - "The <month> salary arrived on another day": the boundary before that month's period.
 * - "The <month> salary has not arrived yet" (latest period only): that boundary moves to
 *   after today, so the latest period is removed and the previous one is current again
 *   (R-PERIOD-023).
 * - "The <next month> salary arrived early" (latest period): closes the current period;
 *   the next month's period starts (or, for a date still to come, ends this one earlier).
 * - "Reset to the schedule" on any boundary set by hand: the inverse of each of the above
 *   (R-PERIOD-025).
 *
 * Each dialog previews the resulting dates. The database applies the rules (14 days from
 * the scheduled pay date, no empty period) and its "today" comes with the period rows.
 */

type Action =
  | { kind: 'arrived'; period: PeriodSummary; previous: PeriodSummary; late: boolean }
  | { kind: 'next'; period: PeriodSummary }
  | { kind: 'reset'; boundaryOf: PeriodSummary; next: PeriodSummary | undefined }

interface Move {
  /** The period whose last day changes (the boundary after it). */
  periodId: string
  /** The new last day; null resets the boundary to the schedule. */
  newEnd: string | null
}

function useMoveBoundary(budgetId: string) {
  const { t } = useTranslation()
  return useAppMutation<null, Move>({
    errorDisplay: 'inline',
    mutationFn: async ({ periodId, newEnd }) => {
      unwrap(
        await supabase.rpc('move_period_boundary', {
          p_period_id: periodId,
          ...(newEnd ? { p_new_end: newEnd } : {}),
        }),
      )
      return null
    },
    success: (_data, { newEnd }) => (newEnd ? t('periods.saved') : t('periods.resetDone')),
    // Moving a boundary can remove or add a period and changes the current one.
    invalidate: () => [budgetKeys.budget(budgetId)],
  })
}

export function PeriodsPage() {
  const { t } = useTranslation()
  const language = currentLanguage()
  const { budgetId, budget } = useCurrentBudget()
  const periods = usePeriods(budgetId)
  const [action, setAction] = useState<Action | null>(null)
  const move = useMoveBoundary(budgetId)
  const close = () => setAction(null)
  const open = (next: Action) => {
    move.reset()
    setAction(next)
  }
  const month = (period: PeriodSummary) => monthLabel(period.month, language)

  const header = <PageHeader title={t('nav.periods')} description={t('periods.description')} />

  if (periods.isError) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ErrorState error={periods.error} onRetry={() => void periods.refetch()} />
      </div>
    )
  }
  if (periods.isPending) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <LoadingState rows={4} />
      </div>
    )
  }

  const list = periods.data
  const hasCurrent = list.some((period) => period.is_current)

  return (
    <div className="flex flex-col gap-6">
      {header}
      {!hasCurrent && list.length > 0 && (
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
            // Newest first: the previous period is the next row, the following one the row before.
            const previous = list[index + 1]
            const following = list[index - 1]
            const latest = index === 0
            const isFinal = budget.end_month !== null && period.month === budget.end_month
            return (
              <li
                key={period.id}
                data-testid="period-row"
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium capitalize">{month(period)}</h2>
                    {period.is_current && <Badge>{t('periods.current')}</Badge>}
                    {previous?.end_is_manual && (
                      <Badge variant="outline">{t('periods.manualStart')}</Badge>
                    )}
                    {period.end_is_manual && (
                      <Badge variant="outline">{t('periods.manualEnd')}</Badge>
                    )}
                    {isFinal && <Badge variant="secondary">{t('periods.budgetEnd')}</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    <CalendarDate value={period.start_date} /> –{' '}
                    <CalendarDate value={period.end_date} />
                    {period.is_current &&
                      !period.end_is_manual &&
                      ` · ${t('periods.projectedEnd')}`}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <div className="sm:text-right">
                    <p className="text-xs text-muted-foreground">{t('periods.incomeTotal')}</p>
                    <p className="font-medium tabular-nums">
                      {formatMoney(period.income_total ?? 0)}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label={t('periods.actionsFor', { month: month(period) })}
                      >
                        <EllipsisVerticalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-w-80 min-w-64">
                      {previous && (
                        <DropdownMenuItem
                          onSelect={() => open({ kind: 'arrived', period, previous, late: false })}
                        >
                          <CalendarClockIcon />
                          {t('periods.actions.arrived', { month: monthOf(period.month, language) })}
                        </DropdownMenuItem>
                      )}
                      {latest && previous && period.is_current && (
                        <DropdownMenuItem
                          onSelect={() => open({ kind: 'arrived', period, previous, late: true })}
                        >
                          <HourglassIcon />
                          {t('periods.actions.notYet', { month: monthOf(period.month, language) })}
                        </DropdownMenuItem>
                      )}
                      {latest && (
                        <DropdownMenuItem onSelect={() => open({ kind: 'next', period })}>
                          <SkipForwardIcon />
                          {t('periods.actions.nextEarly', {
                            month: monthOf(addMonths(period.month, 1), language),
                          })}
                        </DropdownMenuItem>
                      )}
                      {(period.end_is_manual || previous?.end_is_manual) && (
                        <DropdownMenuSeparator />
                      )}
                      {previous?.end_is_manual && (
                        <DropdownMenuItem
                          onSelect={() =>
                            open({ kind: 'reset', boundaryOf: previous, next: period })
                          }
                        >
                          <RotateCcwIcon />
                          {t('periods.actions.resetStart')}
                        </DropdownMenuItem>
                      )}
                      {period.end_is_manual && (
                        <DropdownMenuItem
                          onSelect={() =>
                            open({ kind: 'reset', boundaryOf: period, next: following })
                          }
                        >
                          <RotateCcwIcon />
                          {t('periods.actions.resetEnd')}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <SalaryDateDialog
        action={action?.kind === 'arrived' || action?.kind === 'next' ? action : null}
        mutation={move}
        onClose={close}
      />
      <ConfirmDialog
        open={action?.kind === 'reset'}
        onOpenChange={(isOpen) => {
          if (!isOpen) close()
        }}
        title={t('periods.resetTitle')}
        description={
          action?.kind === 'reset' ? (
            <>
              <p>
                {action.next
                  ? t('periods.resetDescription', {
                      month: monthOf(action.next.month, language),
                      date: formatCalendarDate(action.next.anchor_date),
                    })
                  : t('periods.resetDescriptionLatest')}
              </p>
              <p>{t('periods.resetComesBack')}</p>
            </>
          ) : null
        }
        confirmLabel={t('periods.reset')}
        pending={move.isPending}
        error={move.error}
        onConfirm={() => {
          if (action?.kind !== 'reset') return
          move.mutate({ periodId: action.boundaryOf.id, newEnd: null }, { onSuccess: close })
        }}
      />
    </div>
  )
}

const salaryDateSchema = z.object({ date: calendarDateSchema })
type SalaryDateValues = z.infer<typeof salaryDateSchema>
type SalaryAction = Extract<Action, { kind: 'arrived' | 'next' }>

function SalaryDateDialog({
  action,
  mutation,
  onClose,
}: {
  action: SalaryAction | null
  mutation: ReturnType<typeof useMoveBoundary>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const language = currentLanguage()
  let title = ''
  if (action?.kind === 'arrived') {
    title = action.late
      ? t('periods.actions.notYet', { month: monthOf(action.period.month, language) })
      : t('periods.actions.arrived', { month: monthOf(action.period.month, language) })
  } else if (action) {
    title = t('periods.actions.nextEarly', {
      month: monthOf(addMonths(action.period.month, 1), language),
    })
  }

  return (
    <Dialog
      open={action !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t('periods.dialogDescription')}</DialogDescription>
        </DialogHeader>
        {action && <SalaryDateForm action={action} mutation={mutation} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function SalaryDateForm({
  action,
  mutation,
  onClose,
}: {
  action: SalaryAction
  mutation: ReturnType<typeof useMoveBoundary>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const language = currentLanguage()
  const errorMessage = useErrorMessage()
  const { period } = action
  const today = period.today ?? period.end_date
  const of = (value: string) => monthOf(value, language)

  const defaultDate =
    action.kind === 'next'
      ? addDays(period.end_date, 1)
      : action.late
        ? addDays(today, 1)
        : period.start_date
  const form = useForm<SalaryDateValues>({
    resolver: zodResolver(salaryDateSchema),
    defaultValues: { date: defaultDate },
  })
  const date = useWatch({ control: form.control, name: 'date' })

  /** What the periods will look like once saved, worded from the user's point of view. */
  const preview = (() => {
    if (!isCalendarDate(date)) return null
    const end = formatCalendarDate(addDays(date, -1))
    const start = formatCalendarDate(date)
    if (action.kind === 'next') {
      const next = of(addMonths(period.month, 1))
      return date <= today
        ? t('periods.preview.closes', { end, next, start })
        : t('periods.preview.endsEarlier', { end, next, start })
    }
    const thisMonth = of(period.month)
    const previousMonth = of(action.previous.month)
    return action.period.is_current && date > today
      ? t('periods.preview.notYet', { month: thisMonth, previous: previousMonth, end })
      : t('periods.preview.moved', { previous: previousMonth, end, month: thisMonth, start })
  })()

  const onSubmit = form.handleSubmit((values) =>
    mutation
      .mutateAsync(
        {
          periodId: action.kind === 'next' ? period.id : action.previous.id,
          newEnd: addDays(values.date, -1),
        },
        { onSuccess: onClose },
      )
      .catch(() => undefined),
  )

  const fieldLabel =
    action.kind === 'next'
      ? t('periods.fields.arrivedOn', { month: of(addMonths(period.month, 1)) })
      : action.late
        ? t('periods.fields.expectedOn', { month: of(period.month) })
        : t('periods.fields.arrivedOn', { month: of(period.month) })

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate>
      <FieldGroup>
        {mutation.isError && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(mutation.error)}</AlertDescription>
          </Alert>
        )}
        {action.kind === 'arrived' && (
          <p className="text-sm">
            {t('periods.scheduledOn', {
              month: of(period.month),
              date: formatCalendarDate(period.anchor_date),
            })}
          </p>
        )}
        <CalendarDateField
          control={form.control}
          name="date"
          label={fieldLabel}
          autoFocus
          description={t('periods.fourteenDays')}
        />
        {preview && (
          <Alert data-testid="boundary-preview">
            <CalendarRangeIcon aria-hidden />
            <AlertDescription>{preview}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  )
}
