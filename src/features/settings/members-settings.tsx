import { zodResolver } from '@hookform/resolvers/zod'
import { InfoIcon, LogOutIcon, UserMinusIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { z } from 'zod'

import { paths } from '@/app/paths'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ErrorState, LoadingState } from '@/components/states'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldGroup } from '@/components/ui/field'
import { useAuth } from '@/features/auth/auth-context'
import { TextField } from '@/features/auth/components/text-field'
import { budgetKeys } from '@/features/budgets/budget-keys'
import {
  memberName,
  unwrap,
  useBudgetInvitations,
  useIncomes,
  useMembers,
  type BudgetInvitation,
  type BudgetMember,
} from '@/features/budgets/budget-queries'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'
import { OwnerOnlyNote } from '@/features/settings/budget-settings'
import { useAppMutation, useErrorMessage } from '@/hooks/use-app-mutation'
import { formatTimestamp } from '@/lib/date'
import { DbError } from '@/lib/db-errors'
import { supabase } from '@/lib/supabase'

type Pending = { kind: 'none' } | { kind: 'remove'; member: BudgetMember } | { kind: 'leave' }

export function MembersSettings() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { budgetId, budget, isOwner } = useCurrentBudget()
  const members = useMembers(budgetId)
  const incomes = useIncomes(budgetId)
  const [pending, setPending] = useState<Pending>({ kind: 'none' })
  const close = () => setPending({ kind: 'none' })

  const remove = useAppMutation<null, BudgetMember>({
    errorDisplay: 'inline',
    mutationFn: async (member) => {
      unwrap(
        await supabase.rpc('remove_member', { p_budget_id: budgetId, p_user_id: member.user_id }),
      )
      return null
    },
    success: (_data, member) =>
      t('members.removed', { name: memberName(member) ?? t('members.unknownName') }),
    onSuccess: close,
    invalidate: () => [budgetKeys.budget(budgetId)],
  })
  const leave = useAppMutation<null>({
    errorDisplay: 'inline',
    mutationFn: async () => {
      unwrap(await supabase.rpc('leave_budget', { p_budget_id: budgetId }))
      return null
    },
    success: () => t('members.left', { name: budget.name }),
    onSuccess: () => {
      close()
      void navigate(paths.dashboard, { replace: true })
    },
    invalidate: () => [budgetKeys.list],
  })

  // Whose income is primary: that member can neither be removed nor leave (D-031).
  const primaryOwner = incomes.data?.find((income) => income.is_primary)?.user_id ?? null

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-lg font-semibold">{t('members.title')}</h2>
        </CardTitle>
        <CardDescription>{t('members.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {members.isPending ? (
          <LoadingState rows={2} />
        ) : members.isError ? (
          <ErrorState error={members.error} onRetry={() => void members.refetch()} />
        ) : (
          <ul className="flex flex-col divide-y rounded-xl border" data-testid="member-list">
            {members.data.map((member) => {
              const me = member.user_id === user?.id
              const owner = member.role === 'owner'
              const hasPrimary = member.user_id === primaryOwner
              return (
                <li
                  key={member.user_id}
                  className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <span className="truncate">
                        {me
                          ? t('members.you', {
                              name: memberName(member) ?? t('members.unknownName'),
                            })
                          : (memberName(member) ?? t('members.unknownName'))}
                      </span>
                      <Badge variant={owner ? 'default' : 'secondary'}>
                        {owner ? t('members.role.owner') : t('members.role.member')}
                      </Badge>
                    </p>
                    {member.email && (
                      <p className="truncate text-sm text-muted-foreground">{member.email}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-start gap-1 sm:items-end">
                    {isOwner && !me && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={hasPrimary}
                        onClick={() => {
                          remove.reset()
                          setPending({ kind: 'remove', member })
                        }}
                      >
                        <UserMinusIcon />
                        {t('members.remove')}
                      </Button>
                    )}
                    {!isOwner && me && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={hasPrimary}
                        onClick={() => {
                          leave.reset()
                          setPending({ kind: 'leave' })
                        }}
                      >
                        <LogOutIcon />
                        {t('members.leave')}
                      </Button>
                    )}
                    {hasPrimary && ((isOwner && !me) || (!isOwner && me)) && (
                      <p className="max-w-64 text-xs text-muted-foreground sm:text-right">
                        {me ? t('members.leavePrimaryHelp') : t('members.removePrimaryHelp')}
                      </p>
                    )}
                    {isOwner && me && (
                      <p className="max-w-64 text-xs text-muted-foreground sm:text-right">
                        {t('members.ownerCannotLeave')}
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {isOwner ? <Invitations /> : <OwnerOnlyNote>{t('members.manageOwnerOnly')}</OwnerOnlyNote>}
      </CardContent>

      <ConfirmDialog
        open={pending.kind === 'remove'}
        onOpenChange={(open) => {
          if (!open) close()
        }}
        title={t('members.removeTitle', {
          name:
            pending.kind === 'remove'
              ? (memberName(pending.member) ?? t('members.unknownName'))
              : '',
        })}
        description={<p>{t('members.removeDescription')}</p>}
        confirmLabel={t('members.remove')}
        destructive
        pending={remove.isPending}
        error={remove.error}
        onConfirm={() => {
          if (pending.kind === 'remove') remove.mutate(pending.member)
        }}
      />
      <ConfirmDialog
        open={pending.kind === 'leave'}
        onOpenChange={(open) => {
          if (!open) close()
        }}
        title={t('members.leaveTitle', { name: budget.name })}
        description={<p>{t('members.leaveDescription')}</p>}
        confirmLabel={t('members.leave')}
        destructive
        pending={leave.isPending}
        error={leave.error}
        onConfirm={() => leave.mutate()}
      />
    </Card>
  )
}

const inviteSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, { error: 'validation.emailRequired' })
    .pipe(z.email({ error: 'validation.emailInvalid' })),
})

/** Owner only: invite by email, list and cancel pending invitations. */
function Invitations() {
  const { t } = useTranslation()
  const { budgetId } = useCurrentBudget()
  const errorMessage = useErrorMessage()
  const invitations = useBudgetInvitations(budgetId, true)
  const form = useForm<z.input<typeof inviteSchema>, unknown, z.output<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '' },
  })

  const invite = useAppMutation<string, string>({
    errorDisplay: 'inline',
    mutationFn: async (email) =>
      unwrap(await supabase.rpc('invite_member', { p_budget_id: budgetId, p_email: email })),
    success: (_id, email) => t('invitations.sent', { email }),
    onSuccess: () => form.reset({ email: '' }),
    invalidate: () => [budgetKeys.invitations(budgetId)],
  })
  const cancel = useAppMutation<null, BudgetInvitation>({
    mutationFn: async (invitation) => {
      const rows = unwrap(
        await supabase.from('budget_invitations').delete().eq('id', invitation.id).select('id'),
      )
      if (rows.length === 0) throw new DbError('invitation_not_found')
      return null
    },
    success: (_data, invitation) => t('invitations.cancelled', { email: invitation.email }),
    invalidate: () => [budgetKeys.invitations(budgetId)],
  })

  const onSubmit = form.handleSubmit(({ email }) =>
    invite.mutateAsync(email).catch(() => undefined),
  )

  return (
    <section className="flex flex-col gap-4">
      <h3 className="font-medium">{t('invitations.title')}</h3>
      <Alert>
        <InfoIcon aria-hidden />
        <AlertTitle>{t('invitations.noEmailTitle')}</AlertTitle>
        <AlertDescription>{t('invitations.noEmailDescription')}</AlertDescription>
      </Alert>
      <form onSubmit={(event) => void onSubmit(event)} noValidate>
        <FieldGroup>
          {invite.isError && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(invite.error)}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex-1">
              <TextField
                control={form.control}
                name="email"
                type="email"
                autoComplete="off"
                label={t('invitations.email')}
                placeholder={t('fields.emailPlaceholder')}
              />
            </div>
            <Button type="submit" className="sm:mt-6" disabled={invite.isPending}>
              {invite.isPending ? t('common.saving') : t('invitations.invite')}
            </Button>
          </div>
        </FieldGroup>
      </form>
      {invitations.isError ? (
        <ErrorState error={invitations.error} onRetry={() => void invitations.refetch()} />
      ) : invitations.data && invitations.data.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-medium">{t('invitations.pending')}</h4>
          <ul className="flex flex-col divide-y rounded-xl border" data-testid="invitation-list">
            {invitations.data.map((invitation) => (
              <li key={invitation.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{invitation.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('invitations.invitedOn', { date: formatTimestamp(invitation.created_at) })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(invitation)}
                  aria-label={t('invitations.cancelFor', { email: invitation.email })}
                >
                  <XIcon />
                  <span className="hidden sm:inline">{t('invitations.cancel')}</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : invitations.data ? (
        <p className="text-sm text-muted-foreground">{t('invitations.none')}</p>
      ) : null}
    </section>
  )
}
