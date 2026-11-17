import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { budgetKeys } from '@/features/budgets/budget-keys'
import {
  unwrap,
  usePeriodDependentQuery,
  type PeriodRead,
  type PeriodSummary,
} from '@/features/budgets/budget-queries'
import { useRecord } from '@/features/budgets/record-queries'
import type { Database, Tables } from '@/lib/database.types'
import { DB_ERROR_CODES, type DbErrorCode } from '@/lib/db-errors'
import { supabase } from '@/lib/supabase'

export type AccountKind = Database['public']['Enums']['account_kind']

/** Every kind of account, in the order the form offers them. */
export const ACCOUNT_KINDS: readonly AccountKind[] = [
  'current',
  'savings',
  'third_pillar',
  'tax_reserve',
  'investment',
  'cash',
  'credit_card',
  'other',
]

type AccountRead = Tables<'account_overview'>

/**
 * An account as the contract describes it: the flags are never null (the generated view type
 * marks them nullable); user_is_member is null for a shared account. Narrowed here, once.
 */
export interface Account extends Omit<AccountRead, 'is_active' | 'in_use' | 'removal_deletes'> {
  is_active: boolean
  in_use: boolean
  removal_deletes: boolean
}

export function readAccount(row: AccountRead): Account {
  return {
    ...row,
    is_active: row.is_active === true,
    in_use: row.in_use === true,
    removal_deletes: row.removal_deletes === true,
  }
}

/** A void account was never in force (closed in its first period). */
export function isVoidAccount(account: Pick<Account, 'first_seq' | 'end_seq'>): boolean {
  return account.end_seq !== null && account.end_seq <= account.first_seq
}

/** In force in a period, by the validity the database gives (first_seq, end_seq). */
export function inForceIn(
  record: { first_seq: number; end_seq: number | null },
  period: Pick<PeriodSummary, 'seq'> | null | undefined,
): boolean {
  if (!period) return false
  return record.first_seq <= period.seq && (record.end_seq === null || period.seq < record.end_seq)
}

/** The most accounts a budget holds, with closed and void ones (R-ACCOUNT-230). */
const ACCOUNT_ROWS = 900

/**
 * Every account of the budget, closed and void ones included, by name: bounded by the
 * contract's 900 rows (R-APP-170). "In force now" depends on the periods: read after the
 * catch-up.
 */
export function useAccounts(budgetId: string): PeriodRead<Account[]> {
  return usePeriodDependentQuery(budgetId, budgetKeys.accounts(budgetId), async () =>
    unwrap(
      await supabase
        .from('account_overview')
        .select('*')
        .eq('budget_id', budgetId)
        .order('name')
        .order('id')
        .limit(ACCOUNT_ROWS),
    ).map(readAccount),
  )
}

/** One account read by its id (for an edit form or a closing), narrowed. */
export function useAccountRecord(
  budgetId: string,
  id: string | undefined,
): Account | null | undefined {
  const row = useRecord('account_overview', budgetId, id)
  return useMemo(() => (row ? readAccount(row) : row), [row])
}

/** What uses an account from a period on, as account_in_use names it. */
export interface AccountUser {
  kind: 'income' | 'transfer'
  id: string
  name: string
}

/** The used_by list of preview_close_account, or the detail of account_in_use (JSON text). */
export function readUsedBy(value: unknown): AccountUser[] {
  let list: unknown = value
  if (typeof value === 'string') {
    try {
      list = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  return list.flatMap((item): AccountUser[] => {
    const entry = item as Partial<AccountUser> | null
    return entry &&
      (entry.kind === 'income' || entry.kind === 'transfer') &&
      typeof entry.id === 'string' &&
      typeof entry.name === 'string'
      ? [{ kind: entry.kind, id: entry.id, name: entry.name }]
      : []
  })
}

export interface CloseOutcome {
  outcome: 'deleted' | 'ended' | null
  refusal: DbErrorCode | null
  usedBy: AccountUser[]
}

/**
 * What closing the account from the chosen period (the current one when null) would do now,
 * with close_account's own checks (preview_close_account): the dialog says the one outcome,
 * or the refusal with what uses the account (R-ACCOUNT-232).
 */
export function useClosePreview(budgetId: string, accountId: string, periodId: string | null) {
  return useQuery({
    queryKey: [
      ...budgetKeys.budget(budgetId),
      'close-account-preview',
      accountId,
      periodId ?? '',
    ] as const,
    staleTime: 0,
    queryFn: async (): Promise<CloseOutcome> => {
      const row = unwrap(
        await supabase.rpc('preview_close_account', {
          p_account_id: accountId,
          ...(periodId ? { p_from_period_id: periodId } : {}),
        }),
      )[0]
      const outcome = row?.outcome === 'deleted' || row?.outcome === 'ended' ? row.outcome : null
      const refusal = (DB_ERROR_CODES as readonly string[]).includes(row?.refusal ?? '')
        ? (row?.refusal as DbErrorCode)
        : null
      return { outcome, refusal, usedBy: readUsedBy(row?.used_by) }
    },
  })
}
