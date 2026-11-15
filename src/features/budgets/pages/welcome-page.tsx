import { LogOutIcon, WalletIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { LanguageSelect } from '@/components/preferences/language-select'
import { ThemeSelect } from '@/components/preferences/theme-select'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/features/auth/auth-context'
import { LinkErrorAlert } from '@/features/auth/components/link-error-alert'
import { AccountSwitchedAlert } from '@/features/auth/components/account-switched-alert'
import { useBudgets } from '@/features/budgets/current-budget-context'
import { CreateBudgetForm } from '@/features/budgets/components/create-budget-form'
import { MyInvitations } from '@/features/invitations/my-invitations'
import { useDisplayName } from '@/features/profile/use-profile'
import { useDocumentTitle } from '@/hooks/use-document-title'

/**
 * First run: a signed-in user without a budget sets one up here, or joins one they were
 * invited to. Once they have a budget, RequireNoBudget sends them to the dashboard.
 */
export function WelcomePage() {
  const { t } = useTranslation()
  const { user, signOut } = useAuth()
  const { selectBudget } = useBudgets()
  const displayName = useDisplayName()
  useDocumentTitle(t('welcome.title'))

  return (
    <div className="flex min-h-svh flex-col bg-muted/40">
      <header className="flex items-center justify-between gap-2 p-4">
        <div className="flex items-center gap-2 font-medium">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <WalletIcon className="size-4" />
          </span>
          {t('app.name')}
        </div>
        <div className="flex items-center gap-1">
          <LanguageSelect />
          <ThemeSelect />
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            <LogOutIcon />
            <span className="hidden sm:inline">{t('userMenu.signOut')}</span>
            <span className="sr-only sm:hidden">{t('userMenu.signOut')}</span>
          </Button>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-4 pb-16">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {displayName
              ? t('welcome.greeting', { name: displayName })
              : t('welcome.greetingNoName')}
          </h1>
          <p className="text-muted-foreground">{t('welcome.description')}</p>
          {user?.email && (
            <p className="text-sm text-muted-foreground">
              {t('welcome.signedInAs', { email: user.email })}
            </p>
          )}
        </div>
        <AccountSwitchedAlert />
        <LinkErrorAlert />
        <MyInvitations />
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-lg font-semibold">{t('welcome.createTitle')}</h2>
            </CardTitle>
            <CardDescription>{t('welcome.createDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateBudgetForm onCreated={selectBudget} />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
