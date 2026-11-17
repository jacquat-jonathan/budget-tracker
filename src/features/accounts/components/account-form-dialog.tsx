import { zodResolver } from '@hookform/resolvers/zod'
import { InfoIcon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { ConcurrentNotices } from '@/components/changed-elsewhere'
import { SelectField } from '@/components/form/select-field'
import { NothingToSave } from '@/components/nothing-to-save'
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
import { useCreateAccount, useUpdateAccount } from '@/features/accounts/account-mutations'
import { ACCOUNT_KINDS, useAccountRecord, type Account } from '@/features/accounts/account-queries'
import { useAccountViews, useHolderText } from '@/features/accounts/account-views'
import { useAuth } from '@/features/auth/auth-context'
import { TextField } from '@/features/auth/components/text-field'
import { useBudgetEnded } from '@/features/budgets/budget-ended'
import {
  memberName,
  type BudgetMember,
  type PeriodSummary,
} from '@/features/budgets/budget-queries'
import { useOlderPeriodsOption } from '@/features/budgets/older-periods'
import { useRecordSettled } from '@/features/budgets/record-settled'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { useClientId } from '@/hooks/use-client-id'
import { useConcurrentForm } from '@/hooks/use-concurrent-form'
import { useEditBase } from '@/hooks/use-edit-base'
import { formatCalendarDate } from '@/lib/date'
import { nameSchema } from '@/lib/form-schemas'

/** A bank label: at most 100 characters; blank is none (docs/database.md). */
export const BANK_LABEL_MAX = 100

const accountSchema = z.object({
  name: nameSchema,
  // R-ACCOUNT-530: no kind is chosen for the user; the field starts empty and is required.
  kind: z
    .string()
    .pipe(
      z.enum(
        [
          'current',
          'savings',
          'third_pillar',
          'tax_reserve',
          'investment',
          'cash',
          'credit_card',
          'other',
        ],
        { error: 'validation.accountKindRequired' },
      ),
    ),
  bankLabel: z.string().trim().max(BANK_LABEL_MAX, { error: 'validation.bankLabelTooLong' }),
  /** "" for a shared account. */
  userId: z.string(),
  /** Create only: "" for the current period. */
  fromPeriodId: z.string(),
})
type Input = z.input<typeof accountSchema>
type Values = z.output<typeof accountSchema>

interface Props {
  budgetId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  account?: Account
  members: BudgetMember[]
  periods: PeriodSummary[]
  currentPeriod: PeriodSummary | null
}

export function AccountFormDialog(props: Props) {
  const { t } = useTranslation()
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-8">
            {props.account ? t('accounts.editTitle') : t('accounts.addTitle')}
          </DialogTitle>
          <DialogDescription>
            {props.account ? t('accounts.editDescription') : t('accounts.addDescription')}
          </DialogDescription>
        </DialogHeader>
        {props.open && <AccountForm {...props} />}
      </DialogContent>
    </Dialog>
  )
}

