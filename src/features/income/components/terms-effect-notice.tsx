import { InfoIcon, LoaderIcon, TriangleAlertIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { monthOf } from '@/features/budgets/start-months'
import type { TermsEffect } from '@/features/income/terms-effect'
import { addDays, formatCalendarDate } from '@/lib/date'
import { currentLanguage } from '@/lib/i18n'

/** Says what saving primary terms does to the current period (see useTermsEffect). */
export function TermsEffectNotice({
  effect,
  undoHint,
}: {
  effect: TermsEffect
  undoHint?: boolean
}) {
  const { t } = useTranslation()
  const language = currentLanguage()
  if (effect.kind === 'none') return null
  if (effect.kind === 'checking') {
    return (
      <Alert data-testid="terms-effect">
        <LoaderIcon className="animate-spin" aria-hidden />
        <AlertDescription>{t('income.effect.checking')}</AlertDescription>
      </Alert>
    )
  }
  if (effect.kind === 'unknown') {
    return (
      <Alert data-testid="terms-effect">
        <TriangleAlertIcon aria-hidden />
        <AlertDescription>{t('income.effect.unknown')}</AlertDescription>
      </Alert>
    )
  }
  const month = monthOf(effect.month, language)
  const payDate = formatCalendarDate(effect.payDate)
  if (effect.kind === 'closes') {
    return (
      <Alert variant="destructive" data-testid="terms-effect">
        <TriangleAlertIcon aria-hidden />
        <AlertTitle>{t('income.closesNowTitle')}</AlertTitle>
        <AlertDescription>
          <p>{t('income.closesNow', { month, date: payDate })}</p>
          {undoHint && <p>{t('income.effect.undo', { month })}</p>}
        </AlertDescription>
      </Alert>
    )
  }
  if (effect.kind === 'manual') {
    return (
      <Alert data-testid="terms-effect">
        <InfoIcon aria-hidden />
        <AlertDescription>
          {effect.closesIfReset
            ? t('income.effect.manualCloses', {
                end: formatCalendarDate(effect.manualEnd),
                month,
                date: payDate,
              })
            : t('income.effect.manual', {
                end: formatCalendarDate(effect.manualEnd),
                month,
                date: payDate,
              })}
        </AlertDescription>
      </Alert>
    )
  }
  return (
    <Alert data-testid="terms-effect">
      <InfoIcon aria-hidden />
      <AlertDescription>
        {t('income.effect.moves', {
          end: formatCalendarDate(addDays(effect.payDate, -1)),
          month,
          date: payDate,
        })}
      </AlertDescription>
    </Alert>
  )
}
