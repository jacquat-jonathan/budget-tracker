import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldGroup } from '@/components/ui/field'
import { authErrorKey, type AuthErrorKey } from '@/features/auth/auth-errors'
import { TextField } from '@/features/auth/components/text-field'
import {
  PASSWORD_MIN_LENGTH,
  resetPasswordSchema,
  type ResetPasswordValues,
} from '@/features/auth/schemas'
import { assertOnline } from '@/lib/online'
import { supabase } from '@/lib/supabase'

/**
 * Changing the password while signed in: the new one twice, at least as long as at sign-up,
 * saved with Supabase's updateUser. The form empties once saved.
 */
// R-AUTH-531: the password can be changed while signed in.
export function PasswordSettings() {
  const { t } = useTranslation()
  const [errorKey, setErrorKey] = useState<AuthErrorKey | null>(null)
  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  const onSubmit = form.handleSubmit(async ({ password }) => {
    setErrorKey(null)
    try {
      assertOnline()
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        setErrorKey(authErrorKey(error))
        return
      }
      form.reset({ password: '', confirmPassword: '' })
      toast.success(t('settings.password.saved'))
    } catch (error) {
      setErrorKey(authErrorKey(error))
    }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h3 className="text-base font-semibold">{t('settings.password.title')}</h3>
        </CardTitle>
        <CardDescription>
          {t('settings.password.description', { min: PASSWORD_MIN_LENGTH })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void onSubmit(event)} noValidate data-testid="password-form">
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
            />
            <TextField
              control={form.control}
              name="confirmPassword"
              label={t('fields.confirmPassword')}
              type="password"
              autoComplete="new-password"
            />
            <Button type="submit" className="self-start" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t('common.saving') : t('settings.password.submit')}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
