import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ChangedElsewhere, GoneElsewhere, SaveError } from '@/components/changed-elsewhere'
import { CorrectionToggle } from '@/components/form/correction-toggle'
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
import type { PeriodSummary } from '@/features/budgets/budget-queries'
import { useEndSubscription } from '@/features/subscriptions/subscription-mutations'
import {
  useSubscriptionRecord,
  type Subscription,
} from '@/features/subscriptions/subscription-queries'
import { useRecordSettled } from '@/features/budgets/record-settled'
import { useSubscriptionViews } from '@/features/subscriptions/subscription-views'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { useEditBase } from '@/hooks/use-edit-base'
import { formatCalendarDate } from '@/lib/date'

/**
 * End or delete a subscription, said beforehand from the database's own answer
 * (removal_deletes): deleted when it never counted and has no charge, otherwise ended from
 * the current period with its charges kept (R-SUBSCRIPTION-113).
 */
// R-SUBSCRIPTION-124: which of the two happens, said before it does; from an earlier period,
// where the database does not say beforehand, both outcomes are said (R-SUBSCRIPTION-141).
export function EndSubscriptionDialog({
  budgetId,
  subscription,
  periods,
  currentPeriod,
  onClose,
}: {
  budgetId: string
  subscription: Subscription | null
  periods: PeriodSummary[]
  currentPeriod: PeriodSummary | null
  onClose: () => void
}) {
  return (
    <AlertDialog
      open={subscription !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <AlertDialogContent>
        {subscription && (
          <EndBody
            budgetId={budgetId}
            opened={subscription}
            periods={periods}
            currentPeriod={currentPeriod}
            onClose={onClose}
          />
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}

function EndBody({
  budgetId,
  opened,
  periods,
  currentPeriod,
  onClose,
}: {
  budgetId: string
  opened: Subscription
  periods: PeriodSummary[]
  currentPeriod: PeriodSummary | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const views = useSubscriptionViews()
  const live = useSubscriptionRecord(budgetId, opened.id)
  // Ended by someone else meanwhile: there is nothing left to end (as step 3's dialogs).
  const removal = useEditBase(opened, live, views.subscription, (record) => !record.is_active)
  const settled = useRecordSettled(budgetId, 'subscription_overview', opened.id, live)
  const subscription = live ?? removal.base ?? opened
  const end = useEndSubscription(budgetId)
  const correctable = periods.filter(
    (period) => !period.is_current && period.seq >= subscription.first_seq,
  )
  const [correct, setCorrect] = useState(false)
  const [fromPeriodId, setFromPeriodId] = useState(correctable[0]?.id ?? '')
  const deletes = !correct && subscription.removal_deletes
  const blocked = removal.changed || removal.gone || !settled
  const label = (period: PeriodSummary) =>
    t('income.fields.fromPeriod', {
      start: formatCalendarDate(period.start_date),
      end: formatCalendarDate(period.end_date),
    })

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {correct
            ? t('subscriptions.remove.endOrDeleteTitle', { name: subscription.name })
            : deletes
              ? t('subscriptions.remove.deleteTitle', { name: subscription.name })
              : t('subscriptions.remove.endTitle', { name: subscription.name })}
        </AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div className="flex flex-col gap-2" data-testid="end-subscription-outcome">
            <p>
              {correct
                ? t('subscriptions.remove.fromEarlier')
                : deletes
                  ? t('subscriptions.remove.deletes')
                  : currentPeriod
                    ? t('subscriptions.remove.ends', {
                        date: formatCalendarDate(currentPeriod.start_date),
                      })
                    : t('subscriptions.remove.endsNoPeriod')}
            </p>
            {!deletes && !correct && subscription.charge_count > 0 && (
              <p>{t('subscriptions.remove.keepsCharges', { count: subscription.charge_count })}</p>
            )}
            {subscription.awaiting_count > 0 && (
              <p>
                {t('subscriptions.remove.stillAwaiting', { count: subscription.awaiting_count })}
              </p>
            )}
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      {correctable.length > 0 && (
        <CorrectionToggle
          checked={correct}
          onCheckedChange={setCorrect}
          label={t('subscriptions.remove.earlierLabel')}
          warning={t('subscriptions.remove.earlierWarning')}
        >
          <Field>
            <FieldLabel htmlFor="end-subscription-period">
              {t('income.correction.removeFrom')}
            </FieldLabel>
            <Select value={fromPeriodId} onValueChange={setFromPeriodId}>
              <SelectTrigger id="end-subscription-period" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {correctable.map((period) => (
                  <SelectItem key={period.id} value={period.id}>
                    {label(period)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CorrectionToggle>
      )}
      {removal.gone && (
        <GoneElsewhere
          ended={live !== null && live !== undefined}
          endedText={t('subscriptions.endedElsewhere')}
        />
      )}
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
                subscription,
                revision: (removal.base ?? subscription).revision,
                fromPeriodId: correct ? fromPeriodId || null : null,
              },
              { onSuccess: onClose },
            )
          }
        >
          {end.isPending
            ? t('common.saving')
            : correct
              ? t('subscriptions.remove.endOrDelete')
              : deletes
                ? t('subscriptions.remove.delete')
                : t('subscriptions.remove.end')}
        </Button>
      </AlertDialogFooter>
    </>
  )
}
