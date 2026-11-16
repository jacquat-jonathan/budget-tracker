import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { paths } from '@/app/paths'
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
import type { ArrivedOffer } from '@/features/periods/boundary-ranges'
import { formatCalendarDate } from '@/lib/date'

/**
 * R-PERIOD-037: after a correction of the primary pay day under which a salary was already
 * due, ask about it, with a direct path to the operation that fits (arrivedOffer): "The
 * salary arrived early" for a new salary, or "This period's salary actually arrived on
 * another day" for this period's own salary. Never offered when neither can be saved.
 */
export function SalaryArrivedPrompt({
  offer,
  periodStart,
  onClose,
}: {
  offer: ArrivedOffer | null
  /** The current period's start, named when the offer is to move it. */
  periodStart: string | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const fmt = formatCalendarDate
  return (
    <AlertDialog
      open={offer !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <AlertDialogContent>
        {offer && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {offer.kind === 'early'
                  ? t('income.arrivedPrompt.title')
                  : t('income.arrivedPrompt.moveStartTitle', { date: fmt(offer.date) })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {offer.kind === 'early' || !periodStart
                  ? t('income.arrivedPrompt.description', { date: fmt(offer.date) })
                  : t('income.arrivedPrompt.moveStartDescription', {
                      date: fmt(offer.date),
                      start: fmt(periodStart),
                    })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {offer.kind === 'early'
                  ? t('income.arrivedPrompt.notYet')
                  : t('income.arrivedPrompt.keepStart')}
              </AlertDialogCancel>
              <Button
                onClick={() => {
                  onClose()
                  void navigate(`${paths.periods}?record=${offer.kind}&date=${offer.date}`)
                }}
              >
                {offer.kind === 'early'
                  ? t('income.arrivedPrompt.record')
                  : t('income.arrivedPrompt.moveStart')}
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
