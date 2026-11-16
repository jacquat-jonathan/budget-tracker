import {
  useMutation,
  useQueryClient,
  type QueryKey,
  type UseMutationResult,
} from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { budgetKeys } from '@/features/budgets/budget-keys'
import { dbErrorKey, isNotFoundError, type DbErrorOverrides } from '@/lib/db-errors'

export interface AppMutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<TData>
  /**
   * Queries the write affects. They are refetched after the write, whether it succeeded or
   * failed: a refusal ("not found", "ended") usually means they changed meanwhile, and part
   * of a multi-step write may have gone through. `data` is undefined after a failure.
   */
  invalidate?: (data: TData | undefined, variables: TVariables) => readonly QueryKey[]
  /** Translated text of the success toast; none when omitted. */
  success?: (data: TData, variables: TVariables) => string
  onSuccess?: (data: TData, variables: TVariables) => void | Promise<void>
  /**
   * Where a failure is shown: a toast (the default, for one-click actions), or `inline` for
   * forms and dialogs that show `useErrorMessage()(mutation.error)` next to their fields.
   */
  errorDisplay?: 'toast' | 'inline'
  /** This call's own wording for some error codes (see dbErrorKey). */
  errorMessages?: DbErrorOverrides
}

/**
 * The app's one pattern for writes: pending state (from the returned mutation), translated
 * success and error feedback, stable database error codes mapped to text with a safe
 * fallback, and invalidation of the queries the write affects, after success and after
 * failure alike. A "not found" answer means the row (or the whole budget) is gone or no
 * longer ours, so the budget list is refetched too and the current budget falls back if it
 * disappeared.
 */
export function useAppMutation<TData, TVariables = void>({
  mutationFn,
  invalidate,
  success,
  onSuccess,
  errorDisplay = 'toast',
  errorMessages,
}: AppMutationOptions<TData, TVariables>): UseMutationResult<TData, unknown, TVariables> {
  const queryClient = useQueryClient()
  const errorMessage = useErrorMessage(errorMessages)

  return useMutation<TData, unknown, TVariables>({
    mutationFn,
    onSuccess: async (data, variables) => {
      const message = success?.(data, variables)
      if (message) toast.success(message)
      await onSuccess?.(data, variables)
      const keys = invalidate?.(data, variables) ?? []
      await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
    },
    onError: (error, variables) => {
      const notFound = isNotFoundError(error)
      // A "not found" can take the whole page away (the budget is gone), inline errors too.
      if (errorDisplay === 'toast' || notFound) toast.error(errorMessage(error))
      // R-APP-005: what the write acted on may have changed; never leave a stale row on screen.
      const keys = [...(invalidate?.(undefined, variables) ?? [])]
      if (notFound) keys.push(budgetKeys.list)
      for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey })
    },
  })
}

/** Translate any database or network error; never shows the raw message. */
export function useErrorMessage(overrides?: DbErrorOverrides): (error: unknown) => string {
  const { t } = useTranslation()
  return (error: unknown) => t(dbErrorKey(error, overrides))
}
