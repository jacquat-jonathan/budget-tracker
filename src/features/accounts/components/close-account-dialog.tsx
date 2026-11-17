import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { paths } from '@/app/paths'
import { ChangedElsewhere, GoneElsewhere, SaveError } from '@/components/changed-elsewhere'
import { CorrectionToggle } from '@/components/form/correction-toggle'
import { PreviewLoadFailed } from '@/components/preview-state'
import { previewHolds, previewLoadFailed } from '@/lib/preview'
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
import { Field, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCloseAccount } from '@/features/accounts/account-mutations'
import {
  readUsedBy,
  useAccountRecord,
  useClosePreview,
  type Account,
  type AccountUser,
} from '@/features/accounts/account-queries'
import { useAccountViews } from '@/features/accounts/account-views'
import { useBudgetEnded } from '@/features/budgets/budget-ended'
import type { PeriodSummary } from '@/features/budgets/budget-queries'
import { pickPeriod, useOlderPeriodsOption } from '@/features/budgets/older-periods'
import { OlderPeriodsItem } from '@/features/budgets/older-periods-item'
import { useRecordSettled } from '@/features/budgets/record-settled'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { useEditBase } from '@/hooks/use-edit-base'
import { formatCalendarDate } from '@/lib/date'
import { dbErrorCode, dbErrorDetail } from '@/lib/db-errors'

