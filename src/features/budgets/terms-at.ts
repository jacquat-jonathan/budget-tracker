import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import type { FieldValues, Path, PathValue, UseFormReturn } from 'react-hook-form'

import { budgetKeys } from '@/features/budgets/budget-keys'
import { unwrap } from '@/features/budgets/budget-queries'
import type { Tables } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

/** The version tables of docs/database.md, each keyed by its record and effective_from_seq. */
const VERSIONS = {
  income: { table: 'income_versions', column: 'income_id' },
  category: { table: 'category_expectations', column: 'category_id' },
  subscription: { table: 'subscription_versions', column: 'subscription_id' },
  debt: { table: 'debt_versions', column: 'debt_id' },
} as const

type Kind = keyof typeof VERSIONS
export type VersionOf<K extends Kind> = Tables<(typeof VERSIONS)[K]['table']>

/**
 * The terms a record had in force in an earlier period, as the database stored them: its
 * version row with the greatest effective_from_seq not after the period's seq (the
 * contract's versioning rule, read, not recomputed). What a correction starts from, and
 * what it compares with to send only what the user changed.
 */
// R-VERSION-140: a correction starts from, and is compared with, the terms of its period.
export function useTermsAt<K extends Kind>(
  kind: K,
  budgetId: string,
  id: string | undefined,
  seq: number | null,
) {
  const { table, column } = VERSIONS[kind]
  return useQuery({
    queryKey: [...budgetKeys.budget(budgetId), 'terms-at', kind, id ?? '', seq ?? 0] as const,
    enabled: id !== undefined && seq !== null,
    staleTime: 0,
    queryFn: async (): Promise<VersionOf<K> | null> =>
      unwrap(
        await supabase
          // All four tables have budget_id, the record column and effective_from_seq.
          .from(table as 'income_versions')
          .select('*')
          .eq('budget_id', budgetId)
          .eq(column as 'income_id', id ?? '')
          .lte('effective_from_seq', seq ?? 0)
          .order('effective_from_seq', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ) as unknown as VersionOf<K> | null,
  })
}

/**
 * Puts the terms of the chosen period (or, without a correction, those in force now) in the
 * form as its starting values, once they are known: the fields are not "edited" by this, so
 * a save sends only what the user changes afterwards.
 */
export function useStartFrom<TIn extends FieldValues, TOut extends FieldValues>(
  form: UseFormReturn<TIn, unknown, TOut>,
  key: string,
  values: Partial<TIn> | null,
) {
  const applied = useRef<string | null>(null)
  useEffect(() => {
    if (values === null || applied.current === key) return
    applied.current = key
    for (const [name, value] of Object.entries(values)) {
      form.resetField(name as Path<TIn>, {
        defaultValue: value as PathValue<TIn, Path<TIn>>,
      })
    }
  }, [form, key, values])
}
