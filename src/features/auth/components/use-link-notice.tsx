import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'

import { paths } from '@/app/paths'
import { Button } from '@/components/ui/button'
import { LINK_NETWORK } from '@/features/auth/auth-bootstrap'
import { useAuth } from '@/features/auth/auth-context'

export interface LinkNotice {
  title: string
  description: string
  /** Extra line when someone else is signed in, naming that account. */
  signedInNote?: string
  actions: ReactNode
}

/**
 * What to say about the email link this page load landed with, when it did not sign anyone
 * in: one message and the actions that make sense for whoever is (or is not) signed in.
 * Returns null when there is nothing to say.
 */
// R-AUTH-014: a dead link is explained, with a way to get a new one.
export function useLinkNotice(): LinkNotice | null {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { linkError, dismissLinkError, session, signOut } = useAuth()
  if (!linkError) return null

  const network = linkError.code === LINK_NETWORK
  const title = network ? t('auth.linkError.networkTitle') : t('auth.linkError.title')
  const description = network
    ? t('auth.linkError.network')
    : linkError.code === 'otp_expired'
      ? t('auth.linkError.expired')
      : t('auth.linkError.invalid')
  const signedInNote = session?.user.email
    ? t('auth.linkError.signedInAs', { email: session.user.email })
    : undefined

  // The link's tokens are kept for this tab while undecided; a reload checks them again.
  const retry = network ? (
    <Button size="sm" onClick={() => window.location.reload()}>
      {t('auth.linkError.retry')}
    </Button>
  ) : null

  if (session) {
    return {
      title,
      description,
      signedInNote,
      actions: (
        <>
          {retry}
          <Button
            size="sm"
            variant={network ? 'outline' : 'default'}
            onClick={() => {
              dismissLinkError()
              void navigate(paths.dashboard, { replace: true })
            }}
          >
            {t('auth.linkError.continue')}
          </Button>
          {!network && (
            <Button size="sm" variant="outline" onClick={() => void signOut()}>
              {t('auth.linkError.signOutForNew')}
            </Button>
          )}
        </>
      ),
    }
  }

  return {
    title,
    description,
    actions: retry ?? (
      <>
        <Button asChild variant="link" size="sm" className="h-auto p-0">
          <Link to={paths.resendConfirmation} onClick={dismissLinkError}>
            {t('auth.actions.resendConfirmation')}
          </Link>
        </Button>
        <Button asChild variant="link" size="sm" className="h-auto p-0">
          <Link to={paths.forgotPassword} onClick={dismissLinkError}>
            {t('auth.actions.requestPasswordReset')}
          </Link>
        </Button>
      </>
    ),
  }
}
