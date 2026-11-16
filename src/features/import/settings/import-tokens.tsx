import { CopyIcon, KeyRoundIcon, PlusIcon, TriangleAlertIcon } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { ExternalText } from '@/components/external-text'
import { ErrorState, LoadingState } from '@/components/states'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { budgetKeys } from '@/features/budgets/budget-keys'
import { unwrap } from '@/features/budgets/budget-queries'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'
import { useImportTokens, type ImportToken } from '@/features/import/import-queries'
import { useAppMutation, useErrorMessage } from '@/hooks/use-app-mutation'
import { formatTimestamp } from '@/lib/date'
import { supabase } from '@/lib/supabase'

/** The database's bounds for a token's life (create_import_token). */
export const TOKEN_DAYS_DEFAULT = 30
export const TOKEN_DAYS_MAX = 365

type TokenState = 'active' | 'revoked' | 'expired' | 'stopped'

function stateOf(token: ImportToken): TokenState {
  if (token.is_active) return 'active'
  if (token.revoked_at) return 'revoked'
  // Display only: is_active is the database's answer; this says why it is not active.
  if (Date.parse(token.expires_at) <= Date.now()) return 'expired'
  return 'stopped'
}

/**
 * Import tokens (US-IMPORT-004): create one (name and life in days), its secret shown once
 * with a copy button and where to put it; the list with who, when, last use, expiry and state;
 * revoke, and delete a revoked or expired one. The secret lives only in this dialog's state
 * while it is open: never in the address, storage, the query or mutation cache, or a log.
 */
// R-IMPORT-074: tokens are created and revoked in Settings; the secret is shown once.
export function ImportTokensSettings() {
  const { t } = useTranslation()
  const { budgetId } = useCurrentBudget()
  const tokens = useImportTokens(budgetId)
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<ImportToken | null>(null)
  const [removing, setRemoving] = useState<ImportToken | null>(null)
  const revoke = useAppMutation<null, ImportToken>({
    errorDisplay: 'inline',
    mutationFn: async (token) => {
      unwrap(await supabase.rpc('revoke_import_token', { p_token_id: token.id }))
      return null
    },
    success: () => t('import.tokens.revoked'),
    onSuccess: () => setRevoking(null),
    invalidate: () => [budgetKeys.importTokens(budgetId)],
  })
  const remove = useAppMutation<null, ImportToken>({
    errorDisplay: 'inline',
    mutationFn: async (token) => {
      unwrap(await supabase.rpc('delete_import_token', { p_token_id: token.id }))
      return null
    },
    success: () => t('import.tokens.removed'),
    onSuccess: () => setRemoving(null),
    invalidate: () => [budgetKeys.importTokens(budgetId)],
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="flex items-center gap-2">
            <KeyRoundIcon className="size-4 text-muted-foreground" aria-hidden />
            {t('import.tokens.title')}
          </h2>
        </CardTitle>
        <CardDescription>{t('import.tokens.help')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {t('import.tokens.limit')} {t('import.tokens.docs')}
          </p>
          <Button type="button" size="sm" onClick={() => setCreating(true)}>
            <PlusIcon aria-hidden />
            {t('import.tokens.create')}
          </Button>
        </div>
        {tokens.isError ? (
          <ErrorState error={tokens.error} onRetry={() => void tokens.refetch()} />
        ) : !tokens.data ? (
          <LoadingState rows={2} />
        ) : tokens.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('import.tokens.empty')}</p>
        ) : (
          <ul
            className="flex flex-col divide-y rounded-lg border"
            aria-label={t('import.tokens.list')}
            data-testid="token-list"
          >
            {tokens.data.map((token) => {
              const state = stateOf(token)
              return (
                <li
                  key={token.id}
                  className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm"
                  data-testid="token-row"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex min-w-0 flex-wrap items-center gap-2 font-medium">
                      <ExternalText>{token.name}</ExternalText>
                      <Badge variant={state === 'active' ? 'default' : 'secondary'}>
                        {t(`import.tokens.state.${state}`)}
                      </Badge>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {token.created_by_name
                        ? t('import.tokens.createdBy', {
                            name: token.created_by_name,
                            date: formatTimestamp(token.created_at),
                          })
                        : t('import.tokens.createdByUnknown', {
                            date: formatTimestamp(token.created_at),
                          })}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {token.last_used_at
                        ? t('import.tokens.lastUsed', { date: formatTimestamp(token.last_used_at) })
                        : t('import.tokens.neverUsed')}
                      {' · '}
                      {state === 'revoked' && token.revoked_at
                        ? t('import.tokens.revokedOn', { date: formatTimestamp(token.revoked_at) })
                        : state === 'expired'
                          ? t('import.tokens.expiredOn', {
                              date: formatTimestamp(token.expires_at),
                            })
                          : t('import.tokens.expiresOn', {
                              date: formatTimestamp(token.expires_at),
                            })}
                    </span>
                    {state === 'stopped' && (
                      <span className="text-xs">{t('import.tokens.stoppedHelp')}</span>
                    )}
                  </div>
                  {state === 'active' ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setRevoking(token)}
                      aria-label={t('import.tokens.revokeFor', { name: token.name })}
                    >
                      {t('import.tokens.revoke')}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setRemoving(token)}
                      aria-label={t('import.tokens.removeFor', { name: token.name })}
                    >
                      {t('import.tokens.remove')}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
      {creating && <CreateTokenDialog budgetId={budgetId} onClose={() => setCreating(false)} />}
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRevoking(null)
            revoke.reset()
          }
        }}
        title={t('import.tokens.revokeTitle', { name: revoking?.name ?? '' })}
        description={t('import.tokens.revokeBody')}
        confirmLabel={t('import.tokens.revoke')}
        onConfirm={() => revoking && revoke.mutate(revoking)}
        pending={revoke.isPending}
        error={revoke.error}
        destructive
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemoving(null)
            remove.reset()
          }
        }}
        title={t('import.tokens.removeTitle', { name: removing?.name ?? '' })}
        description={t('import.tokens.removeBody')}
        confirmLabel={t('import.tokens.remove')}
        onConfirm={() => removing && remove.mutate(removing)}
        pending={remove.isPending}
        error={remove.error}
        destructive
      />
    </Card>
  )
}

