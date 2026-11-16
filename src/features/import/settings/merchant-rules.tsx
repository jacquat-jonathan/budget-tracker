import { PencilIcon, StoreIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { ExternalText } from '@/components/external-text'
import { NativeSelect } from '@/components/native-select'
import { ErrorState, LoadingState } from '@/components/states'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { useCategories } from '@/features/categories/category-queries'
import {
  useMerchantRules,
  useRememberedChoices,
  type MerchantRule,
} from '@/features/import/import-queries'
import { useAppMutation, useErrorMessage } from '@/hooks/use-app-mutation'
import { formatTimestamp } from '@/lib/date'
import { supabase } from '@/lib/supabase'

/**
 * Merchant rules (US-IMPORT-005): each rule's text and category, a rule whose category ended
 * flagged; edit (with the revision it was read at; optionally applied at once to the imports
 * waiting in "to categorise") and delete.
 */
// R-IMPORT-078: merchant rules are edited in Settings.
export function MerchantRulesSettings() {
  const { t } = useTranslation()
  const { budgetId } = useCurrentBudget()
  const rules = useMerchantRules(budgetId)
  const [editing, setEditing] = useState<MerchantRule | null>(null)
  const [removing, setRemoving] = useState<MerchantRule | null>(null)
  const remove = useAppMutation<null, MerchantRule>({
    errorDisplay: 'inline',
    mutationFn: async (rule) => {
      unwrap(
        await supabase.rpc('delete_merchant_rule', {
          p_rule_id: rule.id,
          p_expected_revision: rule.revision,
        }),
      )
      return null
    },
    success: () => t('import.rules.removed'),
    onSuccess: () => setRemoving(null),
    invalidate: () => [budgetKeys.merchantRules(budgetId)],
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="flex items-center gap-2">
            <StoreIcon className="size-4 text-muted-foreground" aria-hidden />
            {t('import.rules.title')}
          </h2>
        </CardTitle>
        <CardDescription>{t('import.rules.help')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {rules.isError ? (
          <ErrorState error={rules.error} onRetry={() => void rules.refetch()} />
        ) : !rules.data ? (
          <LoadingState rows={2} />
        ) : rules.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('import.rules.empty')}</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {t('import.rules.count', { count: rules.data.length })}
            </p>
            <ul className="flex flex-col divide-y rounded-lg border" data-testid="rule-list">
              {rules.data.map((rule) => (
                <li
                  key={rule.id}
                  className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm"
                  data-testid="rule-row"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-mono text-sm">
                      <ExternalText>{rule.fragment}</ExternalText>
                    </span>
                    <span className="text-muted-foreground">
                      → {rule.parent_category_name ? `${rule.parent_category_name} › ` : ''}
                      {rule.category_name}
                    </span>
                    {rule.category_in_force === false && (
                      <span className="flex items-start gap-1.5 text-xs" data-testid="rule-ended">
                        <TriangleAlertIcon
                          className="size-3.5 shrink-0 text-destructive"
                          aria-hidden
                        />
                        {t('import.rules.ended')}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t('import.rules.editFor', { fragment: rule.fragment })}
                      onClick={() => setEditing(rule)}
                    >
                      <PencilIcon />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t('import.rules.removeFor', { fragment: rule.fragment })}
                      onClick={() => setRemoving(rule)}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
      {editing && (
        <EditRuleDialog budgetId={budgetId} rule={editing} onClose={() => setEditing(null)} />
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemoving(null)
            remove.reset()
          }
        }}
        title={t('import.rules.removeTitle', { fragment: removing?.fragment ?? '' })}
        description={t('import.rules.removeBody')}
        confirmLabel={t('import.rules.remove')}
        onConfirm={() => removing && remove.mutate(removing)}
        pending={remove.isPending}
        error={remove.error}
        destructive
      />
    </Card>
  )
}

function EditRuleDialog({
  budgetId,
  rule,
  onClose,
}: {
  budgetId: string
  rule: MerchantRule
  onClose: () => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const errorMessage = useErrorMessage({
    category_to_categorise: 'import.toCategorise.errors.rule',
  })
  const categories = useCategories(budgetId)
  const [fragment, setFragment] = useState(rule.fragment)
  const [categoryId, setCategoryId] = useState(rule.category_id)
  const [apply, setApply] = useState(false)
  // A rule takes a leaf in force now, never "to categorise" (its own category stays offered).
  const choices = useMemo(() => {
    const list = categories.data ?? []
    const byId = new Map(list.map((category) => [category.id, category]))
    return list
      .filter(
        (category) =>
          !category.is_group &&
          !category.is_to_categorise &&
          (category.is_active === true || category.id === rule.category_id),
      )
      .map((category) => {
        const parent = category.parent_id ? byId.get(category.parent_id) : undefined
        return {
          id: category.id,
          name: parent ? `${parent.name} › ${category.name}` : category.name,
        }
      })
  }, [categories.data, rule.category_id])
  const save = useAppMutation<number>({
    errorDisplay: 'inline',
    mutationFn: async () =>
      unwrap(
        await supabase.rpc('update_merchant_rule', {
          p_rule_id: rule.id,
          p_expected_revision: rule.revision,
          ...(fragment.trim() !== rule.fragment ? { p_fragment: fragment.trim() } : {}),
          ...(categoryId !== rule.category_id ? { p_category_id: categoryId } : {}),
          ...(apply ? { p_apply: true } : {}),
        }),
      )[0]?.moved ?? 0,
    success: (moved) =>
      moved > 0 ? t('import.rules.savedMoved', { count: moved }) : t('import.rules.saved'),
    onSuccess: onClose,
    invalidate: () => [budgetKeys.merchantRules(budgetId), budgetKeys.budget(budgetId)],
  })
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            save.mutate()
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('import.rules.editTitle')}</DialogTitle>
            <DialogDescription>{t('import.rules.help')}</DialogDescription>
          </DialogHeader>
          {save.isError && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(save.error)}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-fragment`}>{t('import.rules.fragment')}</Label>
            <Input
              id={`${id}-fragment`}
              value={fragment}
              maxLength={100}
              onChange={(event) => setFragment(event.target.value)}
              aria-describedby={`${id}-fragment-help`}
              className="font-mono"
            />
            <p id={`${id}-fragment-help`} className="text-xs text-muted-foreground">
              {t('import.rules.fragmentHelp')}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-category`}>{t('import.rules.category')}</Label>
            <NativeSelect
              id={`${id}-category`}
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              {choices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id={`${id}-apply`}
              checked={apply}
              onCheckedChange={(next) => setApply(next === true)}
            />
            <Label htmlFor={`${id}-apply`} className="font-normal">
              {t('import.rules.apply')}
            </Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={save.isPending || fragment.trim() === ''}>
              {save.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The choices remembered for flagged entries (list_import_choices). The database offers no way
 * to forget one (Q-272): the card says how to change one instead.
 */
// R-IMPORT-092: what is remembered is visible.
export function RememberedChoicesSettings() {
  const { t } = useTranslation()
  const { budgetId } = useCurrentBudget()
  const choices = useRememberedChoices(budgetId)
  const FLAGS = ['card_bill_payment', 'own_transfer', 'transfer_to_person', 'salary'] as const
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('import.choices.title')}</h2>
        </CardTitle>
        <CardDescription>{t('import.choices.help')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {choices.isError ? (
          <ErrorState error={choices.error} onRetry={() => void choices.refetch()} />
        ) : !choices.data ? (
          <LoadingState rows={2} />
        ) : choices.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('import.choices.empty')}</p>
        ) : (
          <ul
            className="flex flex-col divide-y rounded-lg border text-sm"
            data-testid="choice-list"
          >
            {choices.data.map((choice) => (
              <li
                key={`${choice.flag}|${choice.counterparty_key}`}
                className="flex flex-wrap items-start justify-between gap-2 p-3"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-mono">
                    <ExternalText>{choice.counterparty_key}</ExternalText>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {(FLAGS as readonly string[]).includes(choice.flag)
                      ? t(`import.preview.flags.${choice.flag as (typeof FLAGS)[number]}`)
                      : choice.flag}
                    {' · '}
                    {t('import.choices.by', { date: formatTimestamp(choice.updated_at) })}
                  </span>
                </div>
                <span className="font-medium">
                  {choice.choice === 'import' || choice.choice === 'skip'
                    ? t(`import.choices.choice.${choice.choice}`)
                    : choice.choice}
                </span>
              </li>
            ))}
          </ul>
        )}
        {choices.hasNextPage && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="self-start"
            onClick={() => void choices.fetchNextPage()}
          >
            {t('import.choices.more')}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">{t('import.choices.noForget')}</p>
      </CardContent>
    </Card>
  )
}
