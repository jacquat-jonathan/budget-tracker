import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useBudgetEnded } from '@/features/budgets/budget-ended'
import { OlderPeriodsItem } from '@/features/budgets/older-periods-item'
import { pickPeriod, useOlderPeriodsOption } from '@/features/budgets/older-periods'
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
import { useRemovalPreview } from '@/features/budgets/removal-preview'
import { useSubscriptionViews } from '@/features/subscriptions/subscription-views'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { useEditBase } from '@/hooks/use-edit-base'
import { formatCalendarDate } from '@/lib/date'

/**
 * End or delete a subscription, said beforehand from the database's own answer
 * (removal_deletes): deleted when it never counted and has no charge, otherwise ended from
 * the current period with its charges kept (R-SUBSCRIPTION-113).
 */
// R-SUBSCRIPTION-124 R-SUBSCRIPTION-141: the one outcome the database gives, said beforehand.
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
  // A refused save over a change this form does not show says so (the shown fields that
  // changed have their own notice), in the save's own words.
  const errorMessage = useErrorMessage({ record_changed: 'subscriptions.changedNotShown' })
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
  // R-BUDGET-150: once the budget has ended, only from one of its periods.
  const mustCorrect = useBudgetEnded(budgetId)
  const [correct, setCorrect] = useState(mustCorrect)
  const [fromPeriodId, setFromPeriodId] = useState(correctable[0]?.id ?? '')
  const olderPeriods = useOlderPeriodsOption(budgetId)
  // What happens, from now or from the period chosen, is the database's answer (D-220).
  const preview = useRemovalPreview(
    'subscription',
    budgetId,
    subscription.id,
    correct ? fromPeriodId || null : null,
  )
  const outcome = preview.data?.outcome ?? null
  const refusal = preview.data?.refusal ?? null
  const deletes = outcome === 'deleted'
  const blocked =
    removal.changed || removal.gone || !settled || outcome === null || preview.isFetching
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
            ? t('subscriptions.remove.deleteTitle', { name: subscription.name })
            : t('subscriptions.remove.endTitle', { name: subscription.name })}
        </AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div className="flex flex-col gap-2" data-testid="end-subscription-outcome">
            <p>
              {preview.isError
                ? errorMessage(preview.error)
                : refusal
                  ? t('subscriptions.remove.refused', { reason: t(`errors.db.${refusal}`) })
                  : outcome === null
                    ? t('common.loading')
                    : deletes
                      ? correct
                        ? t('subscriptions.remove.deletesFromEarlier')
                        : t('subscriptions.remove.deletes')
                      : correct
                        ? t('subscriptions.remove.fromEarlier')
                        : currentPeriod
                          ? t('subscriptions.remove.ends', {
                              date: formatCalendarDate(currentPeriod.start_date),
                            })
                          : t('subscriptions.remove.endsNoPeriod')}
            </p>
            {outcome === 'ended' && subscription.charge_count > 0 && (
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
          required={mustCorrect ? t('corrections.budgetEnded') : undefined}
        >
          <Field>
            <FieldLabel htmlFor="end-subscription-period">
              {t('income.correction.removeFrom')}
            </FieldLabel>
            <Select value={fromPeriodId} onValueChange={pickPeriod(olderPeriods, setFromPeriodId)}>
              <SelectTrigger id="end-subscription-period" className="w-full">
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
            : deletes
              ? t('subscriptions.remove.delete')
              : t('subscriptions.remove.end')}
        </Button>
      </AlertDialogFooter>
    </>
  )
}
