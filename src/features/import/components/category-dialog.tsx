import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LoadingState, ErrorState } from '@/components/states'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useCategoriesForDate } from '@/features/categories/category-queries'
import { formatCalendarDate } from '@/lib/date'

const LEAVE = '__leave__'

/**
 * The category for one row or for the selected rows: the leaves in force on the date (never
 * "to categorise", which is where a row without one waits), or no choice at all.
 */
export function CategoryDialog({
  budgetId,
  open,
  onOpenChange,
  date,
  count,
  current,
  onChoose,
}: {
  budgetId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The row's date, or the latest of the selected rows. */
  date: string
  /** How many rows it is for: 1 for a row. */
  count: number
  current: string | null
  onChoose: (categoryId: string | null) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const choices = useCategoriesForDate(budgetId, open ? date : '')
  const [value, setValue] = useState<string>(current ?? LEAVE)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setValue(current ?? LEAVE)
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {count > 1
              ? t('import.preview.categoryDialog.titleMany', { count })
              : t('import.preview.categoryDialog.title')}
          </DialogTitle>
          <DialogDescription>
            {count > 1
              ? t('import.preview.categoryDialog.helpMany', { date: formatCalendarDate(date) })
              : t('import.preview.categoryDialog.help', { date: formatCalendarDate(date) })}
          </DialogDescription>
        </DialogHeader>
        {choices.isError ? (
          <ErrorState error={choices.error} onRetry={() => void choices.refetch()} />
        ) : !choices.data ? (
          <LoadingState rows={4} />
        ) : (
          <RadioGroup
            value={value}
            onValueChange={setValue}
            aria-label={t('import.preview.category')}
            className="flex flex-col gap-2"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem id={`${id}-leave`} value={LEAVE} />
              <Label htmlFor={`${id}-leave`} className="font-normal">
                {t('import.preview.categoryDialog.leave')}
              </Label>
            </div>
            {choices.data.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t('import.preview.categoryDialog.none')}
              </p>
            )}
            {choices.data.map((choice) => (
              <div key={choice.category_id} className="flex items-center gap-2">
                <RadioGroupItem id={`${id}-${choice.category_id}`} value={choice.category_id} />
                <Label htmlFor={`${id}-${choice.category_id}`} className="font-normal">
                  {choice.parent_name ? `${choice.parent_name} › ${choice.name}` : choice.name}
                </Label>
              </div>
            ))}
          </RadioGroup>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={!choices.data}
            onClick={() => {
              onChoose(value === LEAVE ? null : value)
              onOpenChange(false)
            }}
          >
            {t('import.preview.categoryDialog.apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
