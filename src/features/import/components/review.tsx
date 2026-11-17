import { useQuery } from '@tanstack/react-query'
import { CheckIcon, FileInputIcon, ListChecksIcon, SparklesIcon, TagIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { transactionsOf } from '@/app/paths'
import { ExternalText } from '@/components/external-text'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { budgetKeys } from '@/features/budgets/budget-keys'
import { unwrap, useBudgetStatus } from '@/features/budgets/budget-queries'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'
import type { Transaction } from '@/features/transactions/transaction-queries'
import { useAppMutation } from '@/hooks/use-app-mutation'
import { formatCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { supabase } from '@/lib/supabase'

const affected = (budgetId: string) => [budgetKeys.budget(budgetId)]

/** "To review", or "needs a category" while it waits in "to categorise", in words and a mark. */
export function ReviewBadge({ row }: { row: Transaction }) {
  const { t } = useTranslation()
  if (row.review_state !== 'to_review') return null
  return (
    <Badge
      variant="outline"
      className="shrink-0 border-sky-600/40 bg-sky-500/10 text-sky-900 dark:text-sky-100"
      data-testid="to-review"
    >
      {row.in_to_categorise ? <TagIcon aria-hidden /> : <ListChecksIcon aria-hidden />}
      {row.in_to_categorise ? t('import.review.inToCategorise') : t('import.review.toReview')}
    </Badge>
  )
}

/**
 * Confirm one imported transaction (confirm_import): not while it waits in "to categorise",
 * which says why instead.
 */
// R-IMPORT-209: confirmed one by one, never while in "to categorise".
export function ConfirmImportButton({
  budgetId,
  row,
  label,
}: {
  budgetId: string
  row: Transaction
  label: string
}) {
  const { t } = useTranslation()
  const confirm = useAppMutation<null>({
    errorMessages: { category_to_categorise: 'import.toCategorise.errors.confirm' },
    mutationFn: async () => {
      unwrap(
        await supabase.rpc('confirm_import', {
          p_transaction_id: row.id,
          p_expected_revision: row.revision,
        }),
      )
      return null
    },
    success: () => t('import.review.confirmed'),
    invalidate: () => affected(budgetId),
  })
  if (row.review_state !== 'to_review') return null
  if (row.in_to_categorise) {
    return <span className="text-xs text-muted-foreground">{t('import.review.cannotConfirm')}</span>
  }
  return (
    <Button
      type="button"
      size="xs"
      variant="outline"
      disabled={confirm.isPending}
      onClick={() => confirm.mutate()}
      aria-label={t('import.review.confirmFor', { row: label })}
    >
      <CheckIcon aria-hidden />
      {t('import.review.confirm')}
    </Button>
  )
}

/** Confirm every transaction to review, or every one of a batch (confirm_imports). */
export function ConfirmImportsButton({
  budgetId,
  batchId,
}: {
  budgetId: string
  batchId: string | null
}) {
  const { t } = useTranslation()
  const confirm = useAppMutation<{ confirmed: number; left_to_categorise: number } | null>({
    mutationFn: async () =>
      unwrap(
        await supabase.rpc('confirm_imports', {
          p_budget_id: budgetId,
          ...(batchId ? { p_batch_id: batchId } : {}),
        }),
      )[0] ?? null,
    success: (result) =>
      [
        t('import.review.confirmAllDone', { count: result?.confirmed ?? 0 }),
        (result?.left_to_categorise ?? 0) > 0
          ? t('import.review.leftToCategorise', { count: result?.left_to_categorise ?? 0 })
          : '',
      ]
        .filter(Boolean)
        .join(' '),
    invalidate: () => affected(budgetId),
  })
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={confirm.isPending}
      onClick={() => confirm.mutate()}
    >
      <ListChecksIcon aria-hidden />
      {batchId ? t('import.review.confirmBatch') : t('import.review.confirmAll')}
    </Button>
  )
}

const DETAIL_KEYS = [
  'purchase_time',
  'booking_date',
  'value_date',
  'card',
  'exchange_rate',
  'fee',
  'merchant_category',
  'security',
  'location',
] as const

/** An imported transaction's source and the statement's extra data, on request. */
export function ImportedDetails({ row }: { row: Transaction }) {
  const { t } = useTranslation()
  if (!row.import_batch_id) return null
  const details =
    row.details && typeof row.details === 'object' && !Array.isArray(row.details)
      ? (row.details as Record<string, unknown>)
      : {}
  const items: { key: string; label: string; value: string }[] = []
  for (const key of DETAIL_KEYS) {
    const value = details[key]
    if (typeof value !== 'string' && typeof value !== 'number') continue
    const text =
      key === 'fee' && typeof value === 'number'
        ? formatMoney(value)
        : (key === 'booking_date' || key === 'value_date') && typeof value === 'string'
          ? formatCalendarDate(value)
          : String(value)
    items.push({ key, label: t(`import.preview.detailKeys.${key}`), value: text })
  }
  if (
    typeof details.original_currency === 'string' &&
    typeof details.original_amount === 'number'
  ) {
    items.push({
      key: 'original',
      label: t('import.preview.detailKeys.original'),
      value: `${details.original_currency} ${formatMoney(details.original_amount, { currency: false })}`,
    })
  }
  if (row.merchant)
    items.push({
      key: 'merchant',
      label: t('import.preview.detailKeys.merchant'),
      value: row.merchant,
    })
  if (row.bank_transaction_id) {
    items.push({
      key: 'bank',
      label: t('import.preview.detailKeys.bank_transaction_id'),
      value: row.bank_transaction_id,
    })
  }
  const source =
    row.import_source && row.import_source in SOURCE_KEYS
      ? t(`import.sources.${row.import_source as keyof typeof SOURCE_KEYS}`)
      : ''
  return (
    <details className="mt-1 text-xs">
      <summary className="w-fit cursor-pointer rounded text-muted-foreground underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
        <FileInputIcon className="mr-1 inline size-3" aria-hidden />
        {t('import.review.imported', { source })}
      </summary>
      {items.length > 0 && (
        <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 rounded-md bg-muted/40 p-2">
          {items.map((item) => (
            <div key={item.key} className="contents">
              <dt className="text-muted-foreground">{item.label}</dt>
              <dd className="min-w-0">
                <ExternalText>{item.value}</ExternalText>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </details>
  )
}

const SOURCE_KEYS = {
  migros_account: 1,
  migros_card: 1,
  yuh: 1,
  csv: 1,
  script: 1,
  other: 1,
} as const

/** The dashboard's card: how many imported transactions wait (my_budgets.to_review), and a link. */
// R-IMPORT-081: the budget says how many are to review.
export function ToReviewCard() {
  const { t } = useTranslation()
  const { budgetId } = useCurrentBudget()
  const status = useBudgetStatus(budgetId)
  const count = status.data?.to_review ?? 0
  if (count === 0) return null
  return (
    <Card data-testid="to-review-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecksIcon className="size-4 text-muted-foreground" aria-hidden />
          <h2>{t('import.review.cardTitle')}</h2>
        </CardTitle>
        <CardDescription>{t('import.review.cardBody', { count })}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild size="sm">
          <Link to={transactionsOf({ review: true })}>{t('import.review.cardLink')}</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

/**
 * After an imported transaction to review got its category: "always put this merchant in this
 * category?", with the merchant key the database computed, and how many others it moves, as
 * preview_merchant_rule answers (D-457): exactly what one click then moves; not offered when a
 * rule already covers the key. One click creates the rule and moves them (create_merchant_rule
 * with p_apply).
 */
// R-IMPORT-007: one click to always put this merchant in this category.
export function RuleOffer({
  budgetId,
  before,
  after,
  onClose,
}: {
  budgetId: string
  before: Transaction
  after: Transaction
  onClose: () => void
}) {
  const { t } = useTranslation()
  const key = after.merchant_key
  const eligible =
    before.review_state === 'to_review' &&
    key !== null &&
    key !== '' &&
    after.category_id !== null &&
    after.category_id !== before.category_id &&
    after.in_to_categorise !== true
  const preview = useQuery({
    queryKey: [
      ...budgetKeys.merchantRules(budgetId),
      'preview',
      key ?? '',
      after.category_id ?? '',
    ] as const,
    enabled: eligible,
    staleTime: 0,
    queryFn: async () =>
      unwrap(
        await supabase.rpc('preview_merchant_rule', {
          p_budget_id: budgetId,
          p_fragment: key ?? '',
          p_category_id: after.category_id ?? '',
        }),
      )[0] ?? null,
  })
  const answer = preview.data
  // The generated type says string; the call answers null when no rule covers the key.
  const covered = !answer || Boolean(answer.covered_by_rule_id) || answer.rule_exists
  const others = answer?.would_move ?? 0
  const create = useAppMutation<{ moved: number } | null>({
    errorMessages: { category_to_categorise: 'import.toCategorise.errors.rule' },
    mutationFn: async () =>
      unwrap(
        await supabase.rpc('create_merchant_rule', {
          p_budget_id: budgetId,
          p_fragment: key ?? '',
          p_category_id: after.category_id ?? '',
          p_apply: true,
        }),
      )[0] ?? null,
    success: (result) =>
      (result?.moved ?? 0) > 0
        ? t('import.review.rule.createdMoved', { key: key ?? '', count: result?.moved ?? 0 })
        : t('import.review.rule.created', { key: key ?? '' }),
    onSuccess: onClose,
    invalidate: () => [...affected(budgetId), budgetKeys.merchantRules(budgetId)],
  })
  if (!eligible || covered) return null
  const category = after.parent_category_name
    ? `${after.parent_category_name} › ${after.category_name ?? ''}`
    : (after.category_name ?? '')
  return (
    // R-IMPORT-365: fixed in the window (under the header on a phone, bottom left beside the sidebar, away
    // from the toasts): in view wherever the saved row is, never scrolling the
    // page, and it takes no focus by itself (a stray Enter would create a rule).
    <Alert
      data-testid="rule-offer"
      role="region"
      aria-label={t('import.review.rule.title')}
      className="fixed inset-x-4 top-16 z-40 max-h-[50vh] w-auto overflow-y-auto shadow-lg md:top-auto md:right-auto md:bottom-4 md:left-[calc(var(--sidebar-width)+1rem)] md:w-[28rem]"
    >
      <SparklesIcon aria-hidden />
      <AlertTitle>{t('import.review.rule.title')}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <p>{t('import.review.rule.body', { key: `\u2068${key}\u2069`, category })}</p>
        {others > 0 && (
          <p>
            {t('import.review.rule.alsoMove', { count: others })}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            {t('import.review.rule.create')}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            {t('import.review.rule.dismiss')}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