export function CloseAccountDialog({
  budgetId,
  account,
  periods,
  currentPeriod,
  onClose,
}: {
  budgetId: string
  account: Account | null
  periods: PeriodSummary[]
  currentPeriod: PeriodSummary | null
  onClose: () => void
}) {
  return (
    <AlertDialog
      open={account !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <AlertDialogContent>
        {account && (
          <CloseBody
            budgetId={budgetId}
            opened={account}
            periods={periods}
            currentPeriod={currentPeriod}
            onClose={onClose}
          />
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** What uses the account from then on, each a link to where it can be changed. */
export function UsedByList({ users }: { users: AccountUser[] }) {
  const { t } = useTranslation()
  return (
    <ul className="flex list-disc flex-col gap-0.5 pl-5" data-testid="account-used-by">
      {users.map((user) => (
        <li key={`${user.kind}-${user.id}`}>
          <Link
            className="underline underline-offset-2"
            to={user.kind === 'income' ? paths.income : paths.transfers}
          >
            {t(`accounts.close.usedBy.${user.kind}`, { name: user.name })}
          </Link>
        </li>
      ))}
    </ul>
  )
}

// R-ACCOUNT-232: closing says beforehand whether it deletes, ends, or is refused, and by what.
function CloseBody({
  budgetId,
  opened,
  periods,
  currentPeriod,
  onClose,
}: {
  budgetId: string
  opened: Account
  periods: PeriodSummary[]
  currentPeriod: PeriodSummary | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage({ record_changed: 'accounts.changedNotShown' })
  const views = useAccountViews()
  const live = useAccountRecord(budgetId, opened.id)
  const removal = useEditBase(opened, live, views, (record) => !record.is_active)
  const settled = useRecordSettled(budgetId, 'account_overview', opened.id, live)
  const account = live ?? removal.base ?? opened
  const close = useCloseAccount(budgetId)
  const mustCorrect = useBudgetEnded(budgetId)
  const correctable = periods.filter(
    (period) => !period.is_current && period.seq >= account.first_seq,
  )
  const [correct, setCorrect] = useState(mustCorrect)
  const [fromPeriodId, setFromPeriodId] = useState(correctable[0]?.id ?? '')
  const olderPeriods = useOlderPeriodsOption(budgetId)
  const preview = useClosePreview(budgetId, account.id, correct ? fromPeriodId || null : null)
  const outcome = preview.data?.outcome ?? null
  const refusal = preview.data?.refusal ?? null
  // The write's own refusal names what uses the account too (its detail).
  const refusedUsers =
    dbErrorCode(close.error) === 'account_in_use' ? readUsedBy(dbErrorDetail(close.error)) : []
  const users = refusal === 'account_in_use' ? (preview.data?.usedBy ?? []) : refusedUsers
  const deletes = outcome === 'deleted'
  const blocked =
    removal.changed ||
    removal.gone ||
    !settled ||
    outcome === null ||
    refusal !== null ||
    (!close.isPending && !close.isSuccess && previewHolds(preview))
  const label = (period: PeriodSummary) =>
    t('income.fields.fromPeriod', {
      start: formatCalendarDate(period.start_date),
      end: formatCalendarDate(period.end_date),
    })

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {deletes
            ? t('accounts.close.deleteTitle', { name: account.name })
            : t('accounts.close.title', { name: account.name })}
        </AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div className="flex flex-col gap-2" data-testid="close-account-outcome">
            {previewLoadFailed(preview) ? (
              <PreviewLoadFailed
                error={preview.error}
                fetching={preview.isFetching}
                onRetry={() => void preview.refetch()}
              />
            ) : preview.isError ? (
              <p>{errorMessage(preview.error)}</p>
            ) : refusal ? (
              <p>
                {refusal === 'account_in_use'
                  ? t('accounts.close.inUse')
                  : t('accounts.close.refused', { reason: t(`errors.db.${refusal}`) })}
              </p>
            ) : outcome === null ? (
              <p>{t('common.loading')}</p>
            ) : deletes ? (
              <p>{t('accounts.close.deletes')}</p>
            ) : (
              <p>
                {correct
                  ? t('accounts.close.endsFromEarlier')
                  : currentPeriod
                    ? t('accounts.close.ends', {
                        date: formatCalendarDate(currentPeriod.start_date),
                      })
                    : t('accounts.close.endsNoPeriod')}
              </p>
            )}
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      {users.length > 0 && (
        <div className="text-sm">
          <UsedByList users={users} />
          <p className="mt-2 text-muted-foreground">{t('accounts.close.changeFirst')}</p>
        </div>
      )}
      {correctable.length > 0 && (
        <CorrectionToggle
          checked={correct}
          onCheckedChange={setCorrect}
          label={t('accounts.close.earlierLabel')}
          warning={t('accounts.close.earlierWarning')}
          required={mustCorrect ? t('corrections.budgetEnded') : undefined}
        >
          <Field>
            <FieldLabel htmlFor="close-account-period">{t('accounts.close.from')}</FieldLabel>
            <Select value={fromPeriodId} onValueChange={pickPeriod(olderPeriods, setFromPeriodId)}>
              <SelectTrigger id="close-account-period" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {correctable.map((period) => (
                  <SelectItem key={period.id} value={period.id}>
                    {label(period)}
                  </SelectItem>
                ))}
                <OlderPeriodsItem option={olderPeriods} />
              </SelectContent>
            </Select>
          </Field>
        </CorrectionToggle>
      )}
      {removal.gone && <GoneElsewhere ended={live !== null && live !== undefined} />}
      {removal.changed && (
        <ChangedElsewhere
          kind="remove"
          changes={removal.theirs}
          onKeepMine={() => {
            removal.adopt()
            close.reset()
          }}
        />
      )}
      <SaveError
        error={close.error}
        hidden={blocked || refusedUsers.length > 0}
        message={errorMessage}
      />
      <AlertDialogFooter>
        <AlertDialogCancel disabled={close.isPending}>{t('common.cancel')}</AlertDialogCancel>
        <Button
          variant="destructive"
          disabled={close.isPending || blocked}
          onClick={() =>
            close.mutate(
              {
                account,
                revision: (removal.base ?? account).revision,
                fromPeriodId: correct ? fromPeriodId || null : null,
              },
              { onSuccess: onClose },
            )
          }
        >
          {close.isPending
            ? t('common.saving')
            : deletes
              ? t('accounts.close.delete')
              : t('accounts.close.confirm')}
        </Button>
      </AlertDialogFooter>
    </>
  )
}