/** Create a token; then its secret, once. The secret is held here only, and dropped on close. */
function CreateTokenDialog({ budgetId, onClose }: { budgetId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const id = useId()
  const errorMessage = useErrorMessage()
  const [name, setName] = useState('')
  const [days, setDays] = useState(String(TOKEN_DAYS_DEFAULT))
  const [secret, setSecret] = useState<string | null>(null)
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null)
  const secretRef = useRef<HTMLTextAreaElement>(null)
  const dayCount = Number(days)
  const daysValid = Number.isInteger(dayCount) && dayCount >= 1 && dayCount <= TOKEN_DAYS_MAX
  const create = useAppMutation<{ tokenId: string }, { name: string; days: number }>({
    errorDisplay: 'inline',
    // The secret goes to this dialog's state and nowhere else: the mutation keeps only the id.
    mutationFn: async (input) => {
      const row = unwrap(
        await supabase.rpc('create_import_token', {
          p_budget_id: budgetId,
          p_name: input.name,
          p_expires_in_days: input.days,
        }),
      )[0]
      setSecret(row?.token ?? null)
      return { tokenId: row?.token_id ?? '' }
    },
    invalidate: () => [budgetKeys.importTokens(budgetId)],
  })
  const close = () => {
    setSecret(null)
    create.reset()
    onClose()
  }
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent>
        {secret === null ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (name.trim() === '' || !daysValid) return
              create.mutate({ name: name.trim(), days: dayCount })
            }}
            className="flex flex-col gap-4"
          >
            <DialogHeader>
              <DialogTitle>{t('import.tokens.createTitle')}</DialogTitle>
              <DialogDescription>{t('import.tokens.help')}</DialogDescription>
            </DialogHeader>
            {create.isError && (
              <Alert variant="destructive">
                <AlertDescription>{errorMessage(create.error)}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-name`}>{t('import.tokens.name')}</Label>
              <Input
                id={`${id}-name`}
                value={name}
                maxLength={100}
                autoComplete="off"
                placeholder={t('import.tokens.namePlaceholder')}
                onChange={(event) => setName(event.target.value)}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-days`}>{t('import.tokens.expires')}</Label>
              <Input
                id={`${id}-days`}
                type="number"
                inputMode="numeric"
                min={1}
                max={TOKEN_DAYS_MAX}
                value={days}
                onChange={(event) => setDays(event.target.value)}
                aria-invalid={!daysValid}
                aria-describedby={`${id}-days-help`}
                className="w-32"
              />
              <p id={`${id}-days-help`} className="text-xs text-muted-foreground">
                {t('import.tokens.expiresHelp', {
                  max: TOKEN_DAYS_MAX,
                  default: TOKEN_DAYS_DEFAULT,
                })}
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={create.isPending || name.trim() === '' || !daysValid}>
                {create.isPending ? t('common.saving') : t('import.tokens.createButton')}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{t('import.tokens.secretTitle')}</DialogTitle>
              <DialogDescription className="flex items-start gap-2 font-medium text-foreground">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{t('import.tokens.secretOnce')}</span>
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-secret`}>{t('import.tokens.secretLabel')}</Label>
              {/* Shown whole (it wraps), so it can be checked by eye as well as copied. */}
              <textarea
                ref={secretRef}
                id={`${id}-secret`}
                readOnly
                rows={2}
                value={secret}
                className="w-full resize-none rounded-lg border border-input bg-muted/40 px-2.5 py-2 font-mono text-xs break-all outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                autoComplete="off"
                spellCheck={false}
                onFocus={(event) => event.currentTarget.select()}
                data-testid="token-secret"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard
                      .writeText(secret)
                      .then(() => setCopied('yes'))
                      .catch(() => {
                        setCopied('failed')
                        secretRef.current?.select()
                      })
                  }}
                >
                  <CopyIcon aria-hidden />
                  {t('import.tokens.copy')}
                </Button>
                {copied && (
                  <p role="status" className="text-xs">
                    {copied === 'yes' ? t('import.tokens.copied') : t('import.tokens.copyFailed')}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
              <p>{t('import.tokens.secretWhere', { name: 'BUDGET_IMPORT_TOKEN' })}</p>
              <p className="font-medium">{t('import.tokens.secretNever')}</p>
            </div>
            <DialogFooter>
              <Button type="button" onClick={close}>
                {t('import.tokens.done')}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
