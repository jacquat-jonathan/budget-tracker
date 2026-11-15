import { zodResolver } from '@hookform/resolvers/zod'
import {
  CalendarOffIcon,
  CalendarRangeIcon,
  EllipsisVerticalIcon,
  MoveHorizontalIcon,
  RotateCcwIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { CalendarDate, CalendarDateField } from '@/components/form/calendar-date-field'
import { ConfirmDialog } from '@/components/confirm-dialog'
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FieldGroup } from '@/components/ui/field'
import { budgetKeys } from '@/features/budgets/budget-keys'
import { usePeriods, type PeriodSummary } from '@/features/budgets/budget-queries'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'
import { movePeriodBoundary } from '@/features/budgets/period-rpcs'
import { useAppMutation, useErrorMessage } from '@/hooks/use-app-mutation'
import { addDays, formatCalendarDate } from '@/lib/date'
import { calendarDateSchema } from '@/lib/form-schemas'
import { formatMoney } from '@/lib/money'

/** move_period_boundary: a new last day for the period, or null to re-project the current one. */
function useMoveBoundary(budgetId: string) {
  const { t } = useTranslation()
  return useAppMutation<null, { period: PeriodSummary; newEnd: string | null }>({
    errorDisplay: 'inline',
    mutationFn: async ({ period, newEnd }) => {
      await movePeriodBoundary(period.id, newEnd)
      return null
    },
    success: (_data, { newEnd }) =>
      newEnd ? t('periods.moved', { date: formatCalendarDate(newEnd) }) : t('periods.resetDone'),
    invalidate: () => [budgetKeys.budget(budgetId)],
  })
}

type DialogState =
  | { kind: 'closed' }
  | { kind: 'move'; period: PeriodSummary }
  | { kind: 'reset'; period: PeriodSummary }

export function PeriodsPage() {
  const { t } = useTranslation()
  const { budgetId, budget } = useCurrentBudget()
  const periods = usePeriods(budgetId)
  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' })
  const move = useMoveBoundary(budgetId)
  const close = () => setDialog({ kind: 'closed' })

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
  const lastSeq = list[0]?.seq

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
          {list.map((period) => {
            const isBudgetEnd = budget.end_date !== null && period.end_date === budget.end_date
            const isLast = period.seq === lastSeq
            return (
              <li
                key={period.id}
                data-testid="period-row"
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium">
                      <CalendarDate value={period.start_date} /> –{' '}
                      <CalendarDate value={period.end_date} />
                    </h2>
                    {period.is_current && <Badge>{t('periods.current')}</Badge>}
                    {period.end_is_manual && (
                      <Badge variant="outline">{t('periods.manualEnd')}</Badge>
                    )}
                    {isBudgetEnd && <Badge variant="secondary">{t('periods.budgetEnd')}</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('periods.number', { seq: period.seq })}
                    {period.is_current && ` · ${t('periods.projectedEnd')}`}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <div className="text-right">
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
                        aria-label={t('periods.actionsFor', {
                          start: formatCalendarDate(period.start_date),
                        })}
                      >
                        <EllipsisVerticalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-w-72 min-w-56">
                      <DropdownMenuItem
                        disabled={isBudgetEnd}
                        onSelect={() => {
                          move.reset()
                          setDialog({ kind: 'move', period })
                        }}
                      >
                        <MoveHorizontalIcon />
                        {period.is_current ? t('periods.changeEnd') : t('periods.moveEnd')}
                      </DropdownMenuItem>
                      {isLast && period.is_current && period.end_is_manual && (
                        <DropdownMenuItem
                          onSelect={() => {
                            move.reset()
                            setDialog({ kind: 'reset', period })
                          }}
                        >
                          <RotateCcwIcon />
                          {t('periods.reset')}
                        </DropdownMenuItem>
                      )}
                      {isBudgetEnd && (
                        <p className="px-2 py-1.5 text-xs text-muted-foreground">
                          {t('periods.budgetEndHelp')}
                        </p>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <MoveBoundaryDialog
        period={dialog.kind === 'move' ? dialog.period : null}
        mutation={move}
        onClose={close}
      />
      <ConfirmDialog
        open={dialog.kind === 'reset'}
        onOpenChange={(open) => {
          if (!open) close()
        }}
        title={t('periods.resetTitle')}
        description={<p>{t('periods.resetDescription')}</p>}
        confirmLabel={t('periods.reset')}
        pending={move.isPending}
        error={move.error}
        onConfirm={() => {
          if (dialog.kind !== 'reset') return
          move.mutate({ period: dialog.period, newEnd: null }, { onSuccess: close })
        }}
      />
    </div>
  )
}

const moveSchema = z.object({ newEnd: calendarDateSchema })
type MoveValues = z.infer<typeof moveSchema>

function MoveBoundaryDialog({
  period,
  mutation,
  onClose,
}: {
  period: PeriodSummary | null
  mutation: ReturnType<typeof useMoveBoundary>
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={period !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {period?.is_current ? t('periods.changeEndTitle') : t('periods.moveEndTitle')}
          </DialogTitle>
          <DialogDescription>
            {period?.is_current
              ? t('periods.changeEndDescription')
              : t('periods.moveEndDescription')}
          </DialogDescription>
        </DialogHeader>
        {period && <MoveBoundaryForm period={period} mutation={mutation} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function MoveBoundaryForm({
  period,
  mutation,
  onClose,
}: {
  period: PeriodSummary
  mutation: ReturnType<typeof useMoveBoundary>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const form = useForm<MoveValues>({
    resolver: zodResolver(moveSchema),
    defaultValues: { newEnd: period.end_date },
  })

  const onSubmit = form.handleSubmit((values) =>
    mutation
      .mutateAsync({ period, newEnd: values.newEnd }, { onSuccess: onClose })
      .catch(() => undefined),
  )
  const newEnd = useWatch({ control: form.control, name: 'newEnd' })
  const nextStart = /^\d{4}-\d{2}-\d{2}$/.test(newEnd) ? safeAddDay(newEnd) : null

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate>
      <FieldGroup>
        {mutation.isError && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(mutation.error)}</AlertDescription>
          </Alert>
        )}
        <p className="text-sm">
          {t('periods.startsOn')} <CalendarDate value={period.start_date} />
        </p>
        <CalendarDateField
          control={form.control}
          name="newEnd"
          label={t('periods.fields.lastDay')}
          autoFocus
          description={
            nextStart
              ? t('periods.nextStartsOn', { date: formatCalendarDate(nextStart) })
              : undefined
          }
        />
        {period.is_current && (
          <p className="text-sm text-muted-foreground">{t('periods.closeEarlyHelp')}</p>
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

function safeAddDay(date: string): string | null {
  try {
    return addDays(date, 1)
  } catch {
    return null
  }
}
