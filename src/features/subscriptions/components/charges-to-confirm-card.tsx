import { BellRingIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { paths } from '@/app/paths'
import { CalendarDate } from '@/components/form/calendar-date-field'
import { ErrorState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'
import { ChargeAnswers } from '@/features/subscriptions/components/charge-answers'
import { useAwaitingCharges, useSubscriptions } from '@/features/subscriptions/subscription-queries'
import { useCategoryPath } from '@/features/subscriptions/subscription-views'
import { formatCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'

/** How many charges the card lists; the others are a link away. */
const SHOWN = 5

/**
 * The dashboard's notification (R-SUBSCRIPTION-076): the oldest automatic charges awaiting
 * confirmation, asking whether each really went through, with the real number awaiting (the
 * subscriptions' awaiting_count, not the length of a page). Read after the catch-up; when
 * another member answered first, the list is read again and a message says so. Nothing is
 * shown when nothing awaits. After an answer, focus moves to the next charge, never lost.
 */
// R-SUBSCRIPTION-142: a compact card, the true count, focus kept in the list.
export function ChargesToConfirmCard() {
  const { t } = useTranslation()
  const { budgetId } = useCurrentBudget()
  const charges = useAwaitingCharges(budgetId)
  const subscriptions = useSubscriptions(budgetId)
  const path = useCategoryPath()
  const list = charges.data ?? []
  const shown = list.slice(0, SHOWN)
  const counted = (subscriptions.data ?? []).reduce(
    (sum, subscription) => sum + subscription.awaiting_count,
    0,
  )
  // The list read is the newest; the count may lag a moment behind it, never below it.
  const total = Math.max(counted, list.length)

  // Where focus goes once the charge that had it is answered and leaves the list.
  const cardRef = useRef<HTMLDivElement>(null)
  const answeredIndex = useRef<number | null>(null)
  const ids = shown.map((charge) => charge.id).join(',')
  useEffect(() => {
    const index = answeredIndex.current
    if (index === null) return
    const card = cardRef.current
    if (card && document.activeElement && card.contains(document.activeElement)) return
    answeredIndex.current = null
    if (!card) {
      // The last one answered: the card is gone; focus goes to the page's heading.
      const heading = document.querySelector<HTMLElement>('main h1')
      heading?.setAttribute('tabindex', '-1')
      heading?.focus()
      return
    }
    const rows = card.querySelectorAll<HTMLElement>('[data-testid="charge-to-confirm"]')
    const next = rows[Math.min(index, rows.length - 1)]
    const target = next?.querySelector<HTMLElement>('button') ?? card.querySelector('h2')
    target?.focus()
  }, [ids])

  if (charges.isError) {
    return <ErrorState className="" error={charges.error} onRetry={charges.refetch} />
  }
  if (list.length === 0) return null

  return (
    <Card
      ref={cardRef}
      data-testid="charges-to-confirm"
      className="ring-amber-500/40"
      role="region"
      aria-labelledby="charges-to-confirm-title"
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRingIcon className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />
          <h2 id="charges-to-confirm-title" tabIndex={-1} className="outline-none">
            {t('charges.title', { count: total })}
          </h2>
        </CardTitle>
        <CardDescription>{t('charges.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col divide-y">
          {shown.map((charge, index) => (
            <li
              key={charge.id}
              className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              data-testid="charge-to-confirm"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex min-w-0 items-baseline justify-between gap-3 sm:justify-start">
                  <span className="truncate font-medium">{charge.subscription_name}</span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {formatMoney(charge.amount)}
                  </span>
                </div>
                <span className="truncate text-xs text-muted-foreground">
                  <CalendarDate value={charge.date} />
                  {/* D-212: a charge is known by its date; its schedule's date when moved. */}
                  {charge.charge_date && charge.charge_date !== charge.date && (
                    <>
                      {' '}
                      {t('charges.scheduledFor', {
                        date: formatCalendarDate(charge.charge_date),
                      })}
                    </>
                  )}
                  {' · '}
                  {path(charge.category_name, charge.parent_category_name)}
                </span>
              </div>
              <ChargeAnswers
                budgetId={budgetId}
                charge={charge}
                onAnswer={() => {
                  answeredIndex.current = index
                }}
              />
            </li>
          ))}
        </ul>
        {total > shown.length && (
          <Button asChild variant="link" className="self-start px-0">
            <Link to={`${paths.transactions}?period=all`} data-testid="charges-see-all">
              {t('charges.seeAll', { count: total - shown.length })}
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
