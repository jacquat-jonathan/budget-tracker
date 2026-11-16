import { zodResolver } from '@hookform/resolvers/zod'
import { MailCheckIcon } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'

import { paths } from '@/app/paths'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import { authErrorKey, type AuthErrorKey } from '@/features/auth/auth-errors'
import { AuthLayout } from '@/features/auth/components/auth-layout'
import { TextField } from '@/features/auth/components/text-field'
import { signUpSchema, type SignUpValues } from '@/features/auth/schemas'
import { appUrl } from '@/lib/base-path'
import { supabase } from '@/lib/supabase'

const linkClass = 'font-medium text-foreground underline-offset-4 hover:underline'

export function SignUpPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const [errorKey, setErrorKey] = useState<AuthErrorKey | null>(null)
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null)

  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { displayName: '', email: '', password: '' },
  })

  const onSubmit = form.handleSubmit(async ({ displayName, email, password }) => {
    setErrorKey(null)
    try {
      // R-AUTH-004: the display name is stored with the new account.
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName },
          emailRedirectTo: appUrl(),
        },
      })
      if (error) {
        setErrorKey(authErrorKey(error))
        return
      }
      // With a session the user is signed in and the public-only route redirects to the
      // app. Without one, the project requires email confirmation first.
      // R-AUTH-007 R-AUTH-008: check the inbox, or straight into the app with a session.
      if (!data.session) setConfirmationSentTo(email)
    } catch (error) {
      setErrorKey(authErrorKey(error))
    }
  })

  if (confirmationSentTo) {
    return (
      <AuthLayout
        title={t('auth.signUp.checkInbox.title')}
        footer={
          <Link to={paths.signIn} state={location.state as unknown} className={linkClass}>
            {t('auth.backToSignIn')}
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted">
            <MailCheckIcon className="size-6" />
          </span>
          <p className="text-sm text-muted-foreground">
            {t('auth.signUp.checkInbox.description', { email: confirmationSentTo })}
          </p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={t('auth.signUp.title')}
      description={t('auth.signUp.description')}
      footer={
        <p>
          {t('auth.signUp.haveAccount')}{' '}
          <Link to={paths.signIn} state={location.state as unknown} className={linkClass}>
            {t('auth.signUp.signInLink')}
          </Link>
        </p>
      }
    >
      <form onSubmit={(event) => void onSubmit(event)} noValidate>
        <FieldGroup>
          {errorKey && (
            <Alert variant="destructive">
              <AlertDescription>{t(errorKey)}</AlertDescription>
            </Alert>
          )}
          <TextField
            control={form.control}
            name="displayName"
            label={t('fields.displayName')}
            autoComplete="nickname"
            placeholder={t('fields.displayNamePlaceholder')}
            autoFocus
          />
          <TextField
            control={form.control}
            name="email"
            label={t('fields.email')}
            type="email"
            autoComplete="email"
            placeholder={t('fields.emailPlaceholder')}
          />
          <TextField
            control={form.control}
            name="password"
            label={t('fields.password')}
            type="password"
            autoComplete="new-password"
          />
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t('common.loading') : t('auth.signUp.submit')}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
