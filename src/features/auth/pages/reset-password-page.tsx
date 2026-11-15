import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'

import { paths } from '@/app/paths'
import { FullPageSpinner } from '@/components/full-page-spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import { useAuth } from '@/features/auth/auth-context'
import { authErrorKey, type AuthErrorKey } from '@/features/auth/auth-errors'
import { AuthLayout } from '@/features/auth/components/auth-layout'
import { TextField } from '@/features/auth/components/text-field'
import { resetPasswordSchema, type ResetPasswordValues } from '@/features/auth/schemas'
import { supabase } from '@/lib/supabase'

/**
 * Reached from the password-reset email. Supabase signs the user in from the link (a
 * recovery session), and this page then lets them set a new password. It also works for a
 * signed-in user who simply wants to change theirs.
 */
export function ResetPasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { session, loading } = useAuth()
  const [errorKey, setErrorKey] = useState<AuthErrorKey | null>(null)

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  const onSubmit = form.handleSubmit(async ({ password }) => {
    setErrorKey(null)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) setErrorKey(authErrorKey(error))
      else void navigate(paths.dashboard, { replace: true })
    } catch (error) {
      setErrorKey(authErrorKey(error))
    }
  })

  if (loading) return <FullPageSpinner />

  if (!session) {
    return (
      <AuthLayout
        title={t('auth.resetPassword.invalidLink.title')}
        description={t('auth.resetPassword.invalidLink.description')}
        footer={
          <Link
            to={paths.signIn}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {t('auth.backToSignIn')}
          </Link>
        }
      >
        <Button asChild className="w-full">
          <Link to={paths.forgotPassword}>{t('auth.resetPassword.invalidLink.action')}</Link>
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={t('auth.resetPassword.title')}
      description={t('auth.resetPassword.description')}
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
            name="password"
            label={t('fields.newPassword')}
            type="password"
            autoComplete="new-password"
            autoFocus
          />
          <TextField
            control={form.control}
            name="confirmPassword"
            label={t('fields.confirmPassword')}
            type="password"
            autoComplete="new-password"
          />
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t('common.loading') : t('auth.resetPassword.submit')}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
