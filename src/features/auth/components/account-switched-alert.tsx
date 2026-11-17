import { UserRoundCheckIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-context'

/**
 * An email link for one account was opened while another was signed in, and the browser
 * is now signed in as the link's account: say so plainly (R-AUTH-026), until dismissed or
 * someone signs in or out.
 */
export function AccountSwitchedAlert() {
  const { t } = useTranslation()
  const { accountSwitch, dismissAccountSwitch } = useAuth()
  if (!accountSwitch) return null
  const to = accountSwitch.to ?? t('auth.accountSwitched.unknownAccount')

  return (
    <Alert data-testid="account-switched">
      <UserRoundCheckIcon aria-hidden />
      <AlertTitle>{t('auth.accountSwitched.title', { email: to })}</AlertTitle>
      <AlertDescription>
        <p>
          {accountSwitch.from
            ? t('auth.accountSwitched.description', { email: to, previous: accountSwitch.from })
            : t('auth.accountSwitched.descriptionNoPrevious', { email: to })}
        </p>
        <div className="mt-2">
          <Button size="sm" variant="outline" onClick={dismissAccountSwitch}>
            {t('auth.accountSwitched.dismiss')}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
