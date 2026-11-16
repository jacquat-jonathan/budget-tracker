import { zodResolver } from '@hookform/resolvers/zod'
import { InfoIcon } from 'lucide-react'
import { useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { ConcurrentNotices } from '@/components/changed-elsewhere'
import { CorrectionToggle } from '@/components/form/correction-toggle'
import { MoneyField } from '@/components/form/money-field'
import { SelectField } from '@/components/form/select-field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldGroup } from '@/components/ui/field'
import { TextField } from '@/features/auth/components/text-field'
import type { PeriodSummary } from '@/features/budgets/budget-queries'
import { useCategoriesForDate } from '@/features/categories/category-queries'
import { useCreateDebt, useUpdateDebt } from '@/features/debts/debt-mutations'
import { useDebtRecord, type Debt } from '@/features/debts/debt-queries'
import { useSubscriptionViews } from '@/features/subscriptions/subscription-views'
import {
  CategorySelectField,
  type CategoryChoice,
} from '@/features/transactions/components/category-select-field'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { useConcurrentForm } from '@/hooks/use-concurrent-form'
import { useEditBase } from '@/hooks/use-edit-base'
import { formatCalendarDate } from '@/lib/date'
import { nameSchema, rappenSchema } from '@/lib/form-schemas'
import { formatInterestRate, parseInterestRate } from '@/lib/interest-rate'

const debtSchema = z.object({
  name: nameSchema,
  categoryId: z.string().refine((value) => value !== '', { error: 'validation.categoryRequired' }),
  principal: rappenSchema(),
  rate: z
    .string()
    .refine((value) => parseInterestRate(value) !== null, { error: 'validation.interestRate' })
    .transform((value) => parseInterestRate(value) ?? '0'),
  monthlyPayment: rappenSchema({ min: 0, tooSmall: 'validation.amountNegative' }),
  fromPeriodId: z.string(),
  correct: z.boolean(),
})
type Input = z.input<typeof debtSchema>
type Values = z.output<typeof debtSchema>

interface Props {
  budgetId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  debt?: Debt
  periods: PeriodSummary[]
  currentPeriod: PeriodSummary | null
  /** After a new debt is saved: its id (to open it). */
  onCreated?: (id: string) => void
}

export function DebtFormDialog(props: Props) {
  const { t } = useTranslation()
  const { open, onOpenChange, debt } = props
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-8">
            {debt ? t('debts.editTitle') : t('debts.addTitle')}
          </DialogTitle>
          <DialogDescription>
            {debt ? t('debts.editDescription') : t('debts.addDescription')}
          </DialogDescription>
        </DialogHeader>
        {open && <DebtForm {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function DebtForm({
  budgetId,
  onOpenChange,
  debt: opened,
  periods,
  currentPeriod,
  onCreated,
}: Props) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const close = () => onOpenChange(false)
  const views = useSubscriptionViews()
  const live = useDebtRecord(budgetId, opened?.id)
  const edit = useEditBase(opened, live, views.debt)
  const debt = edit.base

  const valuesOf = (from: Debt | undefined): Input => ({
    name: from?.name ?? '',
    categoryId: from?.category_id ?? '',
    principal: from?.principal ?? null,
    rate: from && from.interest_rate !== 0 ? formatInterestRate(from.interest_rate) : '',
    monthlyPayment: from?.monthly_payment ?? null,
    fromPeriodId: '',
    correct: false,
  })
  const form = useForm<Input, unknown, Values>({
    resolver: zodResolver(debtSchema),
    defaultValues: valuesOf(debt),
  })
  const [fromPeriodId, correct] = useWatch({
    control: form.control,
    name: ['fromPeriodId', 'correct'],
  })
  const create = useCreateDebt(budgetId, {
    onDone: (id) => {
      close()
      onCreated?.(id)
    },
  })
  const update = useUpdateDebt(budgetId, { onDone: close })
  const mutation = debt ? update : create
  const sync = useConcurrentForm(form, edit, valuesOf, () => update.reset())

  const label = (period: PeriodSummary) =>
    t('income.fields.fromPeriod', {
      start: formatCalendarDate(period.start_date),
      end: formatCalendarDate(period.end_date),
    })
  const earlier = periods.filter((period) => !period.is_current)
  const correctable = debt
    ? periods.filter(
        (period) =>
          !period.is_current &&
          period.seq >= debt.first_seq &&
          (debt.end_seq === null || period.seq < debt.end_seq),
      )
    : []
  const fromPeriod = periods.find((period) => period.id === fromPeriodId) ?? null
  // A new debt's category is one in force in its first period; an edited one's, from now on.
  const effective = (debt ? null : fromPeriod) ?? currentPeriod ?? periods[0] ?? null
  const choices = useCategoriesForDate(budgetId, effective?.start_date ?? '')
  const options = useMemo((): CategoryChoice[] => {
    const list: CategoryChoice[] = choices.data ?? []
    if (!debt || list.some((choice) => choice.category_id === debt.category_id)) return list
    return [
      ...list,
      {
        category_id: debt.category_id,
        parent_id: debt.parent_category_id,
        name: debt.category_name ?? '',
        parent_name: debt.parent_category_name,
        display_order: list.length,
        kept: true,
      },
    ]
  }, [choices.data, debt])
  const principalLocked = debt?.has_history === true

  const onSubmit = form.handleSubmit((values) => {
    const done = debt
      ? update.mutateAsync({
          debt,
          name: values.name,
          categoryId: values.categoryId,
          principal: values.principal,
          rate: values.rate,
          monthlyPayment: values.monthlyPayment,
          fromPeriodId: values.correct ? values.fromPeriodId || null : null,
        })
      : create.mutateAsync({
          name: values.name,
          principal: values.principal,
          categoryId: values.categoryId,
          monthlyPayment: values.monthlyPayment,
          rate: values.rate,
          fromPeriodId: values.fromPeriodId || null,
        })
    return done.catch(() => undefined)
  })

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate data-testid="debt-form">
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
        <TextField
          control={form.control}
          name="name"
          label={t('debts.fields.name')}
          placeholder={t('debts.fields.namePlaceholder')}
          autoComplete="off"
          autoFocus
        />
        <CategorySelectField
          control={form.control}
          name="categoryId"
          label={t('debts.fields.category')}
          options={options}
          loading={choices.isPending && effective !== null}
          description={debt ? t('debts.fields.categoryEditHelp') : t('debts.fields.categoryHelp')}
        />
        {principalLocked ? (
          <Alert data-testid="principal-locked">
            <InfoIcon aria-hidden />
            <AlertDescription>{t('debts.fields.principalLocked')}</AlertDescription>
          </Alert>
        ) : (
          <MoneyField
            control={form.control}
            name="principal"
            label={t('debts.fields.principal')}
            description={t('debts.fields.principalHelp')}
          />
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="rate"
            label={t('debts.fields.rateOptional')}
            placeholder="0.000"
            inputMode="decimal"
            autoComplete="off"
          />
          <MoneyField
            control={form.control}
            name="monthlyPayment"
            label={t('debts.fields.payment')}
          />
        </div>
        <p className="-mt-3 text-xs text-muted-foreground">{t('debts.fields.termsHelp')}</p>
        {!debt && earlier.length > 0 && (
          <SelectField
            control={form.control}
            name="fromPeriodId"
            label={t('debts.fields.from')}
            description={t('debts.fields.fromHelp')}
            options={[
              { value: '', label: t('income.fields.fromCurrent') },
              ...earlier.map((period) => ({ value: period.id, label: label(period) })),
            ]}
          />
        )}
        {debt && correctable.length > 0 && (
          <CorrectionToggle
            checked={correct}
            onCheckedChange={(next) => {
              form.setValue('correct', next)
              form.setValue('fromPeriodId', next ? (correctable[0]?.id ?? '') : '')
            }}
            label={t('income.correction.label')}
            warning={t('debts.correctionWarning')}
          >
            <SelectField
              control={form.control}
              name="fromPeriodId"
              label={t('income.correction.from')}
              options={correctable.map((period) => ({ value: period.id, label: label(period) }))}
            />
          </CorrectionToggle>
        )}
        <Alert>
          <InfoIcon aria-hidden />
          <AlertDescription>
            {debt
              ? correct
                ? t('debts.correctionAppliesFrom')
                : currentPeriod
                  ? t('debts.editAppliesFrom', {
                      date: formatCalendarDate(currentPeriod.start_date),
                    })
                  : t('income.editAppliesFromNoPeriod')
              : t('debts.addAppliesFrom')}
          </AlertDescription>
        </Alert>
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
