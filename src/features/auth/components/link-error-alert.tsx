import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { paths } from '@/app/paths'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-context'

/**
 * Explains that the email link the user arrived through is dead (expired, already used or
 * invalid) and offers to send a new one. Renders nothing otherwise.
 */
export function LinkErrorAlert() {
  const { t } = useTranslation()
  const { linkError, dismissLinkError } = useAuth()
  if (!linkError) return null

  const expired = linkError.code === 'otp_expired'

  return (
    <Alert variant="destructive">
      <AlertTitle>{t('auth.linkError.title')}</AlertTitle>
      <AlertDescription>
        <p>{expired ? t('auth.linkError.expired') : t('auth.linkError.invalid')}</p>
        <div className="mt-2 flex flex-col items-start gap-1">
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
        </div>
      </AlertDescription>
    </Alert>
  )
}
