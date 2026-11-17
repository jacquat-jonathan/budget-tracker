import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { budgetKeys } from '@/features/budgets/budget-keys'
import { unwrap, usePeriodDependentQuery, type PeriodRead } from '@/features/budgets/budget-queries'
import { useRecord } from '@/features/budgets/record-queries'
import type { Database, Tables } from '@/lib/database.types'
import { DB_ERROR_CODES, type DbErrorCode } from '@/lib/db-errors'
import { supabase } from '@/lib/supabase'

type Fns = Database['public']['Functions']
export type TransferSchedule = Database['public']['Enums']['transfer_schedule']
export type TransferCadence = 'monthly' | 'quarterly' | 'yearly'
export const TRANSFER_CADENCES: readonly TransferCadence[] = ['monthly', 'quarterly', 'yearly']

type TransferRead = Tables<'transfer_overview'>

/** A planned transfer as the contract describes it; the flags and counts are never null. */
export interface Transfer extends Omit<
  TransferRead,
  | 'is_active'
  | 'follows_primary'
  | 'has_history'
  | 'removal_deletes'
  | 'transaction_count'
  | 'monthly_amount'
  | 'cadence'
> {
  is_active: boolean
  follows_primary: boolean
  has_history: boolean
  removal_deletes: boolean
  transaction_count: number
  monthly_amount: number
  cadence: TransferCadence | null
}

export function readTransfer(row: TransferRead): Transfer {
  return {
    ...row,
    is_active: row.is_active === true,
    follows_primary: row.follows_primary === true,
    has_history: row.has_history === true,
    removal_deletes: row.removal_deletes === true,
    transaction_count: row.transaction_count ?? 0,
    monthly_amount: row.monthly_amount ?? row.amount,
    cadence: (row.cadence as TransferCadence | null) ?? null,
  }
}

/** Never in force (removed in its first period, or kept by a reopen for its marks only). */
export function isVoidTransfer(transfer: Pick<Transfer, 'first_seq' | 'end_seq'>): boolean {
  return transfer.end_seq !== null && transfer.end_seq <= transfer.first_seq
}

/** At most 900 rows of transfers a budget (R-ACCOUNT-230). */
const TRANSFER_ROWS = 900

/**
 * Every planned transfer, ended ones included, by name (bounded by the contract's 900 rows).
 * Next due dates depend on today and the periods: read after the catch-up.
 */
export function useTransfers(budgetId: string): PeriodRead<Transfer[]> {
  return usePeriodDependentQuery(budgetId, budgetKeys.transfers(budgetId), async () =>
    unwrap(
      await supabase
        .from('transfer_overview')
        .select('*')
        .eq('budget_id', budgetId)
        .order('name')
        .order('id')
        .limit(TRANSFER_ROWS),
    ).map(readTransfer),
  )
}

export function useTransferRecord(
  budgetId: string,
  id: string | undefined,
): Transfer | null | undefined {
  const row = useRecord('transfer_overview', budgetId, id)
  return useMemo(() => (row ? readTransfer(row) : row), [row])
}

/** The arguments of a transfer's terms, as a save and its preview both send them. */
export interface TransferTermsArgs {
  p_from_account_id?: string
  p_to_account_id?: string
  p_amount?: number
  p_schedule?: TransferSchedule
  p_offset_days?: number
  p_day_of_month?: number
  p_income_id?: string
  p_clear_income?: boolean
  p_is_automatic?: boolean
  p_category_id?: string
  p_clear_category?: boolean
  p_from_period_id?: string
  p_cadence?: TransferCadence
  p_first_date?: string
}

export type TransferPreviewRow = Fns['preview_create_transfer']['Returns'][number]

/** What a create or edit would do, as its preview answers (R-ACCOUNT-233, R-ACCOUNT-303). */
export interface TransferPreview {
  /** The occurrences the terms govern, by due date (none when they govern none). */
  rows: TransferPreviewRow[]
  createdAtOnce: number
  transactionsRemoved: number
  marksUnplanned: number
}

/** How many occurrences a form shows. */
export const PREVIEW_ROWS = 6

function readPreview(rows: TransferPreviewRow[]): TransferPreview {
  const first = rows[0]
  return {
    // A single row without an occurrence carries the counts only (D-428).
    rows: rows.filter((row) => (row.occurrence_date as string | null) !== null),
    createdAtOnce: first?.created_at_once_count ?? 0,
    transactionsRemoved: first?.transactions_removed_count ?? 0,
    marksUnplanned: first?.marks_unplanned_count ?? 0,
  }
}

