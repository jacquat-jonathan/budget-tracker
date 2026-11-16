import {
  useMutation,
  useQueryClient,
  type MutateOptions,
  type QueryKey,
  type UseMutationResult,
} from '@tanstack/react-query'
import { useCallback, useRef } from 'react'
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

/** Identifies a call by its variables, to recognise the same write sent twice. */
function callKey(variables: unknown): string {
  try {
    return JSON.stringify(variables) ?? 'undefined'
  } catch {
    // Not serialisable: treat every such call as the same write.
    return '<unserialisable>'
  }
}

/**
 * The app's one pattern for writes: pending state (from the returned mutation), translated
 * success and error feedback, stable database error codes mapped to text with a safe
 * fallback, and invalidation of the queries the write affects, after success and after
 * failure alike. A "not found" answer means the row (or the whole budget) is gone or no
 * longer ours, so the budget list is refetched too and the current budget falls back if it
 * disappeared.
 *
 * A write is sent once: calling `mutate` or `mutateAsync` again with the same variables
 * while that write is in flight (a double click, two Enter presses before the button is
 * disabled) does not send it again; `mutateAsync` returns the promise of the write in flight.
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

  const mutation = useMutation<TData, unknown, TVariables>({
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

  // R-APP-007: the guard is synchronous, so it holds before React re-renders the disabled
  // button; the same write sent again while in flight is not sent twice.
  const inFlight = useRef(new Map<string, Promise<TData>>())
  const { mutateAsync: send } = mutation
  const mutateAsync = useCallback(
    (variables: TVariables, options?: MutateOptions<TData, unknown, TVariables>) => {
      const key = callKey(variables)
      const pending = inFlight.current.get(key)
      if (pending) return pending
      const promise = send(variables, options)
      inFlight.current.set(key, promise)
      const settle = () => {
        if (inFlight.current.get(key) === promise) inFlight.current.delete(key)
      }
      promise.then(settle, settle)
      return promise
    },
    [send],
  )
  const mutate = useCallback(
    (variables: TVariables, options?: MutateOptions<TData, unknown, TVariables>) => {
      // Like TanStack's mutate: the outcome is reported through state and callbacks.
      mutateAsync(variables, options).catch(() => undefined)
    },
    [mutateAsync],
  )

  return { ...mutation, mutate, mutateAsync }
}

/** Translate any database or network error; never shows the raw message. */
export function useErrorMessage(overrides?: DbErrorOverrides): (error: unknown) => string {
  const { t } = useTranslation()
  return (error: unknown) => t(dbErrorKey(error, overrides))
}
