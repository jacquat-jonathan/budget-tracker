import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { budgetKeys } from '@/features/budgets/budget-keys'
import { unwrap } from '@/features/budgets/budget-queries'
import type { Database, Tables } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

type Functions = Database['public']['Functions']

export type ImportRowResult = Database['public']['CompositeTypes']['import_row_result']
export type ImportBatch = Tables<'import_batch_list'>
export type SkippedRow = Functions['list_import_skipped_rows']['Returns'][number]
export type RememberedChoice = Functions['list_import_choices']['Returns'][number]
export type ImportToken = Tables<'import_token_list'>
export type MerchantRule = Tables<'merchant_rule_list'>
export type ExistingTransaction = Pick<
  Tables<'transaction_list'>,
  | 'id'
  | 'date'
  | 'amount'
  | 'kind'
  | 'description'
  | 'category_name'
  | 'review_state'
  | 'subscription_name'
  | 'recorded_by_name'
  | 'import_batch_id'
>

/** What a row does, as the database names it. */
export type RowAction =
  | 'import'
  | 'skip_duplicate'
  | 'skip_flagged'
  | 'skip_matched'
  | 'confirm_match'
  | 'skip_chosen'
  | 'invalid'

export const ROW_ACTIONS: readonly RowAction[] = [
  'import',
  'skip_duplicate',
  'skip_flagged',
  'skip_matched',
  'confirm_match',
  'skip_chosen',
  'invalid',
]

export function rowAction(result: Pick<ImportRowResult, 'action'>): RowAction {
  const action = result.action as RowAction | null
  return action !== null && ROW_ACTIONS.includes(action) ? action : 'invalid'
}

/** Batches per page of list_import_batches (1 to 200). */
export const BATCH_PAGE = 20

/** The budget's import batches, newest first, a page at a time (R-IMPORT-257). */
export function useImportBatches(budgetId: string) {
  const query = useInfiniteQuery({
    queryKey: [...budgetKeys.imports(budgetId), 'batches'] as const,
    initialPageParam: null as { createdAt: string; id: string } | null,
    queryFn: async ({ pageParam }): Promise<ImportBatch[]> =>
      unwrap(
        await supabase.rpc('list_import_batches', {
          p_budget_id: budgetId,
          p_limit: BATCH_PAGE,
          ...(pageParam
            ? { p_before_created_at: pageParam.createdAt, p_before_id: pageParam.id }
            : {}),
        }),
      ),
    getNextPageParam: (page) => {
      const last = page.at(-1)
      return page.length < BATCH_PAGE || !last ? null : { createdAt: last.created_at, id: last.id }
    },
  })
  const pages = query.data?.pages
  const data = useMemo(() => pages?.flat(), [pages])
  return { ...query, data }
}

/** Skipped rows per page of list_import_skipped_rows (1 to 200). */
export const SKIPPED_PAGE = 100

/** A batch's rows that were not imported, in statement order, a page at a time (R-IMPORT-072). */
export function useSkippedRows(budgetId: string, batchId: string | null) {
  const query = useInfiniteQuery({
    queryKey: [...budgetKeys.imports(budgetId), 'skipped', batchId ?? ''] as const,
    enabled: batchId !== null,
    initialPageParam: null as { chunk: number; rowNo: number } | null,
    queryFn: async ({ pageParam }): Promise<SkippedRow[]> =>
      unwrap(
        await supabase.rpc('list_import_skipped_rows', {
          p_batch_id: batchId ?? '',
          p_limit: SKIPPED_PAGE,
          ...(pageParam ? { p_after_chunk: pageParam.chunk, p_after_row_no: pageParam.rowNo } : {}),
        }),
      ),
    getNextPageParam: (page) => {
      const last = page.at(-1)
      return page.length < SKIPPED_PAGE || !last ? null : { chunk: last.chunk, rowNo: last.row_no }
    },
  })
  const pages = query.data?.pages
  const data = useMemo(() => pages?.flat(), [pages])
  return { ...query, data }
}

/** Remembered choices per page (1 to 200). */
export const CHOICE_PAGE = 100

/** The choices remembered for flagged entries, by flag then key (R-IMPORT-092). */
export function useRememberedChoices(budgetId: string) {
  const query = useInfiniteQuery({
    queryKey: [...budgetKeys.imports(budgetId), 'choices'] as const,
    initialPageParam: null as { flag: string; key: string } | null,
    queryFn: async ({ pageParam }): Promise<RememberedChoice[]> =>
      unwrap(
        await supabase.rpc('list_import_choices', {
          p_budget_id: budgetId,
          p_limit: CHOICE_PAGE,
          ...(pageParam ? { p_after_flag: pageParam.flag, p_after_key: pageParam.key } : {}),
        }),
      ),
    getNextPageParam: (page) => {
      const last = page.at(-1)
      return page.length < CHOICE_PAGE || !last
        ? null
        : { flag: last.flag, key: last.counterparty_key }
    },
  })
  const pages = query.data?.pages
  const data = useMemo(() => pages?.flat(), [pages])
  return { ...query, data }
}

/** The budget's import tokens (at most 30 rows), newest first. Never the secret. */
export function useImportTokens(budgetId: string) {
  return useQuery({
    queryKey: budgetKeys.importTokens(budgetId),
    queryFn: async (): Promise<ImportToken[]> =>
      unwrap(
        await supabase
          .from('import_token_list')
          .select('*')
          .eq('budget_id', budgetId)
          .order('created_at', { ascending: false })
          .order('id'),
      ),
  })
}

/** The budget's merchant rules (at most 500), by fragment. */
export function useMerchantRules(budgetId: string) {
  return useQuery({
    queryKey: budgetKeys.merchantRules(budgetId),
    queryFn: async (): Promise<MerchantRule[]> =>
      unwrap(
        await supabase
          .from('merchant_rule_list')
          .select('*')
          .eq('budget_id', budgetId)
          .order('fragment')
          .order('id'),
      ),
  })
}

/**
 * The existing transactions a preview names (a duplicate or a match), read by their ids, so
 * each row can say what it duplicates or matches.
 */
export function useExistingTransactions(budgetId: string, ids: readonly string[]) {
  const sorted = useMemo(() => [...new Set(ids)].sort(), [ids])
  return useQuery({
    queryKey: [...budgetKeys.transactions(budgetId), 'by-ids', sorted] as const,
    enabled: sorted.length > 0,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<Map<string, ExistingTransaction>> => {
      const found = new Map<string, ExistingTransaction>()
      // A hundred ids a request keeps the address short.
      for (let start = 0; start < sorted.length; start += 100) {
        const rows = unwrap(
          await supabase
            .from('transaction_list')
            .select(
              'id, date, amount, kind, description, category_name, review_state, subscription_name, recorded_by_name, import_batch_id',
            )
            .eq('budget_id', budgetId)
            .in('id', sorted.slice(start, start + 100)),
        ) as ExistingTransaction[]
        for (const row of rows) found.set(row.id, row)
      }
      return found
    },
  })
}
