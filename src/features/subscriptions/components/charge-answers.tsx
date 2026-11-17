import { CheckIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { useAnswerCharge } from '@/features/subscriptions/subscription-mutations'
import type { Transaction } from '@/features/transactions/transaction-queries'
import { formatCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'

/**
 * "It went through" and "It did not go through" for one automatic charge, with the charge's
 * revision. "Did not go through" asks first: the charge is removed and never created again.
 */
export function ChargeAnswers({
  budgetId,
  charge,
  size = 'sm',
  onAnswer,
}: {
  budgetId: string
  charge: Transaction
  size?: 'sm' | 'xs'
  /** Called as an answer is sent (to keep the focus in the list). */
  onAnswer?: () => void
}) {
  const { t } = useTranslation()
  const { confirm, dismiss } = useAnswerCharge(budgetId)
  const [asking, setAsking] = useState(false)
  const busy = confirm.isPending || dismiss.isPending
  // D-212: a charge is known by its own date (the one the lists show).
  const what = t('charges.what', {
    name: charge.subscription_name ?? '',
    amount: formatMoney(charge.amount),
    date: formatCalendarDate(charge.date),
  })
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size={size}
        variant="outline"
        disabled={busy}
        onClick={() => {
          onAnswer?.()
          confirm.mutate(charge)
        }}
        aria-label={t('charges.wentThroughFor', { what })}
      >
        <CheckIcon aria-hidden />
        {t('charges.wentThrough')}
      </Button>
      <Button
        size={size}
        variant="ghost"
        disabled={busy}
        onClick={() => setAsking(true)}
        aria-label={t('charges.didNotFor', { what })}
      >
        <XIcon aria-hidden />
        {t('charges.didNot')}
      </Button>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={t('charges.dismissTitle')}
        description={
          <>
            <p>{t('charges.dismissDescription', { what })}</p>
            <p>
              {t('charges.dismissNever', {
                date: formatCalendarDate(charge.charge_date ?? charge.date),
              })}
            </p>
          </>
        }
        confirmLabel={t('charges.dismissConfirm')}
        destructive
        pending={dismiss.isPending}
        onConfirm={() => {
          onAnswer?.()
          dismiss.mutate(charge, {
            onSettled: () => setAsking(false),
          })
        }}
      />
    </div>
  )
}