export interface CreateArgs extends TransferTermsArgs {
  p_from_account_id: string
  p_to_account_id: string
  p_amount: number
  p_schedule: TransferSchedule
}

/** preview_create_transfer for exactly the arguments the save will send. */
export function usePreviewCreateTransfer(budgetId: string, args: CreateArgs | null) {
  return useQuery({
    queryKey: [...budgetKeys.budget(budgetId), 'preview-create-transfer', args] as const,
    enabled: args !== null,
    staleTime: 0,
    queryFn: async (): Promise<TransferPreview> =>
      readPreview(
        unwrap(
          await supabase.rpc('preview_create_transfer', {
            p_budget_id: budgetId,
            ...(args as CreateArgs),
            p_count: PREVIEW_ROWS,
          }),
        ),
      ),
  })
}

/** preview_update_transfer for exactly the terms arguments the save will send. */
export function usePreviewUpdateTransfer(
  budgetId: string,
  transferId: string | undefined,
  args: TransferTermsArgs | null,
) {
  return useQuery({
    queryKey: [
      ...budgetKeys.budget(budgetId),
      'preview-update-transfer',
      transferId ?? '',
      args,
    ] as const,
    enabled: args !== null && transferId !== undefined,
    staleTime: 0,
    queryFn: async (): Promise<TransferPreview> =>
      readPreview(
        unwrap(
          await supabase.rpc('preview_update_transfer', {
            p_transfer_id: transferId ?? '',
            ...(args ?? {}),
            p_count: PREVIEW_ROWS,
          }),
        ),
      ),
  })
}

export interface EndPreview {
  outcome: 'deleted' | 'ended' | null
  refusal: DbErrorCode | null
  occurrencesRemoved: number
  marksKept: number
  transactionsKept: number
}

/** preview_end_transfer from the chosen period (the current one when null). */
export function useEndPreview(budgetId: string, transferId: string, periodId: string | null) {
  return useQuery({
    queryKey: [
      ...budgetKeys.budget(budgetId),
      'end-transfer-preview',
      transferId,
      periodId ?? '',
    ] as const,
    staleTime: 0,
    queryFn: async (): Promise<EndPreview> => {
      const row = unwrap(
        await supabase.rpc('preview_end_transfer', {
          p_transfer_id: transferId,
          ...(periodId ? { p_from_period_id: periodId } : {}),
        }),
      )[0]
      return {
        outcome: row?.outcome === 'deleted' || row?.outcome === 'ended' ? row.outcome : null,
        refusal: (DB_ERROR_CODES as readonly string[]).includes(row?.refusal ?? '')
          ? (row?.refusal as DbErrorCode)
          : null,
        occurrencesRemoved: row?.occurrences_removed ?? 0,
        marksKept: row?.marks_kept ?? 0,
        transactionsKept: row?.transactions_kept ?? 0,
      }
    },
  })
}

type TermsRow = Fns['get_transfer_terms']['Returns'][number]

/** The terms in force in a chosen period (get_transfer_terms), for a correction (D-219). */
export interface TransferTermsAt {
  inForce: boolean
  terms: TermsRow | null
  termsFromPeriodId: string | null
  untilPeriodId: string | null
}

export function useTransferTermsAt(
  budgetId: string,
  transferId: string | undefined,
  periodId: string | null,
) {
  return useQuery({
    queryKey: [
      ...budgetKeys.budget(budgetId),
      'terms-at',
      'transfer',
      transferId ?? '',
      periodId ?? '',
    ] as const,
    enabled: transferId !== undefined && periodId !== null,
    staleTime: 0,
    queryFn: async (): Promise<TransferTermsAt> => {
      const row = unwrap(
        await supabase.rpc('get_transfer_terms', {
          p_transfer_id: transferId ?? '',
          p_period_id: periodId ?? '',
        }),
      )[0]
      const inForce = row?.in_force === true
      return {
        inForce,
        terms: inForce && row ? row : null,
        termsFromPeriodId: (row?.terms_from_period_id as string | null | undefined) ?? null,
        untilPeriodId: (row?.until_period_id as string | null | undefined) ?? null,
      }
    },
  })
}
