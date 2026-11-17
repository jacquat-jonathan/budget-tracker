import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { bootstrapAuth, type AccountSwitch } from '@/features/auth/auth-bootstrap'
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context'
import { dropParkedLink, type AuthLinkError } from '@/features/auth/auth-redirect'
import { endRecovery, isRecoveryFor, RECOVERY_KEY, startRecovery } from '@/features/auth/recovery'
import {
  hasStoredSession,
  markSignOutRequested,
  wasSignOutRequested,
} from '@/features/auth/session-ended'
import { sessionKey } from '@/features/auth/session-identity'
import { supabase } from '@/lib/supabase'

/**
 * Session state for the app, plus the two pieces of email-link state:
 *
 * - `recovery` is derived, never stored here: it is true only while the recovery flag names
 *   the current session (recovery.ts). It is recomputed whenever the session changes or
 *   another tab changes the flag.
 * - `linkError` is the outcome of the link this page load landed with. It stays until the
 *   user dismisses it or the session identity changes (someone signs in, out, or as someone
 *   else), which also ends any parked attempt (invariant C).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [linkError, setLinkError] = useState<AuthLinkError | null>(null)
  const [accountSwitch, setAccountSwitch] = useState<AccountSwitch | null>(null)
  // Bumped when the recovery flag changes, so `recovery` is recomputed.
  const [recoveryVersion, setRecoveryVersion] = useState(0)
  const [sessionEnded, setSessionEnded] = useState(false)
  // Session identity (sessionKey) of the current session; undefined until first known.
  const currentKey = useRef<string | null | undefined>(undefined)
  // User whose data the query cache holds; undefined until first known.
  const cachedUserId = useRef<string | null | undefined>(undefined)

  const applySession = useCallback(
    (next: Session | null) => {
      const nextUserId = next?.user.id ?? null
      // Never show one user's cached data to another.
      // R-AUTH-025: never show one user's cached data to another.
      if (cachedUserId.current !== undefined && cachedUserId.current !== nextUserId) {
        queryClient.clear()
      }
      cachedUserId.current = nextUserId
      setSession(next)
    },
    [queryClient],
  )

  useEffect(() => {
    let active = true
    let ready = false

    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      // Before the bootstrap finishes, its result is the source of truth.
      if (!active || !ready) return
      const nextKey = sessionKey(next)
      if (nextKey !== currentKey.current) {
        // A different sign-in (or none) took over, in this tab or another: the link this
        // page landed with is no longer the story, and a parked attempt is over (C).
        // R-AUTH-021: another sign-in took over, the parked attempt is over.
        dropParkedLink()
        setLinkError(null)
        setAccountSwitch(null)
      }
      // R-AUTH-530: a session that disappears without the user signing out has ended.
      if (next) setSessionEnded(false)
      else if (currentKey.current && !wasSignOutRequested()) setSessionEnded(true)
      currentKey.current = nextKey
      if (event === 'SIGNED_OUT') endRecovery()
      if (event === 'PASSWORD_RECOVERY' && next) startRecovery(next)
      applySession(next)
      setRecoveryVersion((version) => version + 1)
    })

    // A stored session that no longer restores (expired or revoked while the tab was closed).
    const stored = hasStoredSession()
    bootstrapAuth()
      .then((result) => {
        if (!active) return
        if (!result.session && stored && !wasSignOutRequested()) setSessionEnded(true)
        currentKey.current = sessionKey(result.session)
        applySession(result.session)
        setLinkError(result.linkError)
        setAccountSwitch(result.accountSwitch)
        setRecoveryVersion((version) => version + 1)
      })
      .catch(() => {
        if (!active) return
        currentKey.current = null
        applySession(null)
      })
      .finally(() => {
        if (!active) return
        ready = true
        setLoading(false)
      })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [applySession])

  // Recovery started, finished or cancelled in another tab of this browser.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === RECOVERY_KEY || event.key === null) {
        setRecoveryVersion((version) => version + 1)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps -- recoveryVersion signals a storage change
  const recovery = useMemo(() => isRecoveryFor(session), [session, recoveryVersion])

  const completeRecovery = useCallback(() => {
    endRecovery()
    setRecoveryVersion((version) => version + 1)
  }, [])

  // Dismissing a notice ends that link attempt: parked tokens are not retried later.
  const dismissLinkError = useCallback(() => {
    dropParkedLink()
    setLinkError(null)
  }, [])

  const dismissAccountSwitch = useCallback(() => setAccountSwitch(null), [])

  const signOut = useCallback(async () => {
    markSignOutRequested()
    endRecovery()
    dropParkedLink()
    setRecoveryVersion((version) => version + 1)
    const { error } = await supabase.auth.signOut()
    if (error) {
      // The server session may already be gone; drop the local one regardless.
      await supabase.auth.signOut({ scope: 'local' })
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      recovery,
      completeRecovery,
      linkError,
      dismissLinkError,
      accountSwitch,
      dismissAccountSwitch,
      signOut,
      sessionEnded,
    }),
    [
      session,
      loading,
      recovery,
      completeRecovery,
      linkError,
      dismissLinkError,
      accountSwitch,
      dismissAccountSwitch,
      signOut,
      sessionEnded,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
