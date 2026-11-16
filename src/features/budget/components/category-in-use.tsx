import { LinkIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { debtPath, paths } from '@/app/paths'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { Category } from '@/features/categories/category-queries'
import { useDebts } from '@/features/debts/debt-queries'
import { useSubscriptions } from '@/features/subscriptions/subscription-queries'

/**
 * A category a subscription or debt in force still uses (category_overview.in_use) cannot be
 * removed (end_category answers category_in_use): said before, with what uses it and where
 * to end or move it.
 */
// R-CATEGORY-120: what uses the category is said before a removal is tried.
export function CategoryInUse({
  budgetId,
  category,
  subcategories,
}: {
  budgetId: string
  category: Category
  subcategories: Category[]
}) {
  const { t } = useTranslation()
  const subscriptions = useSubscriptions(budgetId)
  const debts = useDebts(budgetId)
  const ids = new Set([category.id, ...subcategories.map((sub) => sub.id)])
  const usingSubscriptions = (subscriptions.data ?? []).filter(
    (item) => item.is_active && ids.has(item.category_id),
  )
  const usingDebts = (debts.data ?? []).filter(
    (item) => item.is_active && ids.has(item.category_id),
  )
  return (
    <Alert variant="destructive" data-testid="category-in-use">
      <LinkIcon aria-hidden />
      <AlertTitle>{t('categories.inUse.title')}</AlertTitle>
      <AlertDescription>
        {(usingSubscriptions.length > 0 || usingDebts.length > 0) && (
          <ul className="mt-1 list-disc pl-5">
            {usingSubscriptions.map((item) => (
              <li key={item.id}>
                <Link to={paths.subscriptions} className="underline underline-offset-4">
                  {t('categories.inUse.subscription', { name: item.name })}
                </Link>
              </li>
            ))}
            {usingDebts.map((item) => (
              <li key={item.id}>
                <Link to={debtPath(item.id)} className="underline underline-offset-4">
                  {t('categories.inUse.debt', { name: item.name })}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  )
}
