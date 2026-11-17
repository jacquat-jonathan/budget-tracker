import { Navigate, Outlet, useLocation } from 'react-router'

import { paths, redirectTarget, type RedirectState } from '@/app/paths'
import { FullPageSpinner } from '@/components/full-page-spinner'
import { useAuth } from '@/features/auth/auth-context'

/** Renders its child routes only for a signed-in user; otherwise sends them to sign-in. */
export function ProtectedRoute() {
  const { session, loading, recovery, sessionEnded } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageSpinner />
  // R-AUTH-001: signed out, to sign-in and back to the page asked for.
  if (!session) {
    const state: RedirectState = {
      from: `${location.pathname}${location.search}${location.hash}`,
      ...(sessionEnded ? { sessionEnded: true } : {}),
    }
    return <Navigate to={paths.signIn} replace state={state} />
  }
  // Signed in by a password-recovery link: choose a new password first, wherever it landed.
  // R-AUTH-018: recovery mode leads every app page to the new-password form.
  if (recovery) return <Navigate to={paths.resetPassword} replace />
  // R-AUTH-025: everything below is one user's. Keyed by user, it is rebuilt from scratch
  // (queries, observers, forms, dialogs) when another user's session takes over the tab.
  return <Outlet key={session.user.id} />
}

/** Sign-in and sign-up pages: a signed-in user is sent on to where they were going. */
export function PublicOnlyRoute() {
  const { session, loading, recovery } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageSpinner />
  // R-AUTH-002: a signed-in user is sent on into the app.
  if (session) {
    return <Navigate to={recovery ? paths.resetPassword : redirectTarget(location.state)} replace />
  }
  return <Outlet />
}
