import { zodResolver } from '@hookform/resolvers/zod'
import { LockIcon } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { z } from 'zod'

import { paths } from '@/app/paths'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { CalendarDate, CalendarDateField } from '@/components/form/calendar-date-field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldGroup, FieldSeparator } from '@/components/ui/field'
import { TextField } from '@/features/auth/components/text-field'
import {
  useDeleteBudget,
  useRenameBudget,
  useSetBudgetEndDate,
} from '@/features/budgets/budget-mutations'
import { useCurrentBudget } from '@/features/budgets/current-budget-context'
import { monthOf } from '@/features/budgets/start-months'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { formatCalendarDate } from '@/lib/date'
import { nameSchema, optionalCalendarDateSchema } from '@/lib/form-schemas'
import { currentLanguage } from '@/lib/i18n'

/** "Only the owner can …": shown instead of an owner-only control for a plain member. */
export function OwnerOnlyNote({ children }: { children: string }) {
  return (
    <p className="flex items-start gap-2 text-sm text-muted-foreground">
      <LockIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

export function BudgetSettings() {
  const { t } = useTranslation()
  const { budget, isOwner } = useCurrentBudget()

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-lg font-semibold">{t('settings.budget.title')}</h2>
        </CardTitle>
        <CardDescription>{t('settings.budget.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {/* Keyed by budget: switching budgets starts the forms from that budget's values. */}
        <RenameForm key={`name-${budget.id}`} />
        <FieldSeparator />
        {/* R-MEMBER-050: owner-only, with the reason for a member. */}
        {isOwner ? (
          <EndDateForm key={`end-${budget.id}-${budget.end_date ?? ''}`} />
        ) : (
          <div className="flex flex-col gap-2">
            <h3 className="font-medium">{t('settings.budget.endDate')}</h3>
            <p className="text-sm">
              {budget.end_date ? (
                <CalendarDate value={budget.end_date} />
              ) : (
                t('settings.budget.noEndDate')
              )}
            </p>
            <OwnerOnlyNote>{t('settings.budget.endDateOwnerOnly')}</OwnerOnlyNote>
          </div>
        )}
        <FieldSeparator />
        <DeleteBudget key={`delete-${budget.id}`} />
      </CardContent>
    </Card>
  )
}

const renameSchema = z.object({ name: nameSchema })

function RenameForm() {
  const { t } = useTranslation()
  const { budget, budgetId } = useCurrentBudget()
  const errorMessage = useErrorMessage()
  const rename = useRenameBudget(budgetId)
  const form = useForm<z.input<typeof renameSchema>, unknown, z.output<typeof renameSchema>>({
    resolver: zodResolver(renameSchema),
    defaultValues: { name: budget.name },
  })

  const onSubmit = form.handleSubmit(({ name }) =>
    rename.mutateAsync(name).then(
      () => form.reset({ name }),
      () => undefined,
    ),
  )

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate>
      <FieldGroup>
        {rename.isError && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(rename.error)}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex-1">
            <TextField
              control={form.control}
              name="name"
              label={t('budgets.fields.name')}
              autoComplete="off"
            />
          </div>
          <Button type="submit" className="sm:mt-6" disabled={rename.isPending}>
            {rename.isPending ? t('common.saving') : t('settings.budget.rename')}
          </Button>
        </div>
      </FieldGroup>
    </form>
  )
}

const endDateSchema = z.object({ endDate: optionalCalendarDateSchema })

function EndDateForm() {
  const { t } = useTranslation()
  const { budget, budgetId } = useCurrentBudget()
  const errorMessage = useErrorMessage()
  const setEndDate = useSetBudgetEndDate(budgetId)
  const form = useForm<z.input<typeof endDateSchema>, unknown, z.output<typeof endDateSchema>>({
    resolver: zodResolver(endDateSchema),
    defaultValues: { endDate: budget.end_date ?? '' },
  })

  const onSubmit = form.handleSubmit(({ endDate }) =>
    setEndDate.mutateAsync(endDate).catch(() => undefined),
  )

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate>
      <FieldGroup>
        <div className="flex flex-col gap-1">
          <h3 className="font-medium">{t('settings.budget.endDate')}</h3>
          <p className="text-sm text-muted-foreground">
            {budget.end_date && budget.end_month
              ? t('settings.budget.endsWith', {
                  month: monthOf(budget.end_month, currentLanguage()),
                  date: formatCalendarDate(budget.end_date),
                })
              : t('settings.budget.noEndDate')}
          </p>
        </div>
        {setEndDate.isError && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(setEndDate.error)}</AlertDescription>
          </Alert>
        )}
        <CalendarDateField
          control={form.control}
          name="endDate"
          label={t('budgets.fields.endDateOptional')}
          description={t('settings.budget.endDateHelp')}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={setEndDate.isPending}>
            {setEndDate.isPending ? t('common.saving') : t('settings.budget.saveEndDate')}
          </Button>
          {budget.end_date && (
            <Button
              type="button"
              variant="outline"
              disabled={setEndDate.isPending}
              onClick={() => setEndDate.mutate(null)}
            >
              {t('settings.budget.clearEndDate')}
            </Button>
          )}
        </div>
      </FieldGroup>
    </form>
  )
}

function DeleteBudget() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { budget, budgetId, isOwner } = useCurrentBudget()
  const [open, setOpen] = useState(false)
  const remove = useDeleteBudget(budgetId, {
    onDeleted: () => {
      setOpen(false)
      void navigate(paths.dashboard, { replace: true })
    },
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="font-medium text-destructive">{t('settings.budget.deleteTitle')}</h3>
        <p className="text-sm text-muted-foreground">{t('settings.budget.deleteHelp')}</p>
      </div>
      {isOwner ? (
        <Button
          variant="destructive"
          className="self-start"
          onClick={() => {
            remove.reset()
            setOpen(true)
          }}
        >
          {t('settings.budget.delete')}
        </Button>
      ) : (
        <OwnerOnlyNote>{t('settings.budget.deleteOwnerOnly')}</OwnerOnlyNote>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('settings.budget.deleteConfirmTitle', { name: budget.name })}
        description={<p>{t('settings.budget.deleteConfirmDescription')}</p>}
        confirmLabel={t('settings.budget.delete')}
        destructive
        // R-BUDGET-052: the budget's name is typed before it is deleted.
        typeToConfirm={budget.name}
        pending={remove.isPending}
        error={remove.error}
        onConfirm={() => remove.mutate(budget.name)}
      />
    </div>
  )
}
