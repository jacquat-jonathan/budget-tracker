import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import type { FieldValues, Path, PathValue, UseFormReturn } from 'react-hook-form'

import { budgetKeys } from '@/features/budgets/budget-keys'
import { unwrap } from '@/features/budgets/budget-queries'
import type { Database } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

type Functions = Database['public']['Functions']
type Row<F extends keyof Functions> = Functions[F] extends { Returns: (infer R)[] } ? R : never

/**
 * What get_<record>_terms answers for a chosen period (D-219): the terms in force there, or
 * `inForce` false when the record did not exist in that period (its terms are then null),
 * and up to which period a correction from there applies (`untilPeriodId`, the first period
 * of the next existing change or of the record's end; null: from that period on). The
 * generated types mark every field required; the contract says the terms and
 * `untilPeriodId` may be null, so they are read once here.
 */
export interface TermsAt<T> {
  inForce: boolean
  /** The terms in force in the chosen period; null when not in force. */
  terms: T | null
  termsFromPeriodId: string | null
  untilPeriodId: string | null
}

export type SubscriptionTerms = Pick<
  Row<'get_subscription_terms'>,
  'price' | 'cadence' | 'category_id' | 'anchor_date' | 'charge_day'
>
export type DebtTerms = Pick<
  Row<'get_debt_terms'>,
  'category_id' | 'interest_rate' | 'monthly_payment'
>
export type CategoryTerms = Pick<Row<'get_category_terms'>, 'amount' | 'cadence'>
export type IncomeTerms = Pick<Row<'get_income_terms'>, 'amount' | 'pay_day' | 'weekend_rule'>

interface Kinds {
  subscription: SubscriptionTerms
  debt: DebtTerms
  category: CategoryTerms
  income: IncomeTerms
}

async function read<K extends keyof Kinds>(kind: K, id: string, periodId: string) {
  // One call per kind: the database decides which terms were in force (C-LOGIC-001).
  const rows: unknown[] =
    kind === 'subscription'
      ? unwrap(
          await supabase.rpc('get_subscription_terms', {
            p_subscription_id: id,
            p_period_id: periodId,
          }),
        )
      : kind === 'debt'
        ? unwrap(await supabase.rpc('get_debt_terms', { p_debt_id: id, p_period_id: periodId }))
        : kind === 'category'
          ? unwrap(
              await supabase.rpc('get_category_terms', {
                p_category_id: id,
                p_period_id: periodId,
              }),
            )
          : unwrap(
              await supabase.rpc('get_income_terms', { p_income_id: id, p_period_id: periodId }),
            )
  const row = (rows[0] ?? null) as
    | (Kinds[K] & {
        in_force: boolean | null
        terms_from_period_id: string | null
        until_period_id: string | null
      })
    | null
  const inForce = row?.in_force === true
  return {
    inForce,
    terms: inForce ? row : null,
    termsFromPeriodId: row?.terms_from_period_id ?? null,
    untilPeriodId: row?.until_period_id ?? null,
  } satisfies TermsAt<Kinds[K]>
}

/**
 * The terms a record had in force in an earlier period, from the database (get_*_terms): what
 * a correction starts from, and what it compares with to send only what the user changed.
 */
// R-VERSION-140: a correction starts from, and is compared with, the terms of its period.
export function useTermsAt<K extends keyof Kinds>(
  kind: K,
  budgetId: string,
  id: string | undefined,
  periodId: string | null,
) {
  return useQuery({
    queryKey: [...budgetKeys.budget(budgetId), 'terms-at', kind, id ?? '', periodId ?? ''] as const,
    enabled: id !== undefined && periodId !== null,
    staleTime: 0,
    queryFn: (): Promise<TermsAt<Kinds[K]>> => read(kind, id ?? '', periodId ?? ''),
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
    // What the user typed stays (the same rule as "Keep mine", R-CONCURRENCY-190): a field
    // they changed keeps its value over the new period's; the others start from it.
    const dirty = form.formState.dirtyFields as Record<string, unknown>
    const typed = form.getValues() as Record<string, unknown>
    for (const [name, value] of Object.entries(values)) {
      form.resetField(name as Path<TIn>, {
        defaultValue: value as PathValue<TIn, Path<TIn>>,
      })
      if (dirty[name] && !Object.is(typed[name], value)) {
        form.setValue(name as Path<TIn>, typed[name] as PathValue<TIn, Path<TIn>>, {
          shouldDirty: true,
        })
      }
    }
  }, [form, key, values])
}
