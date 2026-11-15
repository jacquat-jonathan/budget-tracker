import {
  useMutation,
  useQueryClient,
  type QueryKey,
  type UseMutationResult,
} from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { budgetKeys } from '@/features/budgets/budget-keys'
import { dbErrorKey, isNotFoundError, type DbErrorKey } from '@/lib/db-errors'

export interface AppMutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<TData>
  /** Queries to refetch once the write succeeded. */
  invalidate?: (data: TData, variables: TVariables) => readonly QueryKey[]
  /** Translated text of the success toast; none when omitted. */
  success?: (data: TData, variables: TVariables) => string
  onSuccess?: (data: TData, variables: TVariables) => void | Promise<void>
  /**
   * Where a failure is shown: a toast (the default, for one-click actions), or `inline` for
   * forms and dialogs that show `useErrorMessage()(mutation.error)` next to their fields.
   */
  errorDisplay?: 'toast' | 'inline'
}

/**
 * The app's one pattern for writes: pending state (from the returned mutation), translated
 * success and error feedback, stable database error codes mapped to text with a safe
 * fallback, and invalidation of the queries the write affects. A "not found" answer means
 * the row (or the whole budget) is gone or no longer ours, so the budget list is refetched
 * too and the current budget falls back if it disappeared.
 */
export function useAppMutation<TData, TVariables = void>({
  mutationFn,
  invalidate,
  success,
  onSuccess,
  errorDisplay = 'toast',
}: AppMutationOptions<TData, TVariables>): UseMutationResult<TData, unknown, TVariables> {
  const queryClient = useQueryClient()
  const errorMessage = useErrorMessage()

  return useMutation<TData, unknown, TVariables>({
    mutationFn,
    onSuccess: async (data, variables) => {
      const message = success?.(data, variables)
      if (message) toast.success(message)
      await onSuccess?.(data, variables)
      const keys = invalidate?.(data, variables) ?? []
      await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
    },
    onError: (error) => {
      const notFound = isNotFoundError(error)
      // A "not found" can take the whole page away (the budget is gone), inline errors too.
      if (errorDisplay === 'toast' || notFound) toast.error(errorMessage(error))
      if (notFound) void queryClient.invalidateQueries({ queryKey: budgetKeys.list })
    },
  })
}

/** Translate any database or network error; never shows the raw message. */
export function useErrorMessage(): (error: unknown) => string {
  const { t } = useTranslation()
  return (error: unknown) => t(dbErrorKey(error) satisfies DbErrorKey)
}
