import { InfoIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { keptTypedLabels } from '@/features/budgets/terms-at'
import type { FieldView } from '@/hooks/use-edit-base'

/**
 * Said after the correction period changed: the fields that kept what the user typed, and
 * that every other field now shows the chosen period's terms.
 */
// D-294: typed values survive a change of correction period, and the form says which.
export function KeptTypedNote({
  kept,
  views,
}: {
  kept: readonly string[] | null
  views: readonly FieldView[]
}) {
  const { t } = useTranslation()
  const labels = keptTypedLabels(kept, views)
  if (!labels) return null
  return (
    <Alert data-testid="kept-typed" role="status">
      <InfoIcon aria-hidden />
      <AlertDescription>
        {t('corrections.keptTyped', { fields: labels.join(', '), count: labels.length })}
      </AlertDescription>
    </Alert>
  )
}
