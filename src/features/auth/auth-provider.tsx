import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import {
  bootstrapAuth,
  clearRecovery,
  isRecoveryFor,
  markRecovery,
  RECOVERY_KEY,
} from '@/features/auth/auth-bootstrap'
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context'
import type { AuthLinkError } from '@/features/auth/auth-redirect'
import { supabase } from '@/lib/supabase'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)
  const [linkError, setLinkError] = useState<AuthLinkError | null>(null)
  // Id of the user whose data the query cache holds; undefined until first known.
  const cachedUserId = useRef<string | null | undefined>(undefined)
  const currentUserId = useRef<string | undefined>(undefined)

  const applySession = useCallback(
    (next: Session | null) => {
      const nextUserId = next?.user.id ?? null
      // Never show one user's cached data to another: clear on sign-out and whenever the
      // session switches to a different user (e.g. another household member's email link
      // opened in a signed-in tab).
      if (cachedUserId.current !== undefined && cachedUserId.current !== nextUserId) {
        queryClient.clear()
      }
      cachedUserId.current = nextUserId
      currentUserId.current = next?.user.id
      setSession(next)
      // A dead-link notice is moot once someone is signed in; it must not resurface on the
      // sign-in page after a later sign-out.
      if (next) setLinkError(null)
    },
    [queryClient],
  )

  useEffect(() => {
    let active = true
    let ready = false

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // Before the bootstrap finishes, its result is the source of truth (INITIAL_SESSION may
      // still be null while an email link's session is being set).
      if (!active || !ready) return
      applySession(nextSession)
      if (event === 'PASSWORD_RECOVERY' && nextSession) {
        markRecovery(nextSession.user.id)
        setRecovery(true)
      } else if (event === 'SIGNED_OUT') {
        clearRecovery()
        setRecovery(false)
      } else {
        setRecovery(isRecoveryFor(nextSession?.user.id))
      }
    })

    bootstrapAuth()
      .then((result) => {
        if (!active) return
        applySession(result.session)
        setRecovery(result.recovery)
        setLinkError(result.session ? null : result.linkError)
      })
      .catch(() => {
        if (active) applySession(null)
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
        setRecovery(isRecoveryFor(currentUserId.current))
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const completeRecovery = useCallback(() => {
    clearRecovery()
    setRecovery(false)
  }, [])

  const dismissLinkError = useCallback(() => setLinkError(null), [])

  const signOut = useCallback(async () => {
    clearRecovery()
    setRecovery(false)
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
      signOut,
    }),
    [session, loading, recovery, completeRecovery, linkError, dismissLinkError, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
