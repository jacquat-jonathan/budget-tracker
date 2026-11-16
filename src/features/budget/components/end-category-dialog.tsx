import { useTranslation } from 'react-i18next'

import { ChangedElsewhere, SaveError } from '@/components/changed-elsewhere'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import type { PeriodSummary } from '@/features/budgets/budget-queries'
import { useEndCategory } from '@/features/categories/category-mutations'
import type { Category } from '@/features/categories/category-queries'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { useEditBase } from '@/hooks/use-edit-base'
import { formatCalendarDate } from '@/lib/date'

/**
 * Remove a category: says beforehand which of the two will happen, from the database's own
 * answer (removal_deletes): deleted (it never counted and has no transactions) or ended from
 * the current period (past periods keep it, its transactions stay where they are). A group's
 * subcategories go with it. R-CATEGORY-072, R-CATEGORY-073, R-CATEGORY-095.
 */
// R-CATEGORY-052: which of the two happens, said before it does.
export function EndCategoryDialog({
  budgetId,
  category,
  liveCategory,
  subcategories,
  currentPeriod,
  onClose,
}: {
  budgetId: string
  category: Category | null
  liveCategory: Category | null | undefined
  subcategories: Category[]
  currentPeriod: PeriodSummary | null
  onClose: () => void
}) {
  return (
    <AlertDialog
      open={category !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <AlertDialogContent>
        {category && (
          <EndCategoryBody
            budgetId={budgetId}
            category={category}
            liveCategory={liveCategory}
            subcategories={subcategories}
            currentPeriod={currentPeriod}
            onClose={onClose}
          />
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}

function EndCategoryBody({
  budgetId,
  category: opened,
  liveCategory,
  subcategories,
  currentPeriod,
  onClose,
}: {
  budgetId: string
  category: Category
  liveCategory: Category | null | undefined
  subcategories: Category[]
  currentPeriod: PeriodSummary | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const removal = useEditBase(liveCategory === undefined ? opened : liveCategory)
  // What happens is the database's answer for the version on screen.
  const category = removal.live ?? removal.base ?? opened
  const end = useEndCategory(budgetId)
  const deletes = category.removal_deletes === true
  // Added in this period but with transactions: kept without a plan, never in force (void).
  const keptVoid = !deletes && currentPeriod !== null && category.first_seq >= currentPeriod.seq
  const from = currentPeriod ? formatCalendarDate(currentPeriod.start_date) : null

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {deletes
            ? t('categories.removeDeleteTitle', { name: category.name })
            : t('categories.removeEndTitle', { name: category.name })}
        </AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div className="flex flex-col gap-2" data-testid="end-category-outcome">
            <p>
              {deletes
                ? t('categories.removeDeletes')
                : keptVoid
                  ? t('categories.removeKeptVoid')
                  : from
                    ? t('categories.removeEnds', { date: from })
                    : t('categories.removeEndsNoPeriod')}
            </p>
            {!deletes && !keptVoid && category.has_transactions === true && (
              <p>{t('categories.removeKeepsTransactions')}</p>
            )}
            {subcategories.length > 0 && (
              <p>
                {t('categories.removeWithSubs', {
                  count: subcategories.length,
                  names: subcategories.map((sub) => sub.name).join(', '),
                })}
              </p>
            )}
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      {removal.changed && (
        <ChangedElsewhere
          kind="remove"
          onKeepMine={() => {
            removal.adopt()
            end.reset()
          }}
        />
      )}
      <SaveError error={end.error} changed={removal.changed} message={errorMessage} />
      <AlertDialogFooter>
        <AlertDialogCancel disabled={end.isPending}>{t('common.cancel')}</AlertDialogCancel>
        <Button
          variant="destructive"
          disabled={end.isPending || removal.changed}
          onClick={() =>
            end.mutate(
              { category, revision: (removal.base ?? category).revision },
              { onSuccess: onClose },
            )
          }
        >
          {end.isPending
            ? t('common.saving')
            : deletes
              ? t('categories.delete')
              : t('categories.end')}
        </Button>
      </AlertDialogFooter>
    </>
  )
}
