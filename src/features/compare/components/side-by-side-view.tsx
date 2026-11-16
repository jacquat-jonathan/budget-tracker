import {
  ArrowDownIcon,
  ArrowLeftRightIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  EqualIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState, LoadingState } from '@/components/states'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePeriods, type PeriodSummary } from '@/features/budgets/budget-queries'
import { OlderPeriodsItem } from '@/features/budgets/older-periods-item'
import { pickPeriod, useOlderPeriodsOption } from '@/features/budgets/older-periods'
import { signedMoney } from '@/features/compare/compare-format'
import { usePeriodComparison, type ComparisonRow } from '@/features/compare/compare-queries'
import { formatCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

type Sort = 'budget' | 'change'

/**
 * Any two periods side by side (get_period_comparison): the pickers (the database's defaults
 * when none is chosen: B the current period, A the one before), a swap, the totals with their
 * differences, then each category's spending in A and B and the difference, groups opened on
 * their subcategories, in the budget's order or biggest changes first. A side with nothing is
 * "—", said in words; a difference has its sign and its direction in words and an arrow.
 */
// R-COMPARE-194: the database's rows side by side, differences never by colour alone.
export function SideBySideView({
  budgetId,
  a,
  b,
  sort,
  onChange,
}: {
  budgetId: string
  a: string | null
  b: string | null
  sort: Sort
  onChange: (changes: Record<string, string | null>) => void
}) {
  const { t } = useTranslation()
  const periods = usePeriods(budgetId)
  const olderPeriods = useOlderPeriodsOption(budgetId)
  const comparison = usePeriodComparison(budgetId, a, b)
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  if (comparison.isError)
    return <ErrorState error={comparison.error} onRetry={comparison.refetch} />
  if (!comparison.data || !periods.data) return <LoadingState rows={5} />
  const total = comparison.data.find((row) => row.kind === 'total')
  if (!total) return <LoadingState rows={5} />
  const categories = comparison.data.filter((row) => row.kind === 'category')
  const chosenA = total.a_period_id
  const chosenB = total.b_period_id
  const label = (period: PeriodSummary) =>
    t('compare.period', {
      start: formatCalendarDate(period.start_date),
      end: formatCalendarDate(period.end_date),
    })
  const picker = (side: 'a' | 'b', value: string | null) => (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <Label htmlFor={`compare-${side}`}>{t(`compare.side.${side}`)}</Label>
      <Select
        value={value ?? ''}
        onValueChange={pickPeriod(olderPeriods, (next) => onChange({ [side]: next }))}
      >
        <SelectTrigger id={`compare-${side}`} className="w-full tabular-nums">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent position="popper" className="max-h-80">
          {periods.data?.map((period) => (
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
  const ordered =
    sort === 'change'
      ? [...top].sort(
          (x, y) => Math.abs(y.spent_difference ?? 0) - Math.abs(x.spent_difference ?? 0),
        )
      : top
  const rows: { row: ComparisonRow; depth: number }[] = []
  for (const row of ordered) {
    rows.push({ row, depth: 0 })
    if (row.is_group && row.category_id && open.has(row.category_id)) {
      const children = categories.filter((child) => child.parent_id === row.category_id)
      const sorted =
        sort === 'change'
          ? [...children].sort(
              (x, y) => Math.abs(y.spent_difference ?? 0) - Math.abs(x.spent_difference ?? 0),
            )
          : children
      for (const child of sorted) rows.push({ row: child, depth: 1 })
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-6" data-testid="side-view">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {picker('a', chosenA)}
        <Button
          variant="outline"
          size="icon"
          className="self-center sm:mt-6"
          aria-label={t('compare.side.swap')}
          disabled={!chosenA}
          onClick={() => onChange({ a: chosenB, b: chosenA })}
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
            <h2>{t('compare.side.totals')}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm sm:min-w-[30rem]" data-testid="side-totals">
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
                            'py-2 pr-3 text-left font-normal',
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
                                onClick={() =>
                                  setOpen((before) => {
                                    const next = new Set(before)
                                    if (next.has(id)) next.delete(id)
                                    else next.add(id)
                                    return next
                                  })
                                }
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
                          className={cn(PHONE_CELL, 'px-3 py-2 text-right tabular-nums')}
                          data-label="A"
                        >
                          <Amount value={row.a_spent} />
                        </td>
                        <td
                          className={cn(PHONE_CELL, 'px-3 py-2 text-right tabular-nums')}
                          data-label="B"
                        >
                          <Amount value={row.b_spent} />
                        </td>
                        <td
                          className={cn(PHONE_DIFFERENCE, 'py-2 pl-3 text-right')}
                          data-label={t('compare.side.difference')}
                        >
                          <Difference value={row.spent_difference} />
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
 * a line of its own (room for eight-figure amounts at 320 px).
 */
// D-298: on a phone the difference is seen without scrolling sideways.
const PHONE_ROW =
  'border-b last:border-b-0 max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-3 max-sm:gap-y-1 max-sm:pb-2'
const PHONE_NAME = 'max-sm:col-span-2 max-sm:pb-0'
const PHONE_CELL =
  'max-sm:p-0 max-sm:text-left max-sm:before:block max-sm:before:text-xs max-sm:before:text-muted-foreground max-sm:before:content-[attr(data-label)]'
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
  return <span className="whitespace-nowrap">{formatMoney(value)}</span>
}

/** B minus A with its sign, an arrow and its direction in words (screen readers too). */
function Difference({ value }: { value: number | null }) {
  const { t } = useTranslation()
  if (value === null) return <Amount value={null} />
  const Icon = value > 0 ? ArrowUpIcon : value < 0 ? ArrowDownIcon : EqualIcon
  return (
    <span
      className="inline-flex items-center justify-end gap-1 whitespace-nowrap tabular-nums"
      data-testid="difference"
    >
      <Icon className="size-3.5 text-muted-foreground" aria-hidden />
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
