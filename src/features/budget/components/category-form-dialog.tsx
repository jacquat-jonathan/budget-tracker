import { zodResolver } from '@hookform/resolvers/zod'
import { InfoIcon, TriangleAlertIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

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
import { TextField } from '@/features/auth/components/text-field'
import type { PeriodSummary } from '@/features/budgets/budget-queries'
import { useCreateCategory, useUpdateCategory } from '@/features/categories/category-mutations'
import { CADENCES, type Category } from '@/features/categories/category-queries'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { useRecord } from '@/features/budgets/record-queries'
import { useRecordViews } from '@/features/budgets/record-views'
import { useConcurrentForm } from '@/hooks/use-concurrent-form'
import { useEditBase } from '@/hooks/use-edit-base'
import { formatCalendarDate } from '@/lib/date'
import { MIN_EXPECTATION_RAPPEN, nameSchema, rappenSchema } from '@/lib/form-schemas'
import { formatMoney } from '@/lib/money'

const categorySchema = z.object({
  name: nameSchema,
  amount: rappenSchema({ min: MIN_EXPECTATION_RAPPEN, tooSmall: 'validation.amountNegative' }),
  cadence: z.enum(['monthly', 'yearly']),
  /** "" for the current period. */
  fromPeriodId: z.string(),
  /** Edit only: apply the amount from an earlier period, an explicit correction. */
  correct: z.boolean(),
})
type CategoryInput = z.input<typeof categorySchema>
type CategoryValues = z.output<typeof categorySchema>

interface CategoryFormDialogProps {
  budgetId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A new subcategory of this category; a new top-level category when null. */
  parent: Category | null
  /** The category to edit; a new one when absent. */
  category?: Category
  periods: PeriodSummary[]
  currentPeriod: PeriodSummary | null
}

/** Add or edit a category or subcategory. Its form mounts only while open. */
export function CategoryFormDialog(props: CategoryFormDialogProps) {
  const { t } = useTranslation()
  const { open, onOpenChange, category, parent } = props
  const title = category
    ? category.parent_id
      ? t('categories.editSubTitle')
      : t('categories.editTitle')
    : parent
      ? t('categories.addSubTitle', { name: parent.name })
      : t('categories.addTitle')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-8">{title}</DialogTitle>
          <DialogDescription>
            {category ? t('categories.editDescription') : t('categories.addDescription')}
          </DialogDescription>
        </DialogHeader>
        {open && <CategoryForm {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function CategoryForm({
  budgetId,
  onOpenChange,
  parent,
  category: opened,
  periods,
  currentPeriod,
}: CategoryFormDialogProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const close = () => onOpenChange(false)
  const views = useRecordViews()
  // R-CONCURRENCY-091: saved over the version opened; the record is read by its id.
  const live = useRecord('category_overview', budgetId, opened?.id)
  const edit = useEditBase(opened, live, views.category)
  const category = edit.base
  const isGroup = category?.is_group === true

  const valuesOf = (from: Category | undefined): CategoryInput => ({
    name: from?.name ?? '',
    amount: from ? (from.amount ?? 0) : null,
    cadence: from?.cadence ?? 'monthly',
    fromPeriodId: '',
    correct: false,
  })
  const form = useForm<CategoryInput, unknown, CategoryValues>({
    // A group has no expectation: its amount stays 0 in the form and is never sent.
    resolver: zodResolver(categorySchema),
    defaultValues: valuesOf(category),
  })
  const [correct, cadence] = useWatch({ control: form.control, name: ['correct', 'cadence'] })

  const create = useCreateCategory(budgetId, { onDone: close })
  const update = useUpdateCategory(budgetId, { onDone: close })
  const mutation = category ? update : create
  const sync = useConcurrentForm(form, edit, valuesOf, () => update.reset(), {
    error: update.error,
    sent: update.variables?.revision,
    submit: () => void onSubmit(),
  })

  // Periods are identified by their dates; a subcategory never before its group.
  const periodLabel = (period: PeriodSummary) =>
    t('income.fields.fromPeriod', {
      start: formatCalendarDate(period.start_date),
      end: formatCalendarDate(period.end_date),
    })
  const earlier = periods.filter(
    (period) => !period.is_current && (!parent || period.seq >= parent.first_seq),
  )
  const correctable = category
    ? periods.filter((period) => !period.is_current && period.seq >= category.first_seq)
    : []

  const onSubmit = form.handleSubmit((values) => {
    const done = category
      ? update.mutateAsync({
          category,
          revision: category.revision,
          name: values.name,
          amount: isGroup ? null : values.amount,
          cadence: isGroup ? null : values.cadence,
          fromPeriodId: values.correct ? values.fromPeriodId || null : null,
        })
      : create.mutateAsync({
          name: values.name,
          parentId: parent?.id ?? null,
          amount: values.amount,
          cadence: values.cadence,
          fromPeriodId: values.fromPeriodId || null,
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
        {parent && !category && <FirstSubcategoryNotice parent={parent} />}
        <TextField
          control={form.control}
          name="name"
          label={t('categories.fields.name')}
          placeholder={
            parent
              ? t('categories.fields.subNamePlaceholder')
              : t('categories.fields.namePlaceholder')
          }
          autoComplete="off"
          autoFocus
        />
        {isGroup ? (
          <Alert>
            <InfoIcon aria-hidden />
            <AlertDescription>{t('categories.groupHasNoAmount')}</AlertDescription>
          </Alert>
        ) : (
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
              description={cadence === 'yearly' ? t('categories.fields.yearlyHelp') : undefined}
            />
          </>
        )}
        {!category && earlier.length > 0 && (
          <SelectField
            control={form.control}
            name="fromPeriodId"
            label={t('categories.fields.from')}
            description={t('categories.fields.fromHelp')}
            options={[
              { value: '', label: t('income.fields.fromCurrent') },
              ...earlier.map((period) => ({ value: period.id, label: periodLabel(period) })),
            ]}
          />
        )}
        {category && !isGroup && correctable.length > 0 && (
          <CorrectionFields
            correct={correct}
            onToggle={(next) => {
              form.setValue('correct', next)
              form.setValue('fromPeriodId', next ? (correctable[0]?.id ?? '') : '')
            }}
            select={
              <SelectField
                control={form.control}
                name="fromPeriodId"
                label={t('income.correction.from')}
                options={correctable.map((period) => ({
                  value: period.id,
                  label: periodLabel(period),
                }))}
              />
            }
          />
        )}
        {!isGroup && (
          <Alert>
            <InfoIcon aria-hidden />
            <AlertDescription>
              {correct
                ? t('categories.correctionAppliesFrom')
                : category
                  ? currentPeriod
                    ? t('categories.editAppliesFrom', {
                        date: formatCalendarDate(currentPeriod.start_date),
                      })
                    : t('income.editAppliesFromNoPeriod')
                  : t('categories.addAppliesFrom')}
            </AlertDescription>
          </Alert>
        )}
        <DialogFooter className="sticky -bottom-4 z-10 bg-popover">
          <Button type="button" variant="outline" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={mutation.isPending || sync.pending !== null || edit.gone}>
            {mutation.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  )
}

/**
 * R-CATEGORY-092: the first subcategory turns the category into a group; what it held (its
 * amount, its transactions) moves to a subcategory "Other". Said before it happens.
 */
// R-CATEGORY-051: said before the first subcategory is saved.
function FirstSubcategoryNotice({ parent }: { parent: Category }) {
  const { t } = useTranslation()
  if (parent.is_group) return null
  const holds = (parent.amount ?? 0) > 0 || parent.has_transactions === true
  return (
    <Alert data-testid="first-subcategory">
      <TriangleAlertIcon aria-hidden />
      <AlertDescription>
        {holds
          ? t('categories.firstSub.moves', {
              name: parent.name,
              other: t('categories.otherName'),
              amount: formatMoney(parent.monthly_amount ?? 0),
            })
          : t('categories.firstSub.becomesGroup', { name: parent.name })}
      </AlertDescription>
    </Alert>
  )
}

// R-CATEGORY-053: corrections of the past are explicit, off by default, with a warning.
function CorrectionFields({
  correct,
  onToggle,
  select,
}: {
  correct: boolean
  onToggle: (next: boolean) => void
  select: ReactNode
}) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <Field orientation="horizontal">
        <Checkbox
          id={id}
          checked={correct}
          onCheckedChange={(checked) => onToggle(checked === true)}
        />
        <FieldContent>
          <FieldLabel htmlFor={id}>{t('income.correction.label')}</FieldLabel>
          <FieldDescription>{t('income.correction.help')}</FieldDescription>
        </FieldContent>
      </Field>
      {correct && (
        <>
          {select}
          <Alert variant="destructive">
            <TriangleAlertIcon aria-hidden />
            <AlertDescription>{t('categories.correctionWarning')}</AlertDescription>
          </Alert>
        </>
      )}
    </div>
  )
}
