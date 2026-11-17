import { useQueryClient } from '@tanstack/react-query'
import { CircleAlertIcon, CircleCheckIcon, TagsIcon } from 'lucide-react'
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { budgetKeys } from '@/features/budgets/budget-keys'
import { useCategories, useCategoriesForDate } from '@/features/categories/category-queries'
import type { Transaction } from '@/features/transactions/transaction-queries'
import {
  canCategoriseInReview,
  categoriseAndConfirm,
  NotConfirmed,
  reviewRowLabel,
} from '@/features/import/review-categorise-call'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { assertOnline } from '@/lib/online'

/** The rows chosen for one category at once, shared by the rows and the bar above them. */
interface Selection {
  selected: ReadonlySet<string>
  toggle: (id: string, on: boolean) => void
  running: boolean
}

const SelectionContext = createContext<Selection | null>(null)

/**
 * The review's category tools around the list: a bar to give several selected rows one
 * category, and (through the rows) a category picker on each row. Only in the review view.
 */
// R-IMPORT-530: a category on the row itself, and one category for several rows at once.
export function ReviewCategorise({
  budgetId,
  rows,
  children,
}: {
  budgetId: string
  rows: Transaction[]
  children: ReactNode
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [running, setRunning] = useState(false)
  const eligible = useMemo(() => rows.filter(canCategoriseInReview), [rows])
  // A row that left the list (confirmed elsewhere, filtered away) is no longer selected.
  const shown = useMemo(
    () => new Set([...selected].filter((id) => eligible.some((row) => row.id === id))),
    [selected, eligible],
  )
  const selection = useMemo<Selection>(
    () => ({
      selected: shown,
      running,
      toggle: (id, on) =>
        setSelected((before) => {
          const next = new Set(before)
          if (on) next.add(id)
          else next.delete(id)
          return next
        }),
    }),
    [shown, running],
  )
  return (
    <SelectionContext.Provider value={selection}>
      {eligible.length > 0 && (
        <BulkBar
          budgetId={budgetId}
          eligible={eligible}
          selected={shown}
          onSelect={setSelected}
          running={running}
          onRunning={setRunning}
        />
      )}
      {children}
    </SelectionContext.Provider>
  )
}

interface Outcome {
  total: number
  saved: number
  /** The row the run stopped at, why, and whether its category was saved. */
  stopped: { row: Transaction; reason: string; categorySaved: boolean } | null
  /** Rows not saved and confirmed: the one it stopped at and those after it. */
  notSaved: Transaction[]
}

function BulkBar({
  budgetId,
  eligible,
  selected,
  onSelect,
  running,
  onRunning,
}: {
  budgetId: string
  eligible: Transaction[]
  selected: ReadonlySet<string>
  onSelect: (next: ReadonlySet<string>) => void
  running: boolean
  onRunning: (running: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const errorMessage = useErrorMessage({
    category_to_categorise: 'import.toCategorise.errors.confirm',
  })
  const categories = useCategories(budgetId)
  const [categoryId, setCategoryId] = useState('')
  const [done, setDone] = useState(0)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  // Leaves in force now; a row dated where one is not in force is refused by the database,
  // and the run stops there and says so.
  const all = categories.data ?? []
  const choices = all.filter(
    (category) => category.is_active === true && !category.is_group && !category.is_to_categorise,
  )
  const tops = all.filter((category) => category.parent_id === null)
  const chosen = eligible.filter((row) => selected.has(row.id))
  const allSelected = chosen.length === eligible.length

  const run = async () => {
    const queue = chosen
    const first = queue[0]
    if (!first) return
    try {
      assertOnline()
    } catch (error) {
      setOutcome({
        total: queue.length,
        saved: 0,
        stopped: { row: first, reason: errorMessage(error), categorySaved: false },
        notSaved: queue,
      })
      return
    }
    onRunning(true)
    setOutcome(null)
    setDone(0)
    let saved = 0
    let stopped: Outcome['stopped'] = null
    const left = new Set(selected)
    for (const row of queue) {
      try {
        await categoriseAndConfirm(row, categoryId)
        saved += 1
        left.delete(row.id)
        setDone(saved)
      } catch (error) {
        const notConfirmed = error instanceof NotConfirmed
        stopped = {
          row,
          reason: errorMessage(notConfirmed ? error.reason : error),
          categorySaved: notConfirmed,
        }
        break
      }
    }
    const notSaved = stopped ? queue.slice(queue.indexOf(stopped.row)) : []
    setOutcome({ total: queue.length, saved, stopped, notSaved })
    onSelect(left)
    onRunning(false)
    void queryClient.invalidateQueries({ queryKey: budgetKeys.budget(budgetId) })
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:p-4"
      aria-labelledby="review-bulk-title"
      data-testid="review-bulk"
    >
      <h2 id="review-bulk-title" className="flex items-center gap-2 text-sm font-medium">
        <TagsIcon className="size-4 text-muted-foreground" aria-hidden />
        {t('import.review.bulk.title')}
      </h2>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="review-select-all"
            checked={allSelected ? true : chosen.length > 0 ? 'indeterminate' : false}
            disabled={running}
            onCheckedChange={(next) =>
              onSelect(next === true ? new Set(eligible.map((row) => row.id)) : new Set())
            }
          />
          <Label htmlFor="review-select-all">
            {t('import.review.bulk.selectAll', { count: eligible.length })}
          </Label>
        </div>
        <span className="text-sm text-muted-foreground" data-testid="review-selected-count">
          {t('import.review.bulk.selected', { count: chosen.length })}
        </span>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-col gap-1.5 sm:w-72">
          <Label htmlFor="review-bulk-category">{t('import.review.bulk.category')}</Label>
          <Select value={categoryId} onValueChange={setCategoryId} disabled={running}>
            <SelectTrigger id="review-bulk-category" className="w-full">
              <SelectValue placeholder={t('import.review.chooseCategory')} />
            </SelectTrigger>
            <SelectContent position="popper" className="max-h-80">
              {tops.map((top) =>
                top.is_group ? (
                  <SelectGroup key={top.id}>
                    <SelectLabel>{top.name}</SelectLabel>
                    {choices
                      .filter((item) => item.parent_id === top.id)
                      .map((item) => (
                        <SelectItem key={item.id} value={item.id} className="pl-5">
                          {item.name}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                ) : choices.includes(top) ? (
                  <SelectItem key={top.id} value={top.id}>
                    {top.name}
                  </SelectItem>
                ) : null,
              )}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          disabled={running || chosen.length === 0 || categoryId === ''}
          onClick={() => void run()}
        >
          {running
            ? t('import.review.bulk.running', { done, count: chosen.length })
            : t('import.review.bulk.apply', { count: chosen.length })}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('import.review.bulk.help')}</p>
      <div aria-live="polite" className="contents">
        {running && (
          <p className="sr-only">
            {t('import.review.bulk.running', { done, count: chosen.length })}
          </p>
        )}
        {outcome && <OutcomeNotice outcome={outcome} />}
      </div>
    </section>
  )
}

function OutcomeNotice({ outcome }: { outcome: Outcome }) {
  const { t } = useTranslation()
  if (!outcome.stopped) {
    return (
      <Alert data-testid="review-bulk-outcome">
        <CircleCheckIcon aria-hidden />
        <AlertDescription>
          {t('import.review.bulk.allDone', { count: outcome.saved })}
        </AlertDescription>
      </Alert>
    )
  }
  const { stopped } = outcome
  return (
    <Alert variant="destructive" data-testid="review-bulk-outcome">
      <CircleAlertIcon aria-hidden />
      <AlertTitle>
        {t('import.review.bulk.partial', { saved: outcome.saved, count: outcome.total })}
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-1.5">
        <p>
          {t(
            stopped.categorySaved
              ? 'import.review.bulk.stoppedConfirm'
              : 'import.review.bulk.stopped',
            { row: reviewRowLabel(stopped.row), reason: stopped.reason },
          )}
        </p>
        <p>{t('import.review.bulk.notSaved', { count: outcome.notSaved.length })}</p>
        <ul className="list-disc pl-5" data-testid="review-bulk-not-saved">
          {outcome.notSaved.map((row) => (
            <li key={row.id}>{reviewRowLabel(row)}</li>
          ))}
        </ul>
        <p>{t('import.review.bulk.stillSelected')}</p>
      </AlertDescription>
    </Alert>
  )
}

/** The row's checkbox for "one category for several", in the review view only. */
export function ReviewSelectBox({ row }: { row: Transaction }) {
  const { t } = useTranslation()
  const selection = useContext(SelectionContext)
  if (!selection || !canCategoriseInReview(row)) return null
  return (
    <Checkbox
      checked={selection.selected.has(row.id)}
      disabled={selection.running}
      onCheckedChange={(next) => selection.toggle(row.id, next === true)}
      aria-label={t('import.review.bulk.selectRow', { row: reviewRowLabel(row) })}
      data-testid="review-select"
    />
  )
}

/**
 * A category picker on the row: one choice saves the category and confirms the row. The
 * choices (the leaves the row's date may use) are read when the picker opens.
 */
export function RowCategoryPicker({
  budgetId,
  row,
  onSaved,
}: {
  budgetId: string
  row: Transaction
  onSaved?: (before: Transaction, after: Transaction) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const errorMessage = useErrorMessage({
    category_to_categorise: 'import.toCategorise.errors.confirm',
  })
  const selection = useContext(SelectionContext)
  const [opened, setOpened] = useState(false)
  const [pending, setPending] = useState(false)
  const choices = useCategoriesForDate(budgetId, row.date, opened)
  if (!canCategoriseInReview(row)) return null
  const label = reviewRowLabel(row)
  const current = row.in_to_categorise
    ? null
    : row.parent_category_name
      ? t('categories.path', { parent: row.parent_category_name, name: row.category_name ?? '' })
      : row.category_name

  const pick = async (categoryId: string) => {
    setPending(true)
    try {
      assertOnline()
      const after = await categoriseAndConfirm(row, categoryId)
      toast.success(t('import.review.categorisedConfirmed'))
      onSaved?.(row, after)
    } catch (error) {
      if (error instanceof NotConfirmed) {
        toast.error(
          t('import.review.categorisedNotConfirmed', { reason: errorMessage(error.reason) }),
        )
        onSaved?.(row, error.after)
      } else toast.error(errorMessage(error))
    } finally {
      setPending(false)
      void queryClient.invalidateQueries({ queryKey: budgetKeys.budget(budgetId) })
    }
  }

  return (
    <Select
      value=""
      onValueChange={(value) => void pick(value)}
      onOpenChange={(open) => {
        if (open) setOpened(true)
      }}
      disabled={pending || selection?.running === true}
    >
      <SelectTrigger
        size="sm"
        className="h-7 max-w-full min-w-0 text-xs sm:w-56"
        aria-label={t('import.review.categoryFor', { row: label })}
        data-testid="review-category"
      >
        <SelectValue
          placeholder={
            pending
              ? t('common.saving')
              : current
                ? t('import.review.categoryNow', { name: current })
                : t('import.review.chooseCategory')
          }
        />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-80">
        {!choices.data ? (
          <SelectItem value="__loading__" disabled>
            {choices.isError ? t('errors.generic') : t('common.loading')}
          </SelectItem>
        ) : (
          choices.data.map((choice) => (
            <SelectItem key={choice.category_id} value={choice.category_id}>
              {choice.parent_name
                ? t('categories.path', { parent: choice.parent_name, name: choice.name })
                : choice.name}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  )
}
