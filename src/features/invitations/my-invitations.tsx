import { MailIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { budgetKeys } from '@/features/budgets/budget-keys'
import { unwrap, useMyInvitations, type MyInvitation } from '@/features/budgets/budget-queries'
import { useBudgets } from '@/features/budgets/current-budget-context'
import { useAppMutation } from '@/hooks/use-app-mutation'
import { formatTimestamp } from '@/lib/date'
import { supabase } from '@/lib/supabase'

/**
 * Invitations addressed to my verified email, with accept and decline (US-MEMBERS-002).
 * Renders nothing when there are none, or while they load or fail to: it is an extra on
 * the page it sits on, never what the page is about.
 */
export function MyInvitations({ onAccepted }: { onAccepted?: (budgetId: string) => void }) {
  const { t } = useTranslation()
  const invitations = useMyInvitations()
  const list = invitations.data ?? []
  if (list.length === 0) return null

  return (
    <Card data-testid="my-invitations">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailIcon className="size-4 text-muted-foreground" aria-hidden />
          <h2>{t('invitations.mine.title', { count: list.length })}</h2>
        </CardTitle>
        <CardDescription>{t('invitations.mine.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {list.map((invitation) => (
            <InvitationRow key={invitation.id} invitation={invitation} onAccepted={onAccepted} />
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function InvitationRow({
  invitation,
  onAccepted,
}: {
  invitation: MyInvitation
  onAccepted?: (budgetId: string) => void
}) {
  const { t } = useTranslation()
  const { selectBudget } = useBudgets()

  // An invitation that expired or was cancelled meanwhile answers "not found".
  const gone = { invitation_not_found: 'invitations.mine.gone' } as const
  const accept = useAppMutation<string>({
    errorMessages: gone,
    // A refusal means the list changed meanwhile (expired, cancelled): show the fresh one.
    invalidateOnError: [budgetKeys.myInvitations],
    mutationFn: async () =>
      unwrap(await supabase.rpc('accept_invitation', { p_invitation_id: invitation.id })),
    success: () => t('invitations.mine.accepted', { name: invitation.budget_name }),
    onSuccess: (budgetId) => {
      selectBudget(budgetId)
      onAccepted?.(budgetId)
    },
    invalidate: () => [budgetKeys.myInvitations, budgetKeys.list],
  })
  const decline = useAppMutation<null>({
    errorMessages: gone,
    // A refusal means the list changed meanwhile (expired, cancelled): show the fresh one.
    invalidateOnError: [budgetKeys.myInvitations],
    mutationFn: async () => {
      unwrap(await supabase.rpc('decline_invitation', { p_invitation_id: invitation.id }))
      return null
    },
    success: () => t('invitations.mine.declined', { name: invitation.budget_name }),
    invalidate: () => [budgetKeys.myInvitations],
  })
  const busy = accept.isPending || decline.isPending

  return (
    <li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-medium">{invitation.budget_name}</p>
        <p className="text-sm text-muted-foreground">
          {t('invitations.mine.from', {
            name: invitation.invited_by_name || t('members.unknownName'),
            email: invitation.invited_by_email,
          })}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('invitations.mine.dates', {
            sent: formatTimestamp(invitation.created_at),
            expires: formatTimestamp(invitation.expires_at),
          })}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" disabled={busy} onClick={() => accept.mutate()}>
          {accept.isPending ? t('common.saving') : t('invitations.mine.accept')}
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => decline.mutate()}>
          {t('invitations.mine.decline')}
        </Button>
      </div>
    </li>
  )
}
