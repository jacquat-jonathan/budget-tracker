import { useTranslation } from 'react-i18next'

import { budgetKeys } from '@/features/budgets/budget-keys'
import { unwrap } from '@/features/budgets/budget-queries'
import type { Cadence, Category } from '@/features/categories/category-queries'
import { useAppMutation } from '@/hooks/use-app-mutation'
import { supabase } from '@/lib/supabase'

// A category change moves the totals, the amount left to assign and every progress view:
// refetch everything of the budget.
const affected = (budgetId: string) => [budgetKeys.budget(budgetId)]

export interface CreateCategoryInput {
  name: string
  /** A subcategory of this top-level category; a top-level category when null. */
  parentId: string | null
  amount: number
  cadence: Cadence
  /** An earlier period it counts from (an explicit choice); the current one when null. */
  fromPeriodId: string | null
}

export function useCreateCategory(budgetId: string, options: { onDone: () => void }) {
  const { t } = useTranslation()
  return useAppMutation<string, CreateCategoryInput>({
    errorDisplay: 'inline',
    mutationFn: async (input) => {
      const rows = unwrap(
        await supabase.rpc('create_category', {
          p_budget_id: budgetId,
          p_name: input.name,
          p_amount: input.amount,
          p_cadence: input.cadence,
          ...(input.parentId
            ? // R-CATEGORY-092: the translated "Other", always sent with a subcategory; the
              // database uses it only when the parent's amount or transactions must move.
              { p_parent_id: input.parentId, p_other_name: t('categories.otherName') }
            : {}),
          ...(input.fromPeriodId ? { p_from_period_id: input.fromPeriodId } : {}),
        }),
      )
      return rows[0]?.id ?? ''
    },
    success: (_id, input) => t('categories.created', { name: input.name }),
    onSuccess: () => options.onDone(),
    invalidate: () => affected(budgetId),
  })
}

export interface UpdateCategoryInput {
  category: Category
  /** The revision when the form was opened (useEditBase). */
  revision: number
  name: string
  /** Omitted for a group, which has no expectation. */
  amount: number | null
  cadence: Cadence | null
  /** An explicit correction from an earlier period; the current period when null. */
  fromPeriodId: string | null
}

/**
 * Rename and/or change the expectation, in one call. Only what changed is sent; a correction
 * always sends the expectation, so it can re-apply today's amount to earlier periods.
 * Returns false when there was nothing to save.
 */
export function useUpdateCategory(budgetId: string, options: { onDone: () => void }) {
  const { t } = useTranslation()
  return useAppMutation<boolean, UpdateCategoryInput>({
    errorDisplay: 'inline',
    mutationFn: async ({ category, revision, name, amount, cadence, fromPeriodId }) => {
      const renamed = name !== category.name
      const correcting = fromPeriodId !== null && !category.is_group
      const amountChanged = amount !== null && (correcting || amount !== category.amount)
      const cadenceChanged = cadence !== null && (correcting || cadence !== category.cadence)
      if (!renamed && !amountChanged && !cadenceChanged) return false
      unwrap(
        await supabase.rpc('update_category', {
          p_category_id: category.id,
          p_expected_revision: revision,
          ...(renamed ? { p_name: name } : {}),
          ...(amountChanged ? { p_amount: amount } : {}),
          ...(cadenceChanged ? { p_cadence: cadence } : {}),
          ...(correcting ? { p_from_period_id: fromPeriodId } : {}),
        }),
      )
      return true
    },
    success: (saved, input) => (saved ? t('categories.saved', { name: input.name }) : ''),
    onSuccess: () => options.onDone(),
    invalidate: () => affected(budgetId),
  })
}

export function useReorderCategories(budgetId: string) {
  return useAppMutation<null, { parentId: string | null; ids: string[] }>({
    mutationFn: async ({ parentId, ids }) => {
      unwrap(
        await supabase.rpc('reorder_categories', {
          p_budget_id: budgetId,
          p_category_ids: ids,
          ...(parentId ? { p_parent_id: parentId } : {}),
        }),
      )
      return null
    },
    invalidate: () => [budgetKeys.categories(budgetId)],
  })
}

export interface EndCategoryInput {
  category: Category
  revision: number
  /** An explicit correction from an earlier period; the current period when null. */
  fromPeriodId: string | null
  /** Added this period with transactions: it is kept without a plan, not kept for the past. */
  keptVoid: boolean
}

export function useEndCategory(budgetId: string) {
  const { t } = useTranslation()
  return useAppMutation<string, EndCategoryInput>({
    errorDisplay: 'inline',
    mutationFn: async ({ category, revision, fromPeriodId }) =>
      unwrap(
        await supabase.rpc('end_category', {
          p_category_id: category.id,
          p_expected_revision: revision,
          ...(fromPeriodId ? { p_from_period_id: fromPeriodId } : {}),
        }),
      ),
    success: (outcome, { category, fromPeriodId, keptVoid }) =>
      outcome === 'deleted'
        ? t('categories.deleted', { name: category.name })
        : fromPeriodId
          ? t('categories.endedFromEarlier', { name: category.name })
          : keptVoid
            ? t('categories.endedKeptVoid', { name: category.name })
            : t('categories.ended', { name: category.name }),
    invalidate: () => affected(budgetId),
  })
}

export interface ExtendCategoryInput {
  category: Category
  revision: number
  /** The earlier period it now counts from (before its first one). */
  fromPeriodId: string
  /** The expectation there; null for a group. */
  amount: number | null
  cadence: Cadence | null
}

/** R-CATEGORY-100: an explicit correction: an existing category counts from an earlier period. */
export function useExtendCategory(budgetId: string, options: { onDone: () => void }) {
  const { t } = useTranslation()
  return useAppMutation<null, ExtendCategoryInput>({
    errorDisplay: 'inline',
    mutationFn: async ({ category, revision, fromPeriodId, amount, cadence }) => {
      unwrap(
        await supabase.rpc('extend_category', {
          p_category_id: category.id,
          p_expected_revision: revision,
          p_from_period_id: fromPeriodId,
          ...(amount !== null ? { p_amount: amount } : {}),
          ...(cadence !== null ? { p_cadence: cadence } : {}),
        }),
      )
      return null
    },
    success: (_data, { category }) => t('categories.extended', { name: category.name }),
    onSuccess: () => options.onDone(),
    invalidate: () => affected(budgetId),
  })
}

export interface RestoreCategoryInput {
  category: Category
  revision: number
  /**
   * As a correction, the period it ended in: as if it had never ended. Null: in force again
   * from the current period, nothing expected in the periods between.
   */
  fromPeriodId: string | null
  amount: number | null
  cadence: Cadence | null
}

/** R-CATEGORY-101: an ended category in force again. */
export function useRestoreCategory(budgetId: string, options: { onDone: () => void }) {
  const { t } = useTranslation()
  return useAppMutation<null, RestoreCategoryInput>({
    errorDisplay: 'inline',
    mutationFn: async ({ category, revision, fromPeriodId, amount, cadence }) => {
      unwrap(
        await supabase.rpc('restore_category', {
          p_category_id: category.id,
          p_expected_revision: revision,
          ...(fromPeriodId ? { p_from_period_id: fromPeriodId } : {}),
          ...(amount !== null ? { p_amount: amount } : {}),
          ...(cadence !== null ? { p_cadence: cadence } : {}),
        }),
      )
      return null
    },
    success: (_data, { category }) => t('categories.restored', { name: category.name }),
    onSuccess: () => options.onDone(),
    invalidate: () => affected(budgetId),
  })
}
