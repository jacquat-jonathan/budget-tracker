import { useTranslation } from 'react-i18next'

import { budgetKeys } from '@/features/budgets/budget-keys'
import { unwrap } from '@/features/budgets/budget-queries'
import type {
  ChecklistRow,
  CreateArgs,
  Transfer,
  TransferTermsArgs,
} from '@/features/transfers/transfer-queries'
import { useAppMutation } from '@/hooks/use-app-mutation'
import { formatMoney } from '@/lib/money'
import { supabase } from '@/lib/supabase'

// A transfer moves checklists, committed figures, transactions and the money flow.
const affected = (budgetId: string) => [budgetKeys.budget(budgetId)]

export function useCreateTransfer(budgetId: string, options: { onDone: () => void }) {
  const { t } = useTranslation()
  return useAppMutation<string, { name: string; args: CreateArgs; clientId: string }>({
    errorDisplay: 'inline',
    errorMessages: { category_to_categorise: 'transfers.errors.toCategorise' },
    mutationFn: async ({ name, args, clientId }) =>
      unwrap(
        await supabase.rpc('create_transfer', {
          p_budget_id: budgetId,
          p_name: name,
          p_client_id: clientId,
          ...args,
        }),
      )[0]?.id ?? '',
    success: (_id, { name }) => t('transfers.created', { name }),
    onSuccess: () => options.onDone(),
    invalidate: () => affected(budgetId),
  })
}

/** One edit: a rename and/or new terms (editArgs). False when there was nothing to save. */
export function useUpdateTransfer(budgetId: string, options: { onDone: () => void }) {
  const { t } = useTranslation()
  return useAppMutation<boolean, { transfer: Transfer; name: string; args: TransferTermsArgs }>({
    errorDisplay: 'inline',
    errorMessages: {
      record_changed: 'transfers.changedNotShown',
      category_to_categorise: 'transfers.errors.toCategorise',
    },
    mutationFn: async ({ transfer, name, args }) => {
      const renamed = name !== transfer.name
      if (!renamed && Object.keys(args).length === 0) return false
      unwrap(
        await supabase.rpc('update_transfer', {
          p_transfer_id: transfer.id,
          p_expected_revision: transfer.revision,
          ...(renamed ? { p_name: name } : {}),
          ...args,
        }),
      )
      return true
    },
    success: (saved, { name }) => (saved ? t('transfers.saved', { name }) : ''),
    onSuccess: (saved) => {
      if (saved) options.onDone()
    },
    invalidate: () => affected(budgetId),
  })
}

export function useEndTransfer(budgetId: string) {
  const { t } = useTranslation()
  return useAppMutation<
    string,
    { transfer: Transfer; revision: number; fromPeriodId: string | null }
  >({
    errorDisplay: 'inline',
    errorMessages: { record_changed: 'transfers.changedNotShown' },
    mutationFn: async ({ transfer, revision, fromPeriodId }) =>
      unwrap(
        await supabase.rpc('end_transfer', {
          p_transfer_id: transfer.id,
          p_expected_revision: revision,
          ...(fromPeriodId ? { p_from_period_id: fromPeriodId } : {}),
        }),
      ),
    success: (outcome, { transfer }) =>
      outcome === 'deleted'
        ? t('transfers.deleted', { name: transfer.name })
        : t('transfers.ended', { name: transfer.name }),
    invalidate: () => affected(budgetId),
  })
}

/** The occurrence a mark acts on: its period, its key, and the mark's revision read. */
export interface MarkTarget {
  transferId: string
  periodId: string
  occurrenceDate: string
  revision: number
  name: string
  amount: number
}

/** The mark target of a checklist row: its period, its key, and the mark revision read. */
export function targetOf(row: ChecklistRow): MarkTarget {
  return {
    transferId: row.transfer_id ?? '',
    periodId: row.period_id ?? '',
    occurrenceDate: row.occurrence_date ?? '',
    revision: row.mark_revision ?? 0,
    name: row.name ?? '',
    amount: row.amount ?? 0,
  }
}

const target = (row: MarkTarget) => ({
  p_transfer_id: row.transferId,
  p_period_id: row.periodId,
  p_occurrence_date: row.occurrenceDate,
  p_expected_revision: row.revision,
})

/**
 * The four marks of an occurrence (R-CONCURRENCY-230): each names the mark revision read. A
 * mark made or changed meanwhile is refused (record_changed): the checklist is read again
 * and the message says so; nothing is sent again.
 */
export function useMarks(budgetId: string, options: { errorDisplay?: 'toast' | 'inline' } = {}) {
  const { t } = useTranslation()
  const errorMessages = {
    record_changed: 'transfers.checklist.changedElsewhere',
    transfer_already_marked: 'transfers.checklist.changedElsewhere',
    nothing_to_undo: 'transfers.checklist.changedElsewhere',
    // Ended or changed by another member meanwhile: the checklist shows where it stands.
    transfer_not_in_force: 'transfers.checklist.changedElsewhere',
    transfer_not_found: 'transfers.checklist.changedElsewhere',
  } as const
  const common = { errorMessages, invalidate: () => affected(budgetId) }
  const done = useAppMutation<unknown, MarkTarget & { doneOn: string; amountMoved: number }>({
    ...common,
    errorDisplay: options.errorDisplay ?? 'toast',
    mutationFn: async (row) =>
      unwrap(
        await supabase.rpc('mark_transfer_done', {
          ...target(row),
          p_done_on: row.doneOn,
          p_amount: row.amountMoved,
        }),
      ),
    success: (_data, row) =>
      t('transfers.checklist.markedDone', { name: row.name, amount: formatMoney(row.amountMoved) }),
  })
  const skip = useAppMutation<unknown, MarkTarget>({
    ...common,
    mutationFn: async (row) => unwrap(await supabase.rpc('skip_transfer', target(row))),
    success: (_data, row) => t('transfers.checklist.markedSkipped', { name: row.name }),
  })
  const notDone = useAppMutation<unknown, MarkTarget>({
    ...common,
    mutationFn: async (row) => unwrap(await supabase.rpc('mark_transfer_not_done', target(row))),
    success: (_data, row) => t('transfers.checklist.markedNotDone', { name: row.name }),
  })
  const undo = useAppMutation<unknown, MarkTarget>({
    ...common,
    mutationFn: async (row) => unwrap(await supabase.rpc('undo_transfer_mark', target(row))),
    success: (_data, row) => t('transfers.checklist.undone', { name: row.name }),
  })
  return { done, skip, notDone, undo }
}
