import { zodResolver } from '@hookform/resolvers/zod'
import { MailCheckIcon } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { paths } from '@/app/paths'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import { authErrorKey, type AuthErrorKey } from '@/features/auth/auth-errors'
import { AuthLayout } from '@/features/auth/components/auth-layout'
import { TextField } from '@/features/auth/components/text-field'
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/features/auth/schemas'
import { appUrl } from '@/lib/base-path'
import { supabase } from '@/lib/supabase'

const linkClass = 'font-medium text-foreground underline-offset-4 hover:underline'

export function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [errorKey, setErrorKey] = useState<AuthErrorKey | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  const onSubmit = form.handleSubmit(async ({ email }) => {
    setErrorKey(null)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: appUrl(paths.resetPassword),
      })
      if (error) setErrorKey(authErrorKey(error))
      else setSentTo(email)
    } catch (error) {
      setErrorKey(authErrorKey(error))
    }
  })

  const backLink = (
    <Link to={paths.signIn} className={linkClass}>
      {t('auth.backToSignIn')}
    </Link>
  )

  if (sentTo) {
    return (
      <AuthLayout title={t('auth.forgotPassword.sent.title')} footer={backLink}>
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted">
            <MailCheckIcon className="size-6" />
          </span>
          <p className="text-sm text-muted-foreground">
            {t('auth.forgotPassword.sent.description', { email: sentTo })}
          </p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={t('auth.forgotPassword.title')}
      description={t('auth.forgotPassword.description')}
      footer={backLink}
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
            name="email"
            label={t('fields.email')}
            type="email"
            autoComplete="email"
            placeholder={t('fields.emailPlaceholder')}
            autoFocus
          />
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t('common.loading') : t('auth.forgotPassword.submit')}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
