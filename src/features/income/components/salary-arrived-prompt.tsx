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
import { formatCalendarDate } from '@/lib/date'

/**
 * R-PERIOD-037: after a correction of the primary pay day under which this month's salary
 * was already due, the current period runs on to the following month until the early pay
 * date is recorded. Ask, with a direct path to "The salary arrived early".
 */
export function SalaryArrivedPrompt({
  dueDate,
  onClose,
}: {
  dueDate: string | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <AlertDialog
      open={dueDate !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('income.arrivedPrompt.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {dueDate &&
              t('income.arrivedPrompt.description', { date: formatCalendarDate(dueDate) })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('income.arrivedPrompt.notYet')}</AlertDialogCancel>
          <Button
            onClick={() => {
              const date = dueDate
              onClose()
              if (date) {
                void navigate(`${paths.periods}?record=early&date=${date}`)
              }
            }}
          >
            {t('income.arrivedPrompt.record')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
