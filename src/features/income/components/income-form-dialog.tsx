import { zodResolver } from '@hookform/resolvers/zod'
import { InfoIcon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

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
import { useAuth } from '@/features/auth/auth-context'
import { TextField } from '@/features/auth/components/text-field'
import {
  memberName,
  type BudgetMember,
  type IncomeOverview,
  type PeriodSummary,
} from '@/features/budgets/budget-queries'
import { PayDayField, WeekendRuleField } from '@/features/income/components/income-term-fields'
import { useAddIncome, useEditIncome } from '@/features/income/income-mutations'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { formatCalendarDate } from '@/lib/date'
import { nameSchema, payDaySchema, rappenSchema, weekendRuleSchema } from '@/lib/form-schemas'

const incomeSchema = z.object({
  name: nameSchema,
  amount: rappenSchema(),
  payDay: payDaySchema,
  weekendRule: weekendRuleSchema,
  userId: z.string(),
  /** "" for the current period. */
  fromPeriodId: z.string(),
})
type IncomeInput = z.input<typeof incomeSchema>
type IncomeValues = z.output<typeof incomeSchema>

interface IncomeFormDialogProps {
  budgetId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The income to edit; a new income when absent. */
  income?: IncomeOverview
  members: BudgetMember[]
  periods: PeriodSummary[]
  currentPeriod: PeriodSummary | null
}

/** Add or edit an income. Mount it only while open, so it starts from fresh values. */
export function IncomeFormDialog(props: IncomeFormDialogProps) {
  const { t } = useTranslation()
  const { open, onOpenChange, income } = props

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{income ? t('income.editTitle') : t('income.addTitle')}</DialogTitle>
          <DialogDescription>
            {income ? t('income.editDescription') : t('income.addDescription')}
          </DialogDescription>
        </DialogHeader>
        {open && <IncomeForm {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function IncomeForm({
  budgetId,
  onOpenChange,
  income,
  members,
  periods,
  currentPeriod,
}: IncomeFormDialogProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const errorMessage = useErrorMessage()
  const close = () => onOpenChange(false)

  const form = useForm<IncomeInput, unknown, IncomeValues>({
    resolver: zodResolver(incomeSchema),
    defaultValues: {
      name: income?.name ?? '',
      amount: income?.amount ?? null,
      payDay: income?.pay_day ?? 25,
      weekendRule: income?.weekend_rule ?? 'nearest',
      // A new income is mine unless I pick another member (D-045).
      userId: income?.user_id ?? user?.id ?? '',
      fromPeriodId: '',
    },
  })

  const add = useAddIncome(budgetId, { onDone: close })
  const edit = useEditIncome(budgetId, income, { onDone: close })
  const mutation = income ? edit : add

  const onSubmit = form.handleSubmit((values) => {
    const terms = {
      name: values.name,
      amount: values.amount,
      payDay: values.payDay,
      weekendRule: values.weekendRule,
    }
    const done = income
      ? edit.mutateAsync(terms)
      : add.mutateAsync({
          ...terms,
          userId: values.userId === user?.id ? null : values.userId,
          fromPeriodId: values.fromPeriodId || null,
        })
    return done.catch(() => undefined)
  })

  const memberOptions = members.map((member) => ({
    value: member.user_id,
    label:
      member.user_id === user?.id
        ? t('members.you', { name: memberName(member) ?? t('members.unknownName') })
        : (memberName(member) ?? t('members.unknownName')),
  }))
  // Back-dating: the current period, or an earlier one (newest first).
  const periodOptions = [
    { value: '', label: t('income.fields.fromCurrent') },
    ...periods
      .filter((period) => !period.is_current)
      .map((period) => ({
        value: period.id,
        label: t('income.fields.fromPeriod', {
          start: formatCalendarDate(period.start_date),
          end: formatCalendarDate(period.end_date),
        }),
      })),
  ]

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate>
      <FieldGroup>
        {mutation.isError && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(mutation.error)}</AlertDescription>
          </Alert>
        )}
        <TextField
          control={form.control}
          name="name"
          label={t('income.fields.name')}
          placeholder={t('income.fields.namePlaceholder')}
          autoComplete="off"
        />
        {!income && (
          <SelectField
            control={form.control}
            name="userId"
            label={t('income.fields.owner')}
            description={t('income.fields.ownerHelp')}
            options={memberOptions}
          />
        )}
        <MoneyField control={form.control} name="amount" label={t('income.fields.amount')} />
        <PayDayField control={form.control} name="payDay" />
        <WeekendRuleField control={form.control} name="weekendRule" />
        {!income && periodOptions.length > 1 && (
          <SelectField
            control={form.control}
            name="fromPeriodId"
            label={t('income.fields.from')}
            description={t('income.fields.fromHelp')}
            options={periodOptions}
          />
        )}
        <Alert>
          <InfoIcon aria-hidden />
          <AlertDescription>
            {income
              ? currentPeriod
                ? t('income.editAppliesFrom', { date: formatCalendarDate(currentPeriod.start_date) })
                : t('income.editAppliesFromNoPeriod')
              : t('income.addAppliesFrom')}
            {income?.is_primary && <p className="mt-1">{t('income.editPrimaryNote')}</p>}
          </AlertDescription>
        </Alert>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  )
}
