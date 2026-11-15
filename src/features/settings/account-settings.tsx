import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldGroup } from '@/components/ui/field'
import { useAuth } from '@/features/auth/auth-context'
import { TextField } from '@/features/auth/components/text-field'
import { signUpSchema } from '@/features/auth/schemas'
import { budgetKeys } from '@/features/budgets/budget-keys'
import { unwrap } from '@/features/budgets/budget-queries'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'
import { profileQueryKey, useDisplayName } from '@/features/profile/use-profile'
import { useAppMutation, useErrorMessage } from '@/hooks/use-app-mutation'
import { DbError } from '@/lib/db-errors'
import { supabase } from '@/lib/supabase'

const accountSchema = z.object({ displayName: signUpSchema.shape.displayName })

/** My account: the display name other members see (R-PROFILE-002). */
export function AccountSettings() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { budgetId } = useCurrentBudget()
  const displayName = useDisplayName()
  const errorMessage = useErrorMessage()
  const userId = user?.id ?? ''

  const form = useForm<z.input<typeof accountSchema>, unknown, z.output<typeof accountSchema>>({
    resolver: zodResolver(accountSchema),
    values: { displayName: displayName ?? '' },
  })

  const save = useAppMutation<void, string>({
    errorDisplay: 'inline',
    mutationFn: async (name) => {
      const rows = unwrap(
        await supabase.from('profiles').update({ display_name: name }).eq('id', userId).select('id'),
      )
      if (rows.length === 0) throw new DbError('member_not_found')
    },
    success: () => t('settings.account.saved'),
    invalidate: () => [profileQueryKey(userId), budgetKeys.members(budgetId)],
  })

  const onSubmit = form.handleSubmit(({ displayName: name }) =>
    save.mutateAsync(name).catch(() => undefined),
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-lg font-semibold">{t('settings.account.title')}</h2>
        </CardTitle>
        <CardDescription>
          {user?.email
            ? t('settings.account.description', { email: user.email })
            : t('settings.account.descriptionNoEmail')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void onSubmit(event)} noValidate>
          <FieldGroup>
            {save.isError && (
              <Alert variant="destructive">
                <AlertDescription>{errorMessage(save.error)}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="flex-1">
                <TextField
                  control={form.control}
                  name="displayName"
                  label={t('fields.displayName')}
                  autoComplete="name"
                />
              </div>
              <Button type="submit" className="sm:mt-6" disabled={save.isPending}>
                {save.isPending ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
