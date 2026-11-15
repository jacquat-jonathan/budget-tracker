import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate } from 'react-router'

import { paths } from '@/app/paths'
import { FullPageSpinner } from '@/components/full-page-spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import { useAuth } from '@/features/auth/auth-context'
import { authErrorKey, type AuthErrorKey } from '@/features/auth/auth-errors'
import { AuthLayout } from '@/features/auth/components/auth-layout'
import { useLinkNotice } from '@/features/auth/components/use-link-notice'
import { TextField } from '@/features/auth/components/text-field'
import { resetPasswordSchema, type ResetPasswordValues } from '@/features/auth/schemas'
import { supabase } from '@/lib/supabase'

/**
 * Where password-recovery links land. Each state has one message and one way on
 * (invariants A and E), in this order:
 *
 * 1. The link this page load landed with did not sign anyone in (dead or undecided): its
 *    notice, whoever is signed in (B). Never the form.
 * 2. Recovery mode is active for the signed-in session: the form, naming the account.
 * 3. Signed in but not in recovery (e.g. after the password was saved or the attempt
 *    ended in another tab): on into the app. A session alone never shows the form.
 * 4. Signed out (e.g. recovery cancelled in another tab): on to sign-in.
 */
export function ResetPasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { session, loading, recovery, completeRecovery, signOut } = useAuth()
  const notice = useLinkNotice()
  const [errorKey, setErrorKey] = useState<AuthErrorKey | null>(null)
  const [leaving, setLeaving] = useState(false)

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  const onSubmit = form.handleSubmit(async ({ password }) => {
    setErrorKey(null)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) setErrorKey(authErrorKey(error))
      else {
        completeRecovery()
        void navigate(paths.dashboard, { replace: true })
      }
    } catch (error) {
      setErrorKey(authErrorKey(error))
    }
  })

  const cancelRecovery = async () => {
    setLeaving(true)
    try {
      await signOut()
    } finally {
      void navigate(paths.signIn, { replace: true })
    }
  }

  if (loading || leaving) return <FullPageSpinner />

  if (notice) {
    return (
      <AuthLayout title={notice.title} description={notice.description} hideLinkNotice>
        <div className="flex flex-col gap-3">
          {notice.signedInNote && <p className="text-sm">{notice.signedInNote}</p>}
          <div className="flex flex-wrap gap-2">{notice.actions}</div>
        </div>
      </AuthLayout>
    )
  }

  if (!session) return <Navigate to={paths.signIn} replace />
  if (!recovery) return <Navigate to={paths.dashboard} replace />

  return (
    <AuthLayout
      title={t('auth.resetPassword.title')}
      description={t('auth.resetPassword.description', { email: session.user.email ?? '' })}
      footer={
        <button
          type="button"
          onClick={() => void cancelRecovery()}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {t('auth.resetPassword.cancel')}
        </button>
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
