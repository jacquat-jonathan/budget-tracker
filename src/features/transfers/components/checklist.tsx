import {
  BanIcon,
  ChevronDownIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  ClockAlertIcon,
  HourglassIcon,
  SkipForwardIcon,
  TriangleAlertIcon,
  Undo2Icon,
  XIcon,
  ZapIcon,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState, LoadingState } from '@/components/states'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { PeriodSummary } from '@/features/budgets/budget-queries'
import { pickPeriod, useOlderPeriodsOption } from '@/features/budgets/older-periods'
import { OlderPeriodsItem } from '@/features/budgets/older-periods-item'
import { usePeriodParam } from '@/features/budgets/use-period-param'
import { MarkDoneDialog } from '@/features/transfers/components/mark-done-dialog'
import { targetOf, useMarks } from '@/features/transfers/transfer-mutations'
import { actionsFor } from '@/features/transfers/transfer-terms'
import { useChecklist, type ChecklistRow } from '@/features/transfers/transfer-queries'
import { FromTo } from '@/features/transfers/components/transfer-bits'
import { formatCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

interface StatusView {
  icon: LucideIcon
  label: string
  tone: 'todo' | 'late' | 'done' | 'neutral' | 'warn'
}

function useStatus() {
  const { t } = useTranslation()
  const status = (row: ChecklistRow): StatusView => {
    const by = row.recorded_by_name
    // R-ACCOUNT-004: an automatic occurrence with no transaction counts as done from its due date.
    const doneOn = row.done_on ?? (row.assumed ? row.due_date : null)
    const done = doneOn ? formatCalendarDate(doneOn) : ''
    if (row.planned === false) {
      // What the tick was stays said, so the member knows what Undo removes.
      const was = row.status ? status({ ...row, planned: true, held_back: false }).label : ''
      return {
        icon: BanIcon,
        label: was
          ? t('transfers.checklist.status.unplannedWas', { state: was })
          : t('transfers.checklist.status.unplanned'),
        tone: 'warn',
      }
    }
    if (row.held_back) {
      return { icon: HourglassIcon, label: t('transfers.checklist.status.heldBack'), tone: 'warn' }
    }
    switch (row.status) {
      case 'to_do':
        return row.is_overdue
          ? { icon: ClockAlertIcon, label: t('transfers.checklist.status.overdue'), tone: 'late' }
          : { icon: CircleDashedIcon, label: t('transfers.checklist.status.toDo'), tone: 'todo' }
      case 'upcoming':
        return { icon: ZapIcon, label: t('transfers.checklist.status.upcoming'), tone: 'neutral' }
      case 'done':
        return {
          icon: CircleCheckIcon,
          label: row.assumed
            ? t('transfers.checklist.status.assumed', { date: done })
            : by
              ? t('transfers.checklist.status.doneBy', { date: done, name: by })
              : t('transfers.checklist.status.done', { date: done }),
          tone: 'done',
        }
      case 'skipped':
        return {
          icon: SkipForwardIcon,
          label: by
            ? t('transfers.checklist.status.skippedBy', { name: by })
            : t('transfers.checklist.status.skipped'),
          tone: 'neutral',
        }
      case 'not_done':
        return {
          icon: XIcon,
          label: by
            ? t('transfers.checklist.status.notDoneBy', { name: by })
            : t('transfers.checklist.status.notDone'),
          tone: 'neutral',
        }
      default:
        return { icon: CircleDashedIcon, label: row.status ?? '', tone: 'neutral' }
    }
  }
  return status
}

const TONES: Record<StatusView['tone'], string> = {
  todo: 'text-foreground',
  late: 'text-destructive',
  done: 'text-positive',
  neutral: 'text-muted-foreground',
  warn: 'text-amber-800 dark:text-amber-200',
}

/**
 * A period's checklist of transfers (R-ACCOUNT-005): every occurrence with its due date,
 * amount, accounts and state in words and an icon, who recorded it, and the marks that lead on
 * from there. Any period can be looked at and corrected; the period is in the address.
 */
export function Checklist({
  budgetId,
  periods,
  current,
}: {
  budgetId: string
  periods: PeriodSummary[]
  current: PeriodSummary | null
}) {
  const { t } = useTranslation()
  const { period, setPeriod, unknown } = usePeriodParam(budgetId, periods, current)
  const olderPeriods = useOlderPeriodsOption(budgetId)
  const checklist = useChecklist(budgetId, period?.id ?? null)
  // R-ACCOUNT-241: the dashboard counts the period before too; its open rows are pointed to.
  const before = period?.is_current
    ? periods.find((item) => item.seq === period.seq - 1)
    : undefined
  const previous = useChecklist(budgetId, before?.id ?? null)
  const previousOpen = before
    ? (previous.data ?? []).filter(
        (row) => row.status === 'to_do' && row.planned !== false && row.is_automatic !== true,
      ).length
    : 0
  const marks = useMarks(budgetId, { errorDisplay: 'inline' })
  const [doneRow, setDoneRow] = useState<ChecklistRow | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // After a mark, the focus stays on the row it acted on (its first action, else the row).
  const focusKey = useRef<string | null>(null)
  const rows = checklist.data ?? []
  const keys = rows.map((row) => `${row.transfer_id}-${row.occurrence_date}-${row.mark_revision}`)
  const joined = keys.join(',')
  useEffect(() => {
    const key = focusKey.current
    if (key === null) return
    const frame = window.requestAnimationFrame(() => {
      const item = listRef.current?.querySelector<HTMLElement>(`[data-key="${key}"]`)
      if (!item) return
      focusKey.current = null
      ;(item.querySelector<HTMLElement>('button') ?? item).focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [joined])
  // Rows marked here stay where they were until the period changes, so the focus stays on
  // them and Undo is at hand; the other settled rows are folded away.
  const [kept, setKept] = useState<{ period: string; keys: ReadonlySet<string> }>({
    period: '',
    keys: new Set(),
  })
  const keep = (row: ChecklistRow) => {
    const key = `${row.transfer_id}-${row.occurrence_date}`
    focusKey.current = key
    setKept((before) => ({
      period: period?.id ?? '',
      keys: new Set([...(before.period === period?.id ? before.keys : []), key]),
    }))
  }
  const keptKeys = kept.period === period?.id ? kept.keys : new Set<string>()
  const open: ChecklistRow[] = []
  const settled: ChecklistRow[] = []
  for (const row of rows) {
    const key = `${row.transfer_id}-${row.occurrence_date}`
    if (row.status !== 'more' && isSettled(row) && !keptKeys.has(key)) settled.push(row)
    else open.push(row)
  }

  const act = (row: ChecklistRow, kind: 'skip' | 'notDone' | 'undo') => {
    keep(row)
    marks[kind].mutate(targetOf(row))
  }
  const item = (row: ChecklistRow, index: number) =>
    row.status === 'more' ? (
      <li key="more" className="p-3 text-sm text-muted-foreground">
        {t('transfers.checklist.more', { count: Number(row.name) || 0 })}
      </li>
    ) : (
      <ChecklistItem
        key={`${row.transfer_id}-${row.occurrence_date}-${index}`}
        row={row}
        busy={busy}
        onDone={() => {
          keep(row)
          setDoneRow(row)
        }}
        onAct={(kind) => act(row, kind)}
      />
    )
  const label = (item: PeriodSummary) =>
    item.is_current
      ? t('transfers.checklist.currentPeriod', {
          start: formatCalendarDate(item.start_date),
          end: formatCalendarDate(item.end_date),
        })
      : t('income.fields.fromPeriod', {
          start: formatCalendarDate(item.start_date),
          end: formatCalendarDate(item.end_date),
        })
  const busy =
    marks.done.isPending || marks.skip.isPending || marks.notDone.isPending || marks.undo.isPending

  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby="checklist-title"
      data-testid="checklist"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="checklist-title" className="text-lg font-semibold" tabIndex={-1}>
            {t('transfers.checklist.title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('transfers.checklist.help')}</p>
        </div>
        {period && (
          <div className="flex flex-col gap-1 sm:w-72">
            <label htmlFor="checklist-period" className="text-sm font-medium">
              {t('transfers.checklist.period')}
            </label>
            <Select value={period.id} onValueChange={pickPeriod(olderPeriods, setPeriod)}>
              <SelectTrigger id="checklist-period" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {!periods.some((item) => item.id === period.id) && (
                  <SelectItem value={period.id}>{label(period)}</SelectItem>
                )}
                {periods.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {label(item)}
                  </SelectItem>
                ))}
                <OlderPeriodsItem option={olderPeriods} />
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      {unknown && (
        <Alert data-testid="checklist-unknown-period">
          <AlertDescription>{t('transfers.checklist.unknownPeriod')}</AlertDescription>
        </Alert>
      )}
      {before && previousOpen > 0 && (
        <Alert data-testid="checklist-previous-open">
          <ClockAlertIcon aria-hidden />
          <AlertDescription className="flex flex-col items-start gap-2">
            <span>
              {t('transfers.checklist.previousOpen', {
                count: previousOpen,
                start: formatCalendarDate(before.start_date),
                end: formatCalendarDate(before.end_date),
              })}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPeriod(before.id)
                document.getElementById('checklist-title')?.focus()
              }}
            >
              {t('transfers.checklist.previousOpenLink')}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {checklist.isError ? (
        <ErrorState error={checklist.error} onRetry={checklist.refetch} className="" />
      ) : !checklist.data || period === undefined ? (
        <LoadingState rows={2} />
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          {t('transfers.checklist.empty')}
        </p>
      ) : (
        <div ref={listRef} className="flex flex-col gap-3">
          {open.length > 0 ? (
            <ul
              className="flex flex-col divide-y rounded-xl border"
              aria-labelledby="checklist-title"
              data-testid="checklist-open"
            >
              {open.map(item)}
            </ul>
          ) : (
            <p
              className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground"
              data-testid="checklist-all-settled"
            >
              {t('transfers.checklist.allSettled')}
            </p>
          )}
          {settled.length > 0 && (
            <SettledRows key={period?.id ?? ''} rows={settled} render={item} />
          )}
        </div>
      )}
      <MarkDoneDialog
        budgetId={budgetId}
        row={doneRow}
        period={period ?? null}
        mutation={marks.done}
        onClose={() => {
          setDoneRow(null)
          marks.done.reset()
          // Back on the row (cancelled); after a save the row is focused again once re-read.
          const key = focusKey.current
          window.requestAnimationFrame(() => {
            const item = listRef.current?.querySelector<HTMLElement>(`[data-key="${key}"]`)
            ;(item?.querySelector<HTMLElement>('button') ?? item)?.focus()
          })
        }}
      />
    </section>
  )
}

function ChecklistItem({
  row,
  busy,
  onDone,
  onAct,
}: {
  row: ChecklistRow
  busy: boolean
  onDone: () => void
  onAct: (kind: 'skip' | 'notDone' | 'undo') => void
}) {
  const { t } = useTranslation()
  const status = useStatus()(row)
  const actions = actionsFor(row)
  const name = row.name ?? ''
  const Icon = status.icon
  const moved =
    row.amount_moved !== null && row.amount_moved !== row.amount && row.status === 'done'
  return (
    <li
      className="flex flex-col gap-2 p-3 outline-none sm:flex-row sm:items-center sm:gap-4"
      data-testid="checklist-row"
      data-key={`${row.transfer_id}-${row.occurrence_date}`}
      tabIndex={-1}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-baseline justify-between gap-3">
          <span className="truncate font-medium">{name}</span>
          <span className="shrink-0 font-medium tabular-nums">
            {formatMoney(moved ? (row.amount_moved ?? 0) : (row.amount ?? 0))}
          </span>
        </div>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {/* Each part carries the separator before it, so a "·" never ends a line. */}
          {[
            <FromTo
              key="accounts"
              from={row.from_account_name ?? ''}
              to={row.to_account_name ?? ''}
            />,
            <span key="due">
              {row.due_date
                ? t('transfers.checklist.due', { date: formatCalendarDate(row.due_date) })
                : t('transfers.checklist.noDue')}
            </span>,
            moved && (
              <span key="planned">
                {t('transfers.checklist.planned', { amount: formatMoney(row.amount ?? 0) })}
              </span>
            ),
            row.category_name && (
              <span key="category">{t('transfers.countsIn', { category: row.category_name })}</span>
            ),
          ]
            .filter(Boolean)
            .map((part, index) => (
              <span key={index} className="inline-flex min-w-0 items-center gap-x-2">
                {index > 0 && <span aria-hidden>·</span>}
                {part}
              </span>
            ))}
        </span>
        <span
          className={cn('flex items-center gap-1.5 text-sm', TONES[status.tone])}
          data-testid="checklist-status"
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          <span>{status.label}</span>
          {row.is_ended && row.planned !== false && (
            <span className="text-muted-foreground">· {t('transfers.checklist.ended')}</span>
          )}
        </span>
        {row.planned === false && (
          <span className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              {row.is_ended
                ? t('transfers.checklist.unplannedEnded')
                : t('transfers.checklist.unplannedHelp')}
              {row.transaction_id && (
                <>
                  {' '}
                  {row.category_name
                    ? t('transfers.checklist.unplannedTransactionIn', {
                        category: row.category_name,
                      })
                    : t('transfers.checklist.unplannedTransaction')}
                </>
              )}
            </span>
          </span>
        )}
        {row.held_back && (
          <span className="text-xs text-muted-foreground">
            {t('transfers.checklist.heldBackHelp')}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {actions.done && (
          <Button
            size="sm"
            onClick={onDone}
            disabled={busy}
            aria-label={t('transfers.checklist.doneFor', { name })}
          >
            <CircleCheckIcon />
            {t('transfers.checklist.done')}
          </Button>
        )}
        {actions.skip && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAct('skip')}
            disabled={busy}
            aria-label={t('transfers.checklist.skipFor', { name })}
          >
            <SkipForwardIcon />
            {t('transfers.checklist.skip')}
          </Button>
        )}
        {actions.notDone && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAct('notDone')}
            disabled={busy}
            aria-label={t('transfers.checklist.notDoneFor', { name })}
          >
            <XIcon />
            {t('transfers.checklist.notDone')}
          </Button>
        )}
        {actions.undo && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onAct('undo')}
            disabled={busy}
            aria-label={t('transfers.checklist.undoFor', { name })}
          >
            <Undo2Icon />
            {t('transfers.checklist.undo')}
          </Button>
        )}
      </div>
    </li>
  )
}

/** Done, skipped, did not happen, or a tick no longer planned: nothing is left to do there. */
function isSettled(row: ChecklistRow) {
  if (row.planned === false) return true
  if (row.held_back) return false
  return row.status === 'done' || row.status === 'skipped' || row.status === 'not_done'
}

/** The settled rows of a period, folded away by default with their count. */
function SettledRows({
  rows,
  render,
}: {
  rows: ChecklistRow[]
  render: (row: ChecklistRow, index: number) => ReactNode
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section className="flex flex-col gap-2" aria-label={t('transfers.checklist.settledLabel')}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="self-start px-2"
            data-testid="checklist-settled-toggle"
          >
            <ChevronDownIcon
              className={open ? 'rotate-180 transition-transform' : 'transition-transform'}
              aria-hidden
            />
            {t('transfers.checklist.settled', { count: rows.length })}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="flex flex-col divide-y rounded-xl border" data-testid="checklist-settled">
            {rows.map(render)}
          </ul>
        </CollapsibleContent>
      </section>
    </Collapsible>
  )
}
