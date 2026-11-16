import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarOffIcon,
  EllipsisVerticalIcon,
  FolderPlusIcon,
  PencilIcon,
  PiggyBankIcon,
  PlusIcon,
  Trash2Icon,
  ArchiveRestoreIcon,
  HistoryIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CategoryFormDialog } from '@/features/budget/components/category-form-dialog'
import { CategoryHistoryDialog } from '@/features/budget/components/category-history-dialog'
import { EndCategoryDialog } from '@/features/budget/components/end-category-dialog'
import { BudgetTotals } from '@/features/budget/components/budget-totals'
import { useCurrentPeriod, usePeriods, type PeriodSummary } from '@/features/budgets/budget-queries'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'
import { useReorderCategories } from '@/features/categories/category-mutations'
import { categoryTree, useCategories, type Category } from '@/features/categories/category-queries'
import { cn } from '@/lib/utils'
import { formatCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'

type DialogState =
  | { kind: 'closed' }
  | { kind: 'add'; parent: Category | null }
  | { kind: 'edit'; category: Category }
  | { kind: 'end'; category: Category }
  | { kind: 'extend'; category: Category }
  | { kind: 'restore'; category: Category }

/**
 * The budget: the categories and subcategories in force now with their expectations, and
 * the current period's income, total expected and amount left to assign (all read from the
 * database: nothing is added up here). A negative amount left to assign is shown, never
 * blocked (R-CATEGORY-071).
 */
// R-CATEGORY-050: the budget as the database adds it up.
export function BudgetPage() {
  const { t } = useTranslation()
  const { budgetId } = useCurrentBudget()
  const categories = useCategories(budgetId)
  const current = useCurrentPeriod(budgetId)
  const periods = usePeriods(budgetId)
  const reorder = useReorderCategories(budgetId)
  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' })
  const close = () => setDialog({ kind: 'closed' })

  const ended = current.isSuccess && current.data === null
  const header = (
    <PageHeader
      title={t('nav.budget')}
      description={t('pages.budget.description')}
      action={
        <Button
          onClick={() => setDialog({ kind: 'add', parent: null })}
          disabled={!current.isSuccess || ended}
        >
          <PlusIcon />
          {t('categories.add')}
        </Button>
      }
    />
  )

  const failed = [categories, current, periods].find((query) => query.isError)
  if (failed) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ErrorState
          error={failed.error}
          onRetry={() => {
            categories.refetch()
            current.refetch()
            periods.refetch()
          }}
        />
      </div>
    )
  }
  if (!categories.data || current.data === undefined || !periods.data) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <LoadingState rows={4} />
      </div>
    )
  }

  const all = categories.data
  const tree = categoryTree(all)

  /** Move a category one place among its siblings in force (R-CATEGORY-096). */
  const move = (siblings: Category[], index: number, by: -1 | 1) => {
    const ids = siblings.map((sibling) => sibling.id)
    const target = index + by
    const [moved] = ids.splice(index, 1)
    if (moved === undefined || target < 0 || target > ids.length) return
    ids.splice(target, 0, moved)
    reorder.mutate({ parentId: siblings[0]?.parent_id ?? null, ids })
  }
  const topLevel = tree.active.map((entry) => entry.category)

  return (
    <div className="flex flex-col gap-6">
      {header}
      {ended && (
        <Alert>
          <CalendarOffIcon aria-hidden />
          <AlertTitle>{t('budgetEnded.title')}</AlertTitle>
          <AlertDescription>{t('categories.endedBudget')}</AlertDescription>
        </Alert>
      )}
      {current.data && <BudgetTotals period={current.data} />}
      {tree.active.length === 0 ? (
        <EmptyState
          icon={PiggyBankIcon}
          title={t('categories.empty')}
          description={t('categories.emptyDescription')}
          action={
            !ended && (
              <Button onClick={() => setDialog({ kind: 'add', parent: null })}>
                <PlusIcon />
                {t('categories.addFirst')}
              </Button>
            )
          }
        />
      ) : (
        <Card className="gap-0 py-0">
          <CardContent className="px-0">
            <div className="flex items-center justify-between border-b px-4 py-2 text-xs font-medium text-muted-foreground">
              <span>{t('categories.columns.category')}</span>
              <span className="pr-10">{t('categories.columns.perMonth')}</span>
            </div>
            <ul aria-label={t('categories.listLabel')} className="divide-y">
              {tree.active.map(({ category, children }, index) => (
                <li key={category.id} data-testid="category-row">
                  <CategoryRow
                    category={category}
                    readOnly={ended}
                    first={index === 0}
                    last={index === topLevel.length - 1}
                    onEdit={() => setDialog({ kind: 'edit', category })}
                    onAddSub={() => setDialog({ kind: 'add', parent: category })}
                    onEnd={() => setDialog({ kind: 'end', category })}
                    onExtend={() => setDialog({ kind: 'extend', category })}
                    onMove={(by) => move(topLevel, index, by)}
                  />
                  {category.is_group && (
                    <ul className="ml-4 border-l sm:ml-6" aria-label={category.name}>
                      {children.length === 0 && (
                        <li className="px-4 py-3 text-sm text-muted-foreground">
                          {t('categories.emptyGroup')}
                        </li>
                      )}
                      {children.map((child, childIndex) => (
                        <li key={child.id} data-testid="subcategory-row">
                          <CategoryRow
                            category={child}
                            readOnly={ended}
                            first={childIndex === 0}
                            last={childIndex === children.length - 1}
                            onEdit={() => setDialog({ kind: 'edit', category: child })}
                            onEnd={() => setDialog({ kind: 'end', category: child })}
                            onExtend={() => setDialog({ kind: 'extend', category: child })}
                            onMove={(by) => move(children, childIndex, by)}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {tree.ended.length > 0 && (
        <EndedCategories
          categories={tree.ended}
          all={all}
          periods={periods.data}
          onRestore={(category) => setDialog({ kind: 'restore', category })}
        />
      )}

      <CategoryFormDialog
        budgetId={budgetId}
        open={dialog.kind === 'add' || dialog.kind === 'edit'}
        onOpenChange={(open) => {
          if (!open) close()
        }}
        parent={dialog.kind === 'add' ? dialog.parent : null}
        category={dialog.kind === 'edit' ? dialog.category : undefined}
        periods={periods.data}
        currentPeriod={current.data}
      />
      <EndCategoryDialog
        budgetId={budgetId}
        category={dialog.kind === 'end' ? dialog.category : null}
        subcategories={
          dialog.kind === 'end'
            ? all.filter((item) => item.parent_id === dialog.category.id && item.is_active === true)
            : []
        }
        periods={periods.data}
        currentPeriod={current.data}
        onClose={close}
      />
      <CategoryHistoryDialog
        budgetId={budgetId}
        mode={dialog.kind === 'restore' ? 'restore' : 'extend'}
        category={dialog.kind === 'extend' || dialog.kind === 'restore' ? dialog.category : null}
        parent={
          dialog.kind === 'extend' || dialog.kind === 'restore'
            ? (all.find((item) => item.id === dialog.category.parent_id) ?? null)
            : null
        }
        periods={periods.data}
        currentPeriod={current.data}
        onClose={close}
      />
    </div>
  )
}

/** One category or subcategory: its name, its amount per month and its actions. */
function CategoryRow({
  category,
  readOnly,
  first,
  last,
  onEdit,
  onAddSub,
  onEnd,
  onExtend,
  onMove,
}: {
  category: Category
  readOnly: boolean
  first: boolean
  last: boolean
  onEdit: () => void
  onAddSub?: () => void
  onEnd: () => void
  onExtend: () => void
  onMove: (by: -1 | 1) => void
}) {
  const { t } = useTranslation()
  const sub = category.parent_id !== null
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn('truncate', sub ? 'text-sm' : 'font-medium')}
            data-testid="category-name"
          >
            {category.name}
          </span>
          {category.is_group && <Badge variant="secondary">{t('categories.group')}</Badge>}
        </div>
        {category.cadence === 'yearly' && category.amount !== null && (
          <span className="text-xs text-muted-foreground">
            {t('categories.yearlyNote', { amount: formatMoney(category.amount) })}
          </span>
        )}
        {category.is_group && (
          <span className="text-xs text-muted-foreground">{t('categories.groupNote')}</span>
        )}
      </div>
      <span
        className={cn(
          'shrink-0 text-right tabular-nums',
          category.is_group ? 'font-semibold' : sub ? 'text-sm' : 'font-medium',
        )}
        data-testid="category-amount"
      >
        {formatMoney(category.monthly_amount ?? 0)}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('categories.actionsFor', { name: category.name })}
          >
            <EllipsisVerticalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem onSelect={onEdit} disabled={readOnly}>
            <PencilIcon />
            {t('categories.edit')}
          </DropdownMenuItem>
          {onAddSub && (
            <DropdownMenuItem onSelect={onAddSub} disabled={readOnly}>
              <FolderPlusIcon />
              {t('categories.addSub')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => onMove(-1)} disabled={readOnly || first}>
            <ArrowUpIcon />
            {t('categories.moveUp')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onMove(1)} disabled={readOnly || last}>
            <ArrowDownIcon />
            {t('categories.moveDown')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onExtend}>
            <HistoryIcon />
            {t('categories.extendAction')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onEnd} disabled={readOnly}>
            <Trash2Icon />
            {t('categories.remove')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** Ended categories, for the record: past periods keep them. */
function EndedCategories({
  categories,
  all,
  periods,
  onRestore,
}: {
  categories: Category[]
  all: Category[]
  periods: PeriodSummary[]
  onRestore: (category: Category) => void
}) {
  const { t } = useTranslation()
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">{t('categories.endedTitle')}</h2>
      <p className="text-sm text-muted-foreground">{t('categories.endedHelp')}</p>
      <ul className="flex flex-col divide-y rounded-xl border">
        {categories.map((category) => {
          // end_seq is the first period it no longer counts in.
          const lastPeriod = periods.find((period) => period.seq === (category.end_seq ?? 0) - 1)
          const parent = all.find((item) => item.id === category.parent_id)
          return (
            <li
              key={category.id}
              className="flex items-center gap-3 px-4 py-3 text-sm"
              data-testid="ended-category-row"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="truncate font-medium">
                  {parent
                    ? t('categories.path', { parent: parent.name, name: category.name })
                    : category.name}
                </p>
                <p className="text-muted-foreground">
                  {lastPeriod
                    ? t('categories.lastCounted', {
                        date: formatCalendarDate(lastPeriod.end_date),
                      })
                    : t('categories.endedLabel')}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRestore(category)}
                aria-label={t('categories.restoreFor', { name: category.name })}
              >
                <ArchiveRestoreIcon />
                {t('categories.restore')}
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
