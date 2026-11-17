import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'

import { paths, type RedirectState } from '@/app/paths'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import { authErrorKey, type AuthErrorKey } from '@/features/auth/auth-errors'
import { AuthLayout } from '@/features/auth/components/auth-layout'
import { TextField } from '@/features/auth/components/text-field'
import type { ResendConfirmationState } from '@/features/auth/pages/resend-confirmation-page'
import { endRecovery } from '@/features/auth/recovery'
import { signInSchema, type SignInValues } from '@/features/auth/schemas'
import { hasAnyPendingImport } from '@/features/import/pending-import'
import { supabase } from '@/lib/supabase'

export function SignInPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const [errorKey, setErrorKey] = useState<AuthErrorKey | null>(null)
  // R-IMPORT-369: an import was being sent when the session ended; what it recorded is kept.
  const [interrupted] = useState(hasAnyPendingImport)
  const ended = (location.state as RedirectState | null)?.sessionEnded === true

  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  })

  // R-AUTH-009: the fields are validated before Supabase is called.
  const onSubmit = form.handleSubmit(async (values) => {
    setErrorKey(null)
    try {
      // Knowing the password makes a pending password recovery moot (invariant D). The new
      // session would not match the recovery flag anyway (recovery.ts); this also covers
      // tokens without a session_id claim. Nobody is signed in on this page, so the flag
      // cannot belong to a live session here.
      endRecovery()
      const { error } = await supabase.auth.signInWithPassword(values)
      // On success the auth listener updates the session and the public-only route
      // sends the user to the page they originally asked for.
      if (error) setErrorKey(authErrorKey(error))
    } catch (error) {
      setErrorKey(authErrorKey(error))
    }
  })

  return (
    <AuthLayout
      title={t('auth.signIn.title')}
      description={t('auth.signIn.description')}
      footer={
        <p>
          {t('auth.signIn.noAccount')}{' '}
          <Link
            to={paths.signUp}
            state={location.state as unknown}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {t('auth.signIn.signUpLink')}
          </Link>
        </p>
      }
    >
      <form onSubmit={(event) => void onSubmit(event)} noValidate>
        <FieldGroup>
          {ended && (
            <Alert data-testid="session-ended">
              <AlertTitle>{t('auth.signIn.sessionEndedTitle')}</AlertTitle>
              <AlertDescription>{t('auth.signIn.sessionEnded')}</AlertDescription>
            </Alert>
          )}
          {interrupted && (
            <Alert data-testid="sign-in-import">
              <AlertDescription>{t('auth.signIn.importInterrupted')}</AlertDescription>
            </Alert>
          )}
          {errorKey && (
            <Alert variant="destructive">
              <AlertDescription>
                <p>{t(errorKey)}</p>
                {/* R-AUTH-015: offer to resend the confirmation, with the address. */}
                {errorKey === 'auth.errors.emailNotConfirmed' && (
                  <Link
                    to={paths.resendConfirmation}
                    state={
                      { email: form.getValues('email').trim() } satisfies ResendConfirmationState
                    }
                    className="mt-1 font-medium text-foreground underline underline-offset-4"
                  >
                    {t('auth.actions.resendConfirmation')}
                  </Link>
                )}
              </AlertDescription>
            </Alert>
          )}
          <TextField
            control={form.control}
            name="email"
            label={t('fields.email')}
            type="email"
            autoComplete="email"
            placeholder={t('fields.emailPlaceholder')}
            autoFocus
          />
          <div className="flex flex-col gap-2">
            <TextField
              control={form.control}
              name="password"
              label={t('fields.password')}
              type="password"
              autoComplete="current-password"
            />
            <Link
              to={paths.forgotPassword}
              className="self-end text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {t('auth.signIn.forgotPassword')}
            </Link>
          </div>
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t('common.loading') : t('auth.signIn.submit')}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
