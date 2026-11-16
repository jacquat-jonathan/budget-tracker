import {
  ArrowDownIcon,
  ArrowLeftRightIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  EqualIcon,
  InfoIcon,
} from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState, LoadingState } from '@/components/states'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePeriodById, usePeriods, type PeriodSummary } from '@/features/budgets/budget-queries'
import { OlderPeriodsItem } from '@/features/budgets/older-periods-item'
import { pickPeriod, useOlderPeriodsOption } from '@/features/budgets/older-periods'
import { readOpen, signedMoney, toggleOpen } from '@/features/compare/compare-format'
import { usePeriodComparison, type ComparisonRow } from '@/features/compare/compare-queries'
import type { UpdateParam } from '@/features/compare/components/categories-view'
import { formatCalendarDate } from '@/lib/date'
import { dbErrorCode } from '@/lib/db-errors'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { isUuid } from '@/lib/uuid'

type Sort = 'budget' | 'change'

/**
 * Any two periods side by side (get_period_comparison): the pickers (the database's defaults
 * when none is chosen: B the current period, A the one before), a swap, the totals with their
 * differences, then each category's spending in A and B and the difference, planned amounts on
 * request, groups opened on their subcategories, in the budget's order or biggest changes
 * first. A side with nothing is "—", said in words; a difference has its sign, an arrow and its
 * direction in words. A period in the address that is not one of this budget's (a stale or
 * shared link, another budget) gives way to the defaults, and the page says so.
 */
