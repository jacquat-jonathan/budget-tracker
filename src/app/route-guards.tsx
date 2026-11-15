import { Navigate, Outlet, useLocation } from 'react-router'

import { paths, redirectTarget, type RedirectState } from '@/app/paths'
import { FullPageSpinner } from '@/components/full-page-spinner'
import { useAuth } from '@/features/auth/auth-context'

/** Renders its child routes only for a signed-in user; otherwise sends them to sign-in. */
export function ProtectedRoute() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageSpinner />
  if (!session) {
    const state: RedirectState = { from: `${location.pathname}${location.search}${location.hash}` }
    return <Navigate to={paths.signIn} replace state={state} />
  }
  return <Outlet />
}

/** Sign-in and sign-up pages: a signed-in user is sent on to where they were going. */
export function PublicOnlyRoute() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageSpinner />
  if (session) return <Navigate to={redirectTarget(location.state)} replace />
  return <Outlet />
}
