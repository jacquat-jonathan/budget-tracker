import { CheckCheckIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { useConfirmAllCharges } from '@/features/subscriptions/subscription-mutations'
import { formatCalendarDate } from '@/lib/date'

/**
 * "All went through": one confirm_subscription_charges call up to today, behind a
 * confirmation that says how many and from which date to which. Afterwards the message says
 * how many were confirmed, also when it is not the number stated (another member answered
 * some meanwhile, or new ones came).
 */
// R-SUBSCRIPTION-142: confirm all, said beforehand with count and dates, and the result in words.
export function ConfirmAllCharges({
  budgetId,
  count,
  oldest,
  today,
  className,
}: {
  budgetId: string
  /** How many await (my_budgets.charges_awaiting). */
  count: number
  /** The date of the oldest charge awaiting. */
  oldest: string | null
  today: string | null
  className?: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const confirmAll = useConfirmAllCharges(budgetId)
  if (count < 2 || !oldest || !today) return null
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={className}
        onClick={() => {
          confirmAll.reset()
          setOpen(true)
        }}
        data-testid="confirm-all-charges"
      >
        <CheckCheckIcon />
        {t('charges.confirmAll')}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('charges.confirmAllTitle', { count })}
        description={
          <p>
            {oldest === today
              ? t('charges.confirmAllOneDay', { count, date: formatCalendarDate(today) })
              : t('charges.confirmAllRange', {
                  count,
                  from: formatCalendarDate(oldest),
                  to: formatCalendarDate(today),
                })}
          </p>
        }
        confirmLabel={t('charges.confirmAllAction', { count })}
        pending={confirmAll.isPending}
        error={confirmAll.error}
        onConfirm={() =>
          confirmAll.mutate(
            { throughDate: today, stated: count },
            { onSuccess: () => setOpen(false) },
          )
        }
      />
    </>
  )
}
