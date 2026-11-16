import { ChevronRightIcon, LayersIcon, TriangleAlertIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { paths } from '@/app/paths'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { dayMonth, MAX_LINES, readSlots, writeSlots } from '@/features/compare/compare-format'
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

/**
 * Spending per category across the range (get_category_trend, checked against the trend's
 * periods): a table of every line by period, groups first and opened on their subcategories,
 * each cell leading to that category's transactions in that period; and a chart of the lines
 * the user picks. Not in force is "—", never 0; spending above the plan is marked with a sign
 * and words. Every figure is the database's.
 */
// R-COMPARE-192: the lines as the database gives them, picked lines in the address.
export function CategoriesView({
  budgetId,
  count,
  picked,
  onPick,
  showPlanned,
  onShowPlanned,
}: {
  budgetId: string
  count: Count
  picked: string | null
  onPick: (lines: string) => void
  showPlanned: boolean
  onShowPlanned: (on: boolean) => void
}) {
  const { t } = useTranslation()
  const range = useCategoryRange(budgetId, count)
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
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
  const toggle = (id: string) => {
    const next = [...slots]
    const at = next.indexOf(id)
    if (at >= 0) next[at] = null
    else {
      const free = next.indexOf(null)
      if (free >= 0) next[free] = id
      else if (next.length < MAX_LINES) next.push(id)
      else return
    }
    onPick(writeSlots(next))
  }
  const top = lines.filter((line) => line.parent_id === null)
  const children = (id: string) => lines.filter((line) => line.parent_id === id)
  const rows: { line: CategoryLine; depth: number }[] = []
  for (const line of top) {
    rows.push({ line, depth: 0 })
    if (line.is_group && open.has(line.category_id)) {
      for (const child of children(line.category_id)) rows.push({ line: child, depth: 1 })
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-6" data-testid="categories-view">
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
              onCheckedChange={(next) => onShowPlanned(next === true)}
            />
            <Label htmlFor="show-planned">{t('compare.categories.showPlanned')}</Label>
          </div>
        </CardHeader>
        <CardContent className="min-w-0">
          <div
            className="relative max-h-[70svh] overflow-auto rounded-md border"
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
                    className="sticky left-0 z-30 min-w-40 bg-card px-3 py-2 text-left font-medium sm:min-w-56"
                  >
                    {t('compare.categories.category')}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium whitespace-nowrap">
                    {t('compare.categories.average')}
                  </th>
                  {periods.map((period) => (
                    <th
                      key={period.period_id}
                      scope="col"
                      className="px-3 py-2 text-right font-medium whitespace-nowrap"
                    >
                      <span
                        className="tabular-nums"
                        title={`${formatCalendarDate(period.start_date)} – ${formatCalendarDate(period.end_date)}`}
                      >
                        {dayMonth(period.start_date)}
                      </span>
                      {period.is_current && (
                        <Badge variant="secondary" className="ml-1">
                          {t('compare.running')}
                        </Badge>
                      )}
                      <span className="sr-only">
                        {t('compare.period', {
                          start: formatCalendarDate(period.start_date),
                          end: formatCalendarDate(period.end_date),
                        })}
                      </span>
                    </th>
                  ))}
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
                    onToggleOpen={() => {
                      setOpen((before) => {
                        const next = new Set(before)
                        if (next.has(line.category_id)) next.delete(line.category_id)
                        else next.add(line.category_id)
                        return next
                      })
                    }}
                    picked={slots.includes(line.category_id)}
                    pickDisabled={full && !slots.includes(line.category_id)}
                    onPick={() => toggle(line.category_id)}
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
          'sticky left-0 z-10 bg-card px-3 py-2 text-left font-normal',
          depth > 0 && 'pl-8',
        )}
      >
        <div className="flex max-w-56 min-w-0 items-center gap-1.5">
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
              className="-ml-1 rounded p-0.5 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <ChevronRightIcon
                className={cn('size-4 transition-transform', open && 'rotate-90')}
                aria-hidden
              />
            </button>
          )}
          <span className={cn('truncate', depth === 0 && 'font-medium')} title={line.name}>
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
      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
        {line.average_spent === null ? (
          <span className="text-xs text-muted-foreground">
            {t('compare.categories.averageNone')}
          </span>
        ) : (
          formatMoney(line.average_spent)
        )}
      </td>
      {periods.map((period, index) => (
        <Cell
          key={period.period_id}
          line={line}
          period={period}
          index={index}
          showPlanned={showPlanned}
        />
      ))}
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
  const periodText = t('compare.period', {
    start: formatCalendarDate(period.start_date),
    end: formatCalendarDate(period.end_date),
  })
  if (!inForce && spent === 0) {
    return (
      <td className="px-3 py-2 text-right text-muted-foreground" data-testid="cell-not-in-force">
        <span aria-hidden>{t('compare.categories.notInForceShort')}</span>
        <span className="sr-only">{t('compare.categories.notInForce')}</span>
      </td>
    )
  }
  // Spending above what was planned then: a sign and words, never colour alone.
  const over = planned !== null && spent > planned
  return (
    <td
      className="px-3 py-2 text-right whitespace-nowrap tabular-nums"
      data-over={over || undefined}
    >
      <Link
        to={`${paths.transactions}?period=${period.period_id}&category=${line.category_id}`}
        className="inline-flex items-center gap-1 rounded underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
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
        <span className="block text-xs text-muted-foreground">
          {t('compare.categories.notInForce')}
        </span>
      )}
      {showPlanned && planned !== null && (
        <span className="block text-xs text-muted-foreground">
          {t('compare.categories.plannedOf', { amount: formatMoney(planned) })}
        </span>
      )}
    </td>
  )
}