// R-COMPARE-194: the database's rows side by side, differences never by colour alone.
export function SideBySideView({
  budgetId,
  a,
  b,
  unknown,
  sort,
  showPlanned,
  opened,
  onChange,
  update,
}: {
  budgetId: string
  a: string | null
  b: string | null
  /** The address named a period this budget does not have: the defaults are shown. */
  unknown: boolean
  sort: Sort
  showPlanned: boolean
  opened: string | null
  onChange: (changes: Record<string, string | null>) => void
  update: UpdateParam
}) {
  const { t } = useTranslation()
  const periods = usePeriods(budgetId)
  const olderPeriods = useOlderPeriodsOption(budgetId)
  // An id that is not a uuid is never sent (R-PERIOD-281): the defaults, said in words.
  const aId = isUuid(a) ? a : null
  const bId = isUuid(b) ? b : null
  const malformed = (a !== null && aId === null) || (b !== null && bId === null)
  const comparison = usePeriodComparison(budgetId, aId, bId)
  // R-COMPARE-283: a period that is not one of this budget's gives way to the defaults.
  const notHere =
    comparison.isError &&
    dbErrorCode(comparison.error) === 'period_not_found' &&
    (aId !== null || bId !== null)
  useEffect(() => {
    if (notHere || malformed) onChange({ a: null, b: null, unknown: '1' })
    // Only when the answer or the address says so.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notHere, malformed])
  const total = comparison.data?.find((row) => row.kind === 'total')
  const periodA = usePeriodById(budgetId, total?.a_period_id ?? null, periods.data)
  const periodB = usePeriodById(budgetId, total?.b_period_id ?? null, periods.data)
  if (comparison.isError && !notHere) {
    return <ErrorState error={comparison.error} onRetry={comparison.refetch} />
  }
  if (!comparison.data || !periods.data || !total) return <LoadingState rows={5} />
  const categories = comparison.data.filter((row) => row.kind === 'category')
  const chosenA = total.a_period_id
  const chosenB = total.b_period_id
  const open = readOpen(opened)
  const label = (period: PeriodSummary) =>
    t('compare.period', {
      start: formatCalendarDate(period.start_date),
      end: formatCalendarDate(period.end_date),
    })
  // A chosen period older than the pages loaded is still in its picker (R-PERIOD-281).
  const choices = [...periods.data]
  for (const extra of [periodA, periodB]) {
    if (extra && !choices.some((period) => period.id === extra.id)) choices.push(extra)
  }
  const picker = (side: 'a' | 'b', value: string | null) => (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <Label htmlFor={`compare-${side}`}>{t(`compare.side.${side}`)}</Label>
      <Select
        value={value ?? ''}
        onValueChange={pickPeriod(olderPeriods, (next) =>
          onChange({ [side]: next, unknown: null }),
        )}
      >
        <SelectTrigger id={`compare-${side}`} className="w-full tabular-nums">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent position="popper" className="max-h-80">
          {choices.map((period) => (
            <SelectItem key={period.id} value={period.id}>
              {label(period)}
            </SelectItem>
          ))}
          <OlderPeriodsItem option={olderPeriods} />
        </SelectContent>
      </Select>
      <span className="text-xs text-muted-foreground" data-testid={`side-${side}-days`}>
        {side === 'a'
          ? total.a_days !== null && t('compare.days', { count: total.a_days })
          : t('compare.days', { count: total.b_days })}
      </span>
    </div>
  )
  const top = categories.filter((row) => row.parent_id === null)
  // Sorting the rows the database returned (presentation): by the size of the change.
  const bySize = (list: ComparisonRow[]) =>
    sort === 'change'
      ? [...list].sort(
          (x, y) => Math.abs(y.spent_difference ?? 0) - Math.abs(x.spent_difference ?? 0),
        )
      : list
  const rows: { row: ComparisonRow; depth: number }[] = []
  for (const row of bySize(top)) {
    rows.push({ row, depth: 0 })
    if (row.is_group && row.category_id && open.has(row.category_id)) {
      for (const child of bySize(categories.filter((item) => item.parent_id === row.category_id)))
        rows.push({ row: child, depth: 1 })
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-6" data-testid="side-view">
      {unknown && (
        <Alert data-testid="side-unknown" role="status">
          <InfoIcon aria-hidden />
          <AlertDescription>{t('compare.side.unknown')}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {picker('a', chosenA)}
        <Button
          variant="outline"
          size="icon"
          className="self-center sm:mt-6"
          aria-label={t('compare.side.swap')}
          disabled={!chosenA}
          onClick={() => onChange({ a: chosenB, b: chosenA, unknown: null })}
          data-testid="swap"
        >
          <ArrowLeftRightIcon />
        </Button>
        {picker('b', chosenB)}
      </div>
      {!chosenA && (
        <Alert>
          <AlertDescription>{t('compare.side.noA')}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 id="side-totals-title">{t('compare.side.totals')}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
          <div className="relative overflow-x-auto">
            <table
              className="w-full text-sm sm:min-w-[30rem]"
              aria-labelledby="side-totals-title"
              data-testid="side-totals"
            >
              <thead>
                <tr className="text-muted-foreground sm:border-b">
                  <th scope="col" className="py-2 pr-3 text-left font-medium max-sm:sr-only">
                    {t('compare.side.row')}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium max-sm:sr-only">
                    A
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium max-sm:sr-only">
                    B
                  </th>
                  <th scope="col" className="py-2 pl-3 text-right font-medium max-sm:sr-only">
                    {t('compare.side.difference')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['income', total.a_income, total.b_income, total.income_difference],
                    ['spent', total.a_spent, total.b_spent, total.spent_difference],
                    ['result', total.a_result, total.b_result, total.result_difference],
                    ['planned', total.a_planned, total.b_planned, total.planned_difference],
                    ['committed', total.a_committed, total.b_committed, total.committed_difference],
                  ] as const
                ).map(([key, before, after, difference]) => (
                  <tr key={key} className={PHONE_ROW} data-testid={`total-${key}`}>
                    <th scope="row" className={cn(PHONE_NAME, 'py-2 pr-3 text-left font-normal')}>
                      {t(`compare.series.${key}`)}
                    </th>
                    <td
                      className={cn(PHONE_CELL, 'px-3 py-2 text-right tabular-nums')}
                      data-label="A"
                    >
                      <Amount value={before} />
                    </td>
                    <td
                      className={cn(PHONE_CELL, 'px-3 py-2 text-right tabular-nums')}
                      data-label="B"
                    >
                      <Amount value={after} />
                    </td>
                    <td
                      className={cn(PHONE_DIFFERENCE, 'py-2 pl-3 text-right')}
                      data-label={t('compare.side.difference')}
                    >
                      <Difference value={difference} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-col gap-3">
          <CardTitle>
            <h2>{t('compare.side.categoriesTitle')}</h2>
          </CardTitle>
          <CardDescription>{t('compare.side.categoriesHelp')}</CardDescription>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="compare-sort">{t('compare.side.sort')}</Label>
              <Select
                value={sort}
                onValueChange={(next) => onChange({ sort: next === 'change' ? 'change' : null })}
              >
                <SelectTrigger id="compare-sort" className="w-auto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="budget">{t('compare.side.sortBudget')}</SelectItem>
                  <SelectItem value="change">{t('compare.side.sortChange')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="side-planned"
                checked={showPlanned}
                onCheckedChange={(next) => update('planned', () => (next === true ? '1' : null))}
              />
              <Label htmlFor="side-planned">{t('compare.categories.showPlanned')}</Label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="min-w-0">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('compare.side.noCategories')}</p>
          ) : (
            <div className="relative overflow-x-auto">
              <table
                className="w-full text-sm sm:min-w-[30rem]"
                aria-label={t('compare.side.tableLabel')}
                data-testid="side-categories"
              >
                <thead>
                  <tr className="text-muted-foreground sm:border-b">
                    <th scope="col" className="py-2 pr-3 text-left font-medium max-sm:sr-only">
                      {t('compare.categories.category')}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium max-sm:sr-only">
                      A
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium max-sm:sr-only">
                      B
                    </th>
                    <th scope="col" className="py-2 pl-3 text-right font-medium max-sm:sr-only">
                      {t('compare.side.difference')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ row, depth }) => {
                    const id = row.category_id ?? ''
                    const isOpen = open.has(id)
                    return (
                      <tr key={id} className={PHONE_ROW} data-testid="side-row" data-depth={depth}>
                        <th
                          scope="row"
                          className={cn(
                            PHONE_NAME,
                            'py-2 pr-3 text-left align-top font-normal',
                            depth > 0 && 'pl-6',
                          )}
                        >
                          <div className="flex max-w-64 min-w-0 items-center gap-1.5">
                            {row.is_group && (
                              <button
                                type="button"
                                aria-expanded={isOpen}
                                aria-label={
                                  isOpen
                                    ? t('compare.categories.close', { name: row.name ?? '' })
                                    : t('compare.categories.open', { name: row.name ?? '' })
                                }
                                onClick={() => update('open', (value) => toggleOpen(value, id))}
                                className="-ml-1 rounded p-0.5 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                              >
                                <ChevronRightIcon
                                  className={cn(
                                    'size-4 transition-transform',
                                    isOpen && 'rotate-90',
                                  )}
                                  aria-hidden
                                />
                              </button>
                            )}
                            <span
                              className={cn('truncate', depth === 0 && 'font-medium')}
                              title={row.name ?? ''}
                            >
                              {row.name}
                            </span>
                          </div>
                        </th>
                        <td
                          className={cn(PHONE_CELL, 'px-3 py-2 text-right align-top tabular-nums')}
                          data-label="A"
                        >
                          <Amount value={row.a_spent} />
                          {showPlanned && <Planned value={row.a_planned} />}
                        </td>
                        <td
                          className={cn(PHONE_CELL, 'px-3 py-2 text-right align-top tabular-nums')}
                          data-label="B"
                        >
                          <Amount value={row.b_spent} />
                          {showPlanned && <Planned value={row.b_planned} />}
                        </td>
                        <td
                          className={cn(PHONE_DIFFERENCE, 'py-2 pl-3 text-right align-top')}
                          data-label={t('compare.side.difference')}
                        >
                          <span className="flex flex-col items-end gap-0.5 max-sm:items-start">
                            <Difference value={row.spent_difference} />
                            {showPlanned && row.planned_difference !== null && (
                              <span
                                className="text-xs text-muted-foreground"
                                data-testid="planned-difference"
                              >
                                {t('compare.side.plannedDifference', {
                                  amount: signedMoney(row.planned_difference),
                                })}
                              </span>
                            )}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * A row on a phone: its name on a line, A and B side by side under it, then the difference on
 * a line of its own (room for nine-figure amounts at 320 px: an amount wraps after "CHF").
 */
// D-298: on a phone the difference is seen without scrolling sideways.
const PHONE_ROW =
  'border-b last:border-b-0 max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-3 max-sm:gap-y-1 max-sm:pb-2'
const PHONE_NAME = 'max-sm:col-span-2 max-sm:pb-0'
const PHONE_CELL =
  'max-sm:min-w-0 max-sm:p-0 max-sm:text-left max-sm:before:block max-sm:before:text-xs max-sm:before:text-muted-foreground max-sm:before:content-[attr(data-label)]'
const PHONE_DIFFERENCE =
  'max-sm:col-span-2 max-sm:flex max-sm:items-baseline max-sm:gap-2 max-sm:p-0 max-sm:text-left max-sm:before:text-xs max-sm:before:text-muted-foreground max-sm:before:content-[attr(data-label)]'

/** A side's figure; "—" (said in words) when the side has nothing. */
function Amount({ value }: { value: number | null }) {
  const { t } = useTranslation()
  if (value === null) {
    return (
      <span className="text-muted-foreground">
        <span aria-hidden>{t('compare.side.nothing')}</span>
        <span className="sr-only">{t('compare.side.nothingSr')}</span>
      </span>
    )
  }
  // On a phone a long amount wraps after "CHF" rather than touching its neighbour.
  return <span className="sm:whitespace-nowrap">{formatMoney(value)}</span>
}

/** The amount planned on that side, under its spending. */
function Planned({ value }: { value: number | null }) {
  const { t } = useTranslation()
  if (value === null) return null
  return (
    <span className="block text-xs text-muted-foreground" data-testid="side-planned">
      {t('compare.categories.plannedOf', { amount: formatMoney(value) })}
    </span>
  )
}

/** B minus A with its sign, an arrow and its direction in words (screen readers too). */
function Difference({ value }: { value: number | null }) {
  const { t } = useTranslation()
  if (value === null) return <Amount value={null} />
  const Icon = value > 0 ? ArrowUpIcon : value < 0 ? ArrowDownIcon : EqualIcon
  return (
    <span
      className="inline-flex items-center justify-end gap-1 tabular-nums sm:whitespace-nowrap"
      data-testid="difference"
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span aria-hidden>{signedMoney(value)}</span>
      <span className="sr-only">
        {value > 0
          ? t('compare.side.up', { amount: formatMoney(value) })
          : value < 0
            ? t('compare.side.down', { amount: formatMoney(-value) })
            : t('compare.side.same')}
      </span>
    </span>
  )
}
