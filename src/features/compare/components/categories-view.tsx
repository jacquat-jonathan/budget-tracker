import { ChevronRightIcon, LayersIcon, TriangleAlertIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { paths } from '@/app/paths'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  lengthsToMention,
  MAX_LINES,
  periodLabels,
  readOpen,
  readSlots,
  toggleOpen,
  toggleSlot,
} from '@/features/compare/compare-format'
import {
  useCategoryRange,
  type CategoryLine,
  type Count,
  type TrendPeriod,
} from '@/features/compare/compare-queries'
import { CategoryChart } from '@/features/compare/components/category-chart'
import { formatCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

/** Changes one address parameter from its value at that moment (quick clicks all count). */
export type UpdateParam = (key: string, next: (value: string | null) => string | null) => void

/**
 * Spending per category across the range (get_category_trend, checked against the trend's
 * periods): a table of every line by period, groups first and opened on their subcategories
 * (the open ones kept in the address), each cell leading to that category's transactions in
 * that period; and a chart of the lines the user picks. Not in force with nothing recorded is
 * "—", never 0; spending above the plan is marked with a sign and words. Every figure is the
 * database's.
 */
// R-COMPARE-192: the lines as the database gives them, picked lines in the address.
export function CategoriesView({
  budgetId,
  count,
  picked,
  opened,
  showPlanned,
  update,
}: {
  budgetId: string
  count: Count
  picked: string | null
  opened: string | null
  showPlanned: boolean
  update: UpdateParam
}) {
  const { t } = useTranslation()
  const range = useCategoryRange(budgetId, count)
  if (range.isError) return <ErrorState error={range.error} onRetry={range.refetch} />
  if (!range.data) return <LoadingState rows={5} />
  const { periods, lines } = range.data
  if (lines.length === 0) {
    return (
      <EmptyState
        icon={LayersIcon}
        title={t('compare.categories.empty')}
        description={t('compare.categories.emptyHelp')}
      />
    )
  }
  const slots = readSlots(picked, lines)
  const byId = new Map(lines.map((line) => [line.category_id, line]))
  const chosen = slots.map((id) => (id ? (byId.get(id) ?? null) : null))
  const full = slots.filter((id) => id !== null).length >= MAX_LINES
  const open = readOpen(opened)
  const top = lines.filter((line) => line.parent_id === null)
  const rows: { line: CategoryLine; depth: number }[] = []
  for (const line of top) {
    rows.push({ line, depth: 0 })
    if (line.is_group && open.has(line.category_id)) {
      for (const child of lines.filter((item) => item.parent_id === line.category_id)) {
        rows.push({ line: child, depth: 1 })
      }
    }
  }
  const lengths = lengthsToMention(periods)
  const labels = periodLabels(periods)

  return (
    <div className="flex min-w-0 flex-col gap-6" data-testid="categories-view">
      {lengths && (
        <p className="text-sm text-muted-foreground" data-testid="lengths-differ">
          {t('compare.lengthsDiffer', lengths)}
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('compare.categories.chartTitle')}</h2>
          </CardTitle>
          <CardDescription>{t('compare.categories.chartHelp', { max: MAX_LINES })}</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          {chosen.some((line) => line !== null) ? (
            <CategoryChart periods={periods} slots={chosen} />
          ) : (
            <p className="text-sm text-muted-foreground">{t('compare.categories.chartNone')}</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-col gap-3">
          <CardTitle>
            <h2>{t('compare.categories.title')}</h2>
          </CardTitle>
          <CardDescription>{t('compare.categories.help')}</CardDescription>
          <div className="flex items-center gap-2">
            <Checkbox
              id="show-planned"
              checked={showPlanned}
              onCheckedChange={(next) => update('planned', () => (next === true ? '1' : null))}
            />
            <Label htmlFor="show-planned">{t('compare.categories.showPlanned')}</Label>
          </div>
        </CardHeader>
        <CardContent className="min-w-0 max-sm:px-3">
          {/* A focused cell is brought wholly into view, clear of the sticky column and header
              (the scroll padding): the browser alone leaves a half-visible cell where it is. */}
          <div
            className="relative max-h-[70svh] scroll-pt-16 scroll-pl-28 overflow-auto rounded-md border sm:scroll-pl-56"
            onFocus={(event) => {
              const cell = (event.target as HTMLElement).closest('td')
              if (cell && typeof cell.scrollIntoView === 'function') {
                cell.scrollIntoView({ block: 'nearest', inline: 'nearest' })
              }
            }}
            data-testid="categories-scroll"
          >
            <table
              className="w-max min-w-full border-collapse text-sm"
              aria-label={t('compare.categories.tableLabel')}
              data-testid="categories-table"
            >
              <thead className="sticky top-0 z-20 bg-card">
                <tr className="border-b">
                  <th
                    scope="col"
                    className="sticky left-0 z-30 w-28 max-w-28 min-w-28 bg-card px-2 py-2 text-left align-bottom font-medium sm:w-auto sm:max-w-72 sm:min-w-56 sm:px-3"
                  >
                    {t('compare.categories.category')}
                  </th>
                  {periods.map((period, index) => (
                    <th
                      key={period.period_id}
                      scope="col"
                      className="px-2 py-2 text-right align-bottom font-medium whitespace-nowrap sm:px-3"
                      data-testid="period-header"
                    >
                      {labels[index]?.year && (
                        <span className="block text-xs text-muted-foreground">
                          {labels[index].year}
                        </span>
                      )}
                      <span className="tabular-nums">{labels[index]?.dayMonth}</span>
                      {period.is_current && (
                        <Badge variant="secondary" className="ml-auto block w-fit">
                          {t('compare.running')}
                        </Badge>
                      )}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {t('compare.days', { count: period.days })}
                      </span>
                      <span className="sr-only">
                        {t('compare.period', {
                          start: formatCalendarDate(period.start_date),
                          end: formatCalendarDate(period.end_date),
                        })}
                      </span>
                    </th>
                  ))}
                  <th
                    scope="col"
                    className="px-2 py-2 text-right align-bottom font-medium whitespace-nowrap sm:px-3"
                  >
                    {t('compare.categories.average')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ line, depth }) => (
                  <LineRow
                    key={line.category_id}
                    line={line}
                    depth={depth}
                    periods={periods}
                    showPlanned={showPlanned}
                    open={open.has(line.category_id)}
                    onToggleOpen={() =>
                      update('open', (value) => toggleOpen(value, line.category_id))
                    }
                    picked={slots.includes(line.category_id)}
                    pickDisabled={full && !slots.includes(line.category_id)}
                    onPick={() =>
                      update(
                        'lines',
                        (value) => toggleSlot(value, lines, line.category_id) ?? value,
                      )
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
          {full && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t('compare.categories.pickFull', { max: MAX_LINES })}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function LineRow({
  line,
  depth,
  periods,
  showPlanned,
  open,
  onToggleOpen,
  picked,
  pickDisabled,
  onPick,
}: {
  line: CategoryLine
  depth: number
  periods: TrendPeriod[]
  showPlanned: boolean
  open: boolean
  onToggleOpen: () => void
  picked: boolean
  pickDisabled: boolean
  onPick: () => void
}) {
  const { t } = useTranslation()
  const pickId = `pick-${line.category_id}`
  return (
    <tr
      className="border-b last:border-b-0 hover:bg-muted/40"
      data-testid="category-line"
      data-depth={depth}
    >
      <th
        scope="row"
        className={cn(
          'sticky left-0 z-10 w-28 max-w-28 min-w-28 bg-card px-2 py-2 text-left align-top font-normal sm:w-auto sm:max-w-72 sm:min-w-56 sm:px-3',
          depth > 0 && 'pl-4 sm:pl-8',
        )}
      >
        <div className="flex min-w-0 items-start gap-1">
          {line.is_group && (
            <button
              type="button"
              onClick={onToggleOpen}
              aria-expanded={open}
              aria-label={
                open
                  ? t('compare.categories.close', { name: line.name })
                  : t('compare.categories.open', { name: line.name })
              }
              className="-ml-1 shrink-0 rounded p-0.5 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <ChevronRightIcon
                className={cn('size-4 transition-transform', open && 'rotate-90')}
                aria-hidden
              />
            </button>
          )}
          {/* Two lines at most on a phone, one on wider screens; the full name in the title. */}
          <span
            className={cn(
              'line-clamp-2 min-w-0 break-words sm:line-clamp-1',
              depth === 0 && 'font-medium',
            )}
            title={line.name}
          >
            {line.name}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox
            id={pickId}
            checked={picked}
            disabled={pickDisabled}
            onCheckedChange={onPick}
            aria-label={t('compare.categories.pickFor', { name: line.name })}
          />
          <label htmlFor={pickId} aria-hidden>
            {t('compare.categories.pick')}
          </label>
        </div>
      </th>
      {periods.map((period, index) => (
        <Cell
          key={period.period_id}
          line={line}
          period={period}
          index={index}
          showPlanned={showPlanned}
        />
      ))}
      <td className="px-2 py-2 text-right align-top tabular-nums sm:px-3">
        {line.average_spent === null ? (
          <span className="block min-w-20 text-xs text-muted-foreground">
            {t('compare.categories.averageNone')}
          </span>
        ) : (
          <span className="whitespace-nowrap">{formatMoney(line.average_spent)}</span>
        )}
      </td>
    </tr>
  )
}

function Cell({
  line,
  period,
  index,
  showPlanned,
}: {
  line: CategoryLine
  period: TrendPeriod
  index: number
  showPlanned: boolean
}) {
  const { t } = useTranslation()
  const spent = line.spent[index] ?? 0
  const planned = line.planned[index] ?? null
  const inForce = line.in_force[index] === true
  const recorded = (line.transaction_count[index] ?? 0) > 0
  const periodText = t('compare.period', {
    start: formatCalendarDate(period.start_date),
    end: formatCalendarDate(period.end_date),
  })
  // Not in force and nothing recorded: "—". Transactions that net to zero still lead to them.
  if (!inForce && spent === 0 && !recorded) {
    return (
      <td
        className="px-2 py-2 text-right align-top text-muted-foreground sm:px-3"
        data-testid="cell-not-in-force"
      >
        <span aria-hidden>{t('compare.categories.notInForceShort')}</span>
        <span className="sr-only">{t('compare.categories.notInForce')}</span>
      </td>
    )
  }
  // Spending above what was planned then: a sign and words, never colour alone (Q-181).
  const over = planned !== null && spent > planned
  return (
    <td
      className="px-2 py-2 text-right align-top tabular-nums sm:px-3"
      data-over={over || undefined}
    >
      {/* The amount on one line; the notes under it wrap, so a column stays narrow. */}
      <Link
        to={`${paths.transactions}?period=${period.period_id}&category=${line.category_id}`}
        className="inline-flex flex-col items-end rounded whitespace-nowrap underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:flex-row sm:items-center sm:gap-1"
        aria-label={t('compare.categories.cell', {
          name: line.name,
          period: periodText,
          amount: formatMoney(spent),
        })}
      >
        {over && <TriangleAlertIcon className="size-3.5 text-destructive" aria-hidden />}
        {formatMoney(spent)}
      </Link>
      {over && <span className="sr-only">{t('compare.categories.overspent')}</span>}
      {!inForce && (
        <span className="ml-auto block max-w-26 text-xs text-muted-foreground">
          {t('compare.categories.notInForce')}
        </span>
      )}
      {showPlanned && planned !== null && (
        <span className="ml-auto block max-w-26 text-xs text-muted-foreground">
          {t('compare.categories.plannedOf', { amount: formatMoney(planned) })}
        </span>
      )}
    </td>
  )
}
