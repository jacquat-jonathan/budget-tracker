import { InboxIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'
import { useToCategoriseIds } from '@/features/categories/category-queries'

/** The mark beside a category's name, when it is "to categorise". */
export function ToCategoriseMark({ id }: { id: string | null | undefined }) {
  const { budgetId } = useCurrentBudget()
  const ids = useToCategoriseIds(budgetId)
  return id && ids?.has(id) ? <ToCategoriseBadge /> : null
}

/**
 * The mark of the budget's "to categorise" category, wherever categories are listed: an icon
 * and a word, and what it is for in the accessible name.
 */
export function ToCategoriseBadge() {
  const { t } = useTranslation()
  return (
    <Badge
      variant="outline"
      className="shrink-0 gap-1"
      title={t('import.toCategorise.mark')}
      data-testid="to-categorise-badge"
    >
      <InboxIcon aria-hidden />
      <span>{t('import.toCategorise.badge')}</span>
      <span className="sr-only">: {t('import.toCategorise.mark')}</span>
    </Badge>
  )
}
