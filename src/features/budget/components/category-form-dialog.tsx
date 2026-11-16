import { zodResolver } from '@hookform/resolvers/zod'
import { InfoIcon, TriangleAlertIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { useOlderPeriodsOption } from '@/features/budgets/older-periods'
import { ConcurrentNotices } from '@/components/changed-elsewhere'
import { NothingToSave } from '@/components/nothing-to-save'
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
import { CorrectionReach } from '@/features/budgets/correction-reach'
import { useStartFrom, useTermsAt } from '@/features/budgets/terms-at'
import { useCreateCategory, useUpdateCategory } from '@/features/categories/category-mutations'
import { CADENCES, type Category } from '@/features/categories/category-queries'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { useClientId } from '@/hooks/use-client-id'
import { useRecord } from '@/features/budgets/record-queries'
import { useRecordViews } from '@/features/budgets/record-views'
import { useConcurrentForm } from '@/hooks/use-concurrent-form'
import { isRecordChanged, useEditBase } from '@/hooks/use-edit-base'
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
  const olderPeriods = useOlderPeriodsOption(budgetId)
  // A refused save over a change this form does not show says so (the shown fields that
  // changed have their own notice), in the save's own words.
  const errorMessage = useErrorMessage({
    record_changed: 'corrections.changedNotShown',
    category_to_categorise: opened
      ? 'import.toCategorise.errors.expectation'
      : 'import.toCategorise.errors.subcategory',
  })
  const close = () => onOpenChange(false)
  const views = useRecordViews()
  // R-CONCURRENCY-091: saved over the version opened; the record is read by its id.
  const live = useRecord('category_overview', budgetId, opened?.id)
  // R-CONCURRENCY-091: removed from the current period by someone else: nothing to save here.
  const endedElsewhere = (record: Category) =>
    opened?.is_active === true && record.is_active !== true
  const edit = useEditBase(opened, live, views.category, endedElsewhere)
  const category = edit.base
  // "To categorise" takes no expectation either: only its name changes (R-CATEGORY-200).
  const isGroup = category?.is_group === true || category?.is_to_categorise === true
  // Someone else added its first subcategory: it is now a group, with no amount of its own.
  const becameGroup = opened?.is_group === false && live?.is_group === true

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
  const request = useClientId()
  const update = useUpdateCategory(budgetId, { onDone: close })
  const mutation = category ? update : create
  const sync = useConcurrentForm(form, edit, valuesOf, () => update.reset(), {
    error: update.error,
    // A group has no amount of its own: the fields are not its terms.
    controls: isGroup
      ? ['correct', 'fromPeriodId', 'amount', 'cadence']
      : ['correct', 'fromPeriodId'],
    current: () => (correcting ? startValues : null),
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
  // A correction starts from the expectation in force in the period chosen (database's rows).
  const fromPeriodId = useWatch({ control: form.control, name: 'fromPeriodId' })
  const fromPeriod = periods.find((period) => period.id === fromPeriodId) ?? null
  const correcting = category !== undefined && !isGroup && correct && fromPeriod !== null
  const termsAt = useTermsAt('category', budgetId, category?.id, correcting ? fromPeriod.id : null)
  const periodTerms = correcting ? (termsAt.data?.terms ?? null) : null
  // Not in force in that period: nothing to correct there, nothing to save.
  const notInForce = correcting && termsAt.data?.inForce === false
  const base = category ? (correcting ? periodTerms : category) : null
  // The terms the form starts from: now, or the chosen period's (read from the database).
  const startValues =
    base && category && !isGroup
      ? { amount: base.amount ?? 0, cadence: base.cadence ?? 'monthly' }
      : null
  const start = useStartFrom(
    form,
    correcting ? `period-${fromPeriod.id}-${termsAt.data?.termsFromPeriodId ?? ''}` : 'now',
    startValues,
  )

  const onSubmit = form.handleSubmit((values) => {
    if (correcting && (!periodTerms || notInForce)) return
    const done = category
      ? update.mutateAsync({
          category,
          base: base ?? category,
          revision: category.revision,
          name: values.name,
          amount: isGroup ? null : values.amount,
          cadence: isGroup ? null : values.cadence,
          fromPeriodId: values.correct ? values.fromPeriodId || null : null,
        })
      : create
          .mutateAsync({
            name: values.name,
            parentId: parent?.id ?? null,
            amount: values.amount,
            cadence: values.cadence,
            fromPeriodId: values.fromPeriodId || null,
            clientId: request.id,
          })
          .then(request.renew, (error: unknown) => {
            request.afterFailure(error)
            throw error
          })
    return done.catch(() => undefined)
  })

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate>
      <FieldGroup>
        {becameGroup && !edit.gone && (
          <Alert data-testid="became-group">
            <InfoIcon aria-hidden />
            <AlertDescription>
              {t('categories.becameGroup', {
                name: live.name,
                amount: formatMoney(
                  typeof form.getValues('amount') === 'number'
                    ? (form.getValues('amount') as number)
                    : 0,
                ),
              })}
            </AlertDescription>
          </Alert>
        )}
        <ConcurrentNotices
          adding={!category}
          gone={edit.gone}
          ended={live !== null && live !== undefined}
          pending={sync.pending}
          updated={sync.updated}
          recovered={sync.recovered}
          onUseTheirs={sync.useTheirs}
          onKeepMine={sync.keepMine}
          // The first subcategory has its own notice above: the refused save needs no other.
          error={becameGroup && isRecordChanged(mutation.error) ? null : mutation.error}
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
        {category && !isGroup && correctable.length > 0 && (
          <CorrectionFields
            correct={correct}
            reach={
              <CorrectionReach
                periods={periods}
                periodId={fromPeriodId}
                terms={termsAt.data}
                pending={termsAt.isPending}
                error={termsAt.isError ? errorMessage(termsAt.error) : null}
                kept={start.kept}
                views={edit.describe(category)}
              />
            }
            onToggle={(next) => {
              form.setValue('correct', next)
              form.setValue('fromPeriodId', next ? (correctable[0]?.id ?? '') : '')
            }}
            select={
              <SelectField
                control={form.control}
                name="fromPeriodId"
                more={olderPeriods}
                label={t('corrections.period')}
                options={correctable.map((period) => ({
                  value: period.id,
                  label: periodLabel(period),
                }))}
              />
            }
          />
        )}
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
            more={olderPeriods}
            label={t('categories.fields.from')}
            description={t('categories.fields.fromHelp')}
            options={[
              { value: '', label: t('income.fields.fromCurrent') },
              ...earlier.map((period) => ({ value: period.id, label: periodLabel(period) })),
            ]}
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
        <NothingToSave show={update.data === false && !update.isPending} />
        <DialogFooter className="sticky -bottom-4 z-10 bg-popover">
          <Button type="button" variant="outline" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            disabled={mutation.isPending || sync.pending !== null || edit.gone || notInForce}
          >
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
  // Subscriptions and debts on it move too (D-179): said with the rest.
  const linked = parent.in_use === true || (parent.committed_amount ?? 0) > 0
  const holds = (parent.amount ?? 0) > 0 || parent.has_transactions === true || linked
  return (
    <Alert data-testid="first-subcategory">
      <TriangleAlertIcon aria-hidden />
      <AlertDescription>
        <p>
          {holds
            ? t('categories.firstSub.moves', {
                name: parent.name,
                other: t('categories.otherName'),
                amount: formatMoney(parent.monthly_amount ?? 0),
              })
            : t('categories.firstSub.becomesGroup', { name: parent.name })}
        </p>
        {linked && (
          <p>{t('categories.firstSub.movesLinks', { other: t('categories.otherName') })}</p>
        )}
      </AlertDescription>
    </Alert>
  )
}

// R-CATEGORY-053: corrections of the past are explicit, off by default, with a warning.
function CorrectionFields({
  correct,
  onToggle,
  select,
  reach,
}: {
  correct: boolean
  onToggle: (next: boolean) => void
  select: ReactNode
  reach: ReactNode
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
          {reach}
          <Alert variant="destructive">
            <TriangleAlertIcon aria-hidden />
            <AlertDescription>{t('categories.correctionWarning')}</AlertDescription>
          </Alert>
        </>
      )}
    </div>
  )
}