// R-ACCOUNT-001: an account has a name, a kind, an optional bank label and holder.
function AccountForm({
  budgetId,
  onOpenChange,
  account: opened,
  members,
  periods,
  currentPeriod,
}: Props) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const close = () => onOpenChange(false)
  const errorMessage = useErrorMessage({ record_changed: 'accounts.changedNotShown' })
  const views = useAccountViews()
  const holder = useHolderText()
  const live = useAccountRecord(budgetId, opened?.id)
  const edit = useEditBase(opened, live, views)
  const settled = useRecordSettled(budgetId, 'account_overview', opened?.id, live)
  const account = edit.base
  const olderPeriods = useOlderPeriodsOption(budgetId)
  const mustCorrect = useBudgetEnded(budgetId)

  const valuesOf = (from: Account | undefined): Input => ({
    name: from?.name ?? '',
    kind: from?.kind ?? '',
    bankLabel: from?.bank_label ?? '',
    userId: from?.user_id ?? '',
    fromPeriodId: !from && mustCorrect ? (periods[0]?.id ?? '') : '',
  })
  const form = useForm<Input, unknown, Values>({
    resolver: zodResolver(accountSchema),
    defaultValues: valuesOf(account),
  })
  const create = useCreateAccount(budgetId, { onDone: close })
  const update = useUpdateAccount(budgetId, { onDone: close })
  const request = useClientId()
  const mutation = account ? update : create
  const sync = useConcurrentForm(form, edit, valuesOf, () => update.reset(), {
    error: update.error,
    controls: ['fromPeriodId'],
  })

  const memberOptions = [
    { value: '', label: t('accounts.shared') },
    ...members.map((member) => ({
      value: member.user_id,
      label:
        member.user_id === user?.id
          ? t('members.you', { name: memberName(member) ?? t('members.unknownName') })
          : (memberName(member) ?? t('members.unknownName')),
    })),
    // A former member keeps the accounts they held: their name stays a choice (D-350).
    ...(account?.user_id && !members.some((member) => member.user_id === account.user_id)
      ? [{ value: account.user_id, label: holder(account) }]
      : []),
  ]
  const earlier = periods.filter((period) => !period.is_current)
  const periodLabel = (period: PeriodSummary) =>
    t('income.fields.fromPeriod', {
      start: formatCalendarDate(period.start_date),
      end: formatCalendarDate(period.end_date),
    })

  const onSubmit = form.handleSubmit((values) => {
    const fields = {
      name: values.name,
      kind: values.kind,
      bankLabel: values.bankLabel,
      userId: values.userId || null,
    }
    const done = account
      ? update.mutateAsync({ ...fields, account })
      : create
          .mutateAsync({
            ...fields,
            fromPeriodId: values.fromPeriodId || null,
            clientId: request.id,
          })
          .then(
            (id) => {
              request.renew()
              return id
            },
            (error: unknown) => {
              request.afterFailure(error)
              throw error
            },
          )
    return done.catch(() => undefined)
  })

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate data-testid="account-form">
      <FieldGroup>
        <ConcurrentNotices
          adding={!account}
          gone={edit.gone}
          pending={sync.pending}
          updated={sync.updated}
          recovered={sync.recovered}
          onUseTheirs={sync.useTheirs}
          onKeepMine={sync.keepMine}
          error={mutation.error}
          message={errorMessage}
        />
        <TextField
          control={form.control}
          name="name"
          label={t('accounts.fields.name')}
          placeholder={t('accounts.fields.namePlaceholder')}
          autoComplete="off"
          autoFocus
        />
        <SelectField
          control={form.control}
          name="kind"
          label={t('accounts.fields.kind')}
          placeholder={t('accounts.fields.kindPlaceholder')}
          description={t('accounts.fields.kindHelp')}
          options={ACCOUNT_KINDS.map((kind) => ({
            value: kind,
            label: t(`accounts.kinds.${kind}`),
          }))}
        />
        <TextField
          control={form.control}
          name="bankLabel"
          label={t('accounts.fields.bankLabelOptional')}
          placeholder={t('accounts.fields.bankLabelPlaceholder')}
          autoComplete="off"
          maxLength={BANK_LABEL_MAX}
        />
        <SelectField
          control={form.control}
          name="userId"
          label={t('accounts.fields.holder')}
          description={t('accounts.fields.holderHelp')}
          options={memberOptions}
        />
        {!account && earlier.length > 0 && (
          <SelectField
            control={form.control}
            name="fromPeriodId"
            more={olderPeriods}
            label={t('accounts.fields.from')}
            description={t('accounts.fields.fromHelp')}
            options={[
              ...(mustCorrect ? [] : [{ value: '', label: t('income.fields.fromCurrent') }]),
              ...earlier.map((period) => ({ value: period.id, label: periodLabel(period) })),
            ]}
          />
        )}
        <Alert>
          <InfoIcon aria-hidden />
          <AlertDescription>
            {account
              ? t('accounts.editNote')
              : currentPeriod
                ? t('accounts.addNote')
                : t('accounts.addNoteEnded')}
          </AlertDescription>
        </Alert>
        <NothingToSave show={update.data === false && !update.isPending} />
        <DialogFooter className="sticky -bottom-4 z-10 bg-popover">
          <Button type="button" variant="outline" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            disabled={mutation.isPending || sync.pending !== null || edit.gone || !settled}
          >
            {mutation.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  )
}
