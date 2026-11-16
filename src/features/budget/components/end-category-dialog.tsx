import { useTranslation } from 'react-i18next'

import { TriangleAlertIcon } from 'lucide-react'
import { useId, useState } from 'react'

import { ChangedElsewhere, GoneElsewhere, SaveError } from '@/components/changed-elsewhere'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useRecord } from '@/features/budgets/record-queries'
import { useRecordViews } from '@/features/budgets/record-views'
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
import { CategoryInUse } from '@/features/budget/components/category-in-use'
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
  subcategories,
  periods,
  currentPeriod,
  onClose,
}: {
  budgetId: string
  category: Category | null
  subcategories: Category[]
  periods: PeriodSummary[]
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
            subcategories={subcategories}
            periods={periods}
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
  subcategories,
  periods,
  currentPeriod,
  onClose,
}: {
  budgetId: string
  category: Category
  subcategories: Category[]
  periods: PeriodSummary[]
  currentPeriod: PeriodSummary | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const views = useRecordViews()
  const id = useId()
  const live = useRecord('category_overview', budgetId, opened.id)
  const removal = useEditBase(opened, live, views.category, (record) => record.is_active !== true)
  // What happens is the database's answer for the version on screen.
  const category = live ?? removal.base ?? opened
  const end = useEndCategory(budgetId)
  // R-CATEGORY-052: from an earlier period too, as an explicit correction (like incomes).
  const correctable = periods.filter(
    (period) => !period.is_current && period.seq >= category.first_seq,
  )
  const [correct, setCorrect] = useState(false)
  const [fromPeriodId, setFromPeriodId] = useState(correctable[0]?.id ?? '')
  const deletes = !correct && category.removal_deletes === true
  // Added in this period but with transactions: kept without a plan, never in force (void).
  const keptVoid =
    !correct && !deletes && currentPeriod !== null && category.first_seq >= currentPeriod.seq
  const from = currentPeriod ? formatCalendarDate(currentPeriod.start_date) : null
  // R-CATEGORY-120: refused while a subscription or debt in force uses it, from now and from
  // any earlier period alike (in force now means in force from there on): nothing to offer.
  const inUse = category.in_use === true
  const blocked = removal.changed || removal.gone || inUse

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {inUse
            ? t('categories.inUse.cannotTitle', { name: category.name })
            : deletes
              ? t('categories.removeDeleteTitle', { name: category.name })
              : t('categories.removeEndTitle', { name: category.name })}
        </AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div className="flex flex-col gap-2" data-testid="end-category-outcome">
            {inUse ? (
              <p>{t('categories.inUse.description')}</p>
            ) : (
              <>
                <p>
                  {correct
                    ? t('categories.removeFromEarlier')
                    : deletes
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
              </>
            )}
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      {correctable.length > 0 && !inUse && (
        <div className="flex flex-col gap-3 rounded-lg border p-3">
          <Field orientation="horizontal">
            <Checkbox
              id={id}
              checked={correct}
              onCheckedChange={(checked) => setCorrect(checked === true)}
            />
            <FieldContent>
              <FieldLabel htmlFor={id}>{t('categories.removeEarlierLabel')}</FieldLabel>
              <FieldDescription>{t('income.correction.help')}</FieldDescription>
            </FieldContent>
          </Field>
          {correct && (
            <>
              <Field>
                <FieldLabel htmlFor={`${id}-period`}>
                  {t('income.correction.removeFrom')}
                </FieldLabel>
                <Select value={fromPeriodId} onValueChange={setFromPeriodId}>
                  <SelectTrigger id={`${id}-period`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {correctable.map((period) => (
                      <SelectItem key={period.id} value={period.id}>
                        {t('income.fields.fromPeriod', {
                          start: formatCalendarDate(period.start_date),
                          end: formatCalendarDate(period.end_date),
                        })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Alert variant="destructive">
                <TriangleAlertIcon aria-hidden />
                <AlertDescription>{t('categories.correctionWarning')}</AlertDescription>
              </Alert>
            </>
          )}
        </div>
      )}
      {inUse && (
        <CategoryInUse budgetId={budgetId} category={category} subcategories={subcategories} />
      )}
      {removal.gone && <GoneElsewhere ended={live !== null && live !== undefined} />}
      {removal.changed && (
        <ChangedElsewhere
          kind="remove"
          changes={removal.theirs}
          onKeepMine={() => {
            removal.adopt()
            end.reset()
          }}
        />
      )}
      <SaveError error={end.error} hidden={blocked} message={errorMessage} />
      <AlertDialogFooter>
        <AlertDialogCancel disabled={end.isPending}>{t('common.cancel')}</AlertDialogCancel>
        <Button
          variant="destructive"
          disabled={end.isPending || blocked}
          onClick={() =>
            end.mutate(
              {
                category,
                revision: (removal.base ?? category).revision,
                fromPeriodId: correct ? fromPeriodId || null : null,
                keptVoid,
              },
              { onSuccess: onClose },
            )
          }
        >
          {end.isPending
            ? t('common.saving')
            : deletes
              ? t('categories.delete')
              : correct
                ? t('categories.removeEarlier')
                : t('categories.end')}
        </Button>
      </AlertDialogFooter>
    </>
  )
}
