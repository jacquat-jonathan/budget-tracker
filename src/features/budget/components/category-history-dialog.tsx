import { zodResolver } from '@hookform/resolvers/zod'
import { InfoIcon, TriangleAlertIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { useOlderPeriodsOption } from '@/features/budgets/older-periods'
import { ConcurrentNotices } from '@/components/changed-elsewhere'
import { MoneyField } from '@/components/form/money-field'
import { SegmentedField } from '@/components/form/segmented-field'
import { SelectField } from '@/components/form/select-field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import type { PeriodSummary } from '@/features/budgets/budget-queries'
import { useRecord } from '@/features/budgets/record-queries'
import { useRecordViews } from '@/features/budgets/record-views'
import { useExtendCategory, useRestoreCategory } from '@/features/categories/category-mutations'
import { CADENCES, type Category } from '@/features/categories/category-queries'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { useConcurrentForm } from '@/hooks/use-concurrent-form'
import { useEditBase } from '@/hooks/use-edit-base'
import { formatCalendarDate } from '@/lib/date'
import { MIN_EXPECTATION_RAPPEN, rappenSchema } from '@/lib/form-schemas'

/**
 * A category's validity, corrected or resumed (R-CATEGORY-100, R-CATEGORY-101):
 *
 * - `extend`: an existing category counts from an earlier period (an explicit correction:
 *   those periods' plans and totals change), for older transactions that need it.
 * - `restore`: an ended category in force again: from the current period by default, with
 *   nothing expected in the periods between its end and now (their totals do not change);
 *   or, as an explicit correction, from the period it ended in, as if it had never ended.
 */
// R-CATEGORY-054: each said beforehand, the corrections with their warning.
export type HistoryMode = 'extend' | 'restore'

const schema = z.object({
  amount: rappenSchema({ min: MIN_EXPECTATION_RAPPEN, tooSmall: 'validation.amountNegative' }),
  cadence: z.enum(['monthly', 'yearly']),
  fromPeriodId: z.string(),
})
type Input = z.input<typeof schema>
type Values = z.output<typeof schema>

interface Props {
  budgetId: string
  mode: HistoryMode
  category: Category | null
  /** Its group, for a subcategory. */
  parent: Category | null
  periods: PeriodSummary[]
  currentPeriod: PeriodSummary | null
  onClose: () => void
}

export function CategoryHistoryDialog(props: Props) {
  const { t } = useTranslation()
  const { category, mode, onClose } = props
  return (
    <Dialog
      open={category !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        {category && (
          <>
            <DialogHeader>
              <DialogTitle className="pr-8">
                {mode === 'extend'
                  ? t('categories.extendTitle', { name: category.name })
                  : t('categories.restoreTitle', { name: category.name })}
              </DialogTitle>
              <DialogDescription>
                {mode === 'extend'
                  ? t('categories.extendDescription')
                  : t('categories.restoreDescription')}
              </DialogDescription>
            </DialogHeader>
            <HistoryForm {...props} category={category} />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function HistoryForm({
  budgetId,
  mode,
  category: opened,
  parent,
  periods,
  currentPeriod,
  onClose,
}: Props & { category: Category }) {
  const { t } = useTranslation()
  const olderPeriods = useOlderPeriodsOption(budgetId)
  const errorMessage = useErrorMessage()
  const views = useRecordViews()
  const id = useId()
  const live = useRecord('category_overview', budgetId, opened.id)
  const edit = useEditBase(opened, live, views.category)
  const category = edit.base ?? opened
  const isGroup = category.is_group
  const fmt = formatCalendarDate
  const label = (period: PeriodSummary) =>
    t('income.fields.fromPeriod', { start: fmt(period.start_date), end: fmt(period.end_date) })

  // extend: the periods before it starts (a subcategory never before its group).
  const earlier = periods.filter(
    (period) => period.seq < category.first_seq && (!parent || period.seq >= parent.first_seq),
  )
  // restore as a correction: the period it ended in. When that is the current period (a
  // category removed in the period it was added, kept void for its transactions), the
  // default restore already plans it from there: there is no separate correction.
  const endedIn = periods.find((period) => period.seq === category.end_seq) ?? null
  const endedThisPeriod = endedIn !== null && endedIn.is_current === true
  // In an ended budget only the correction can restore.
  const [asCorrection, setAsCorrection] = useState(mode === 'restore' && currentPeriod === null)
  const groupEnded = parent !== null && parent.end_seq !== null

  const valuesOf = (from: Category): Input => ({
    amount: from.amount ?? 0,
    cadence: from.cadence ?? 'monthly',
    fromPeriodId: mode === 'extend' ? (earlier.at(-1)?.id ?? '') : '',
  })
  const form = useForm<Input, unknown, Values>({
    resolver: zodResolver(schema),
    defaultValues: valuesOf(category),
  })
  const [cadence, fromPeriodId] = useWatch({
    control: form.control,
    name: ['cadence', 'fromPeriodId'],
  })
  const close = onClose
  const extend = useExtendCategory(budgetId, { onDone: close })
  const restore = useRestoreCategory(budgetId, { onDone: close })
  const mutation = mode === 'extend' ? extend : restore
  const sync = useConcurrentForm(form, edit, valuesOf, () => mutation.reset())
  const chosen = periods.find((period) => period.id === fromPeriodId)

  // Someone else restored it first: there is nothing left to restore.
  const restoredElsewhere =
    mode === 'restore' && live !== null && live !== undefined && live.end_seq === null
  const blocked =
    restoredElsewhere ||
    (mode === 'extend' && earlier.length === 0) ||
    (mode === 'restore' && (groupEnded || (asCorrection && !endedIn)))

  const onSubmit = form.handleSubmit((values) => {
    const amount = isGroup ? null : values.amount
    const cadenceValue = isGroup ? null : values.cadence
    const done =
      mode === 'extend'
        ? extend.mutateAsync({
            category,
            revision: category.revision,
            fromPeriodId: values.fromPeriodId,
            amount,
            cadence: cadenceValue,
          })
        : restore.mutateAsync({
            category,
            revision: category.revision,
            fromPeriodId: asCorrection ? (endedIn?.id ?? null) : null,
            amount,
            cadence: cadenceValue,
          })
    return done.catch(() => undefined)
  })

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate>
      <FieldGroup>
        <ConcurrentNotices
          gone={edit.gone}
          pending={sync.pending}
          updated={sync.updated}
          onUseTheirs={sync.useTheirs}
          onKeepMine={sync.keepMine}
          error={mutation.error}
          message={errorMessage}
        />
        {mode === 'extend' && earlier.length === 0 && (
          <Alert>
            <InfoIcon aria-hidden />
            <AlertDescription>
              {parent
                ? t('categories.extendNoneSub', { group: parent.name })
                : t('categories.extendNone')}
            </AlertDescription>
          </Alert>
        )}
        {restoredElsewhere && (
          <Alert data-testid="restored-elsewhere">
            <InfoIcon aria-hidden />
            <AlertDescription>
              {t('categories.restoredElsewhere', { name: live.name })}
            </AlertDescription>
          </Alert>
        )}
        {mode === 'restore' && groupEnded && (
          <Alert>
            <InfoIcon aria-hidden />
            <AlertDescription>
              {t('categories.restoreGroupFirst', { group: parent.name })}
            </AlertDescription>
          </Alert>
        )}
        {mode === 'extend' && earlier.length > 0 && (
          <SelectField
            control={form.control}
            name="fromPeriodId"
            more={olderPeriods}
            label={t('categories.extendFrom')}
            options={earlier.map((period) => ({ value: period.id, label: label(period) }))}
          />
        )}
        {!isGroup && !blocked && (
          <>
            <SegmentedField
              control={form.control}
              name="cadence"
              label={t('categories.fields.cadence')}
              options={CADENCES.map((value) => ({
                value,
                label: t(`categories.cadence.${value}`),
              }))}
            />
            <MoneyField
              control={form.control}
              name="amount"
              label={
                cadence === 'yearly'
                  ? t('categories.fields.amountYearly')
                  : t('categories.fields.amountMonthly')
              }
              description={
                mode === 'extend'
                  ? t('categories.extendAmountHelp')
                  : t('categories.restoreAmountHelp')
              }
            />
          </>
        )}
        {mode === 'restore' && !groupEnded && endedIn && !endedThisPeriod && (
          <div className="flex flex-col gap-3 rounded-lg border p-3">
            <Field orientation="horizontal">
              <Checkbox
                id={id}
                checked={asCorrection}
                disabled={currentPeriod === null}
                onCheckedChange={(checked) => setAsCorrection(checked === true)}
              />
              <FieldContent>
                <FieldLabel htmlFor={id}>{t('categories.restoreAsCorrection')}</FieldLabel>
                <FieldDescription>
                  {currentPeriod === null
                    ? t('categories.restoreEndedBudget')
                    : t('income.correction.help')}
                </FieldDescription>
              </FieldContent>
            </Field>
          </div>
        )}
        {!blocked && (
          <Alert
            variant={mode === 'extend' || asCorrection ? 'destructive' : 'default'}
            data-testid="history-outcome"
          >
            {mode === 'extend' || asCorrection ? (
              <TriangleAlertIcon aria-hidden />
            ) : (
              <InfoIcon aria-hidden />
            )}
            <AlertDescription>
              {mode === 'extend'
                ? chosen
                  ? t('categories.extendOutcome', { start: fmt(chosen.start_date) })
                  : null
                : asCorrection && endedIn
                  ? t('categories.restoreCorrectionOutcome', {
                      start: fmt(endedIn.start_date),
                      end: fmt(endedIn.end_date),
                    })
                  : currentPeriod && endedThisPeriod
                    ? t('categories.restoreThisPeriodOutcome', {
                        start: fmt(currentPeriod.start_date),
                      })
                    : currentPeriod
                      ? t('categories.restoreOutcome', { start: fmt(currentPeriod.start_date) })
                      : null}
              {isGroup && mode === 'restore' && (
                <p className="mt-1">{t('categories.restoreGroupNote')}</p>
              )}
            </AlertDescription>
          </Alert>
        )}
        <DialogFooter className="sticky -bottom-4 z-10 bg-popover sm:flex-wrap">
          <Button type="button" variant="outline" onClick={close}>
            {restoredElsewhere ? t('ui.close') : t('common.cancel')}
          </Button>
          <Button
            type="submit"
            disabled={mutation.isPending || blocked || sync.pending !== null || edit.gone}
          >
            {mutation.isPending
              ? t('common.saving')
              : mode === 'extend'
                ? t('categories.extend')
                : t('categories.restore')}
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  )
}
