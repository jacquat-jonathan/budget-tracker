import { zodResolver } from '@hookform/resolvers/zod'
import { LockIcon } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { z } from 'zod'

import { paths } from '@/app/paths'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { CalendarDateField } from '@/components/form/calendar-date-field'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldGroup, FieldSeparator } from '@/components/ui/field'
import { TextField } from '@/features/auth/components/text-field'
import {
  useDeleteBudget,
  useRenameBudget,
  useSetBudgetEndDate,
} from '@/features/budgets/budget-mutations'
import { useBudgets, useCurrentBudget } from '@/features/budgets/current-budget-context'
import { ConcurrentNotices } from '@/components/changed-elsewhere'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import type { MyBudget } from '@/features/budgets/budget-queries'
import { useRecordViews } from '@/features/budgets/record-views'
import { useConcurrentForm } from '@/hooks/use-concurrent-form'
import { useEditBase } from '@/hooks/use-edit-base'
import { formatCalendarDate } from '@/lib/date'
import { nameSchema, optionalCalendarDateSchema } from '@/lib/form-schemas'
import { isSameName } from '@/lib/same-name'

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
          <EndDateForm key={`end-${budget.id}`} />
        ) : (
          <div className="flex flex-col gap-2">
            <h3 className="font-medium">{t('settings.budget.endDate')}</h3>
            <p className="text-sm">
              {budget.end_date_entered && budget.end_date
                ? t('settings.budget.endsWith', {
                    entered: formatCalendarDate(budget.end_date_entered),
                    date: formatCalendarDate(budget.end_date),
                  })
                : t('settings.budget.noEndDate')}
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
  const views = useRecordViews()
  // R-CONCURRENCY-091: only the name matters to this form; another field of the budget
  // changing (the end date, the primary income) is not a conflict for it.
  const base = useEditBase(budget, budget, views.budgetName)
  const valuesOf = (from: MyBudget) => ({ name: from.name })
  const form = useForm<z.input<typeof renameSchema>, unknown, z.output<typeof renameSchema>>({
    resolver: zodResolver(renameSchema),
    defaultValues: valuesOf(budget),
  })
  const sync = useConcurrentForm(form, base, valuesOf, () => rename.reset(), {
    error: rename.error,
  })
  const { budgets } = useBudgets()
  const typedName = useWatch({ control: form.control, name: 'name' })
  const nameTaken = budgets.some(
    (other) => other.id !== budgetId && isSameName(other.name, typedName),
  )

  const onSubmit = form.handleSubmit(({ name }) =>
    rename.mutateAsync({ name, revision: (base.base ?? budget).revision }).then(
      (revision) => {
        base.savedAs(revision)
        form.reset({ name })
      },
      () => undefined,
    ),
  )

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate>
      <FieldGroup>
        <ConcurrentNotices
          gone={false}
          pending={sync.pending}
          updated={sync.updated}
          recovered={sync.recovered}
          onUseTheirs={sync.useTheirs}
          onKeepMine={sync.keepMine}
          error={rename.error}
          message={errorMessage}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex-1">
            <TextField
              control={form.control}
              name="name"
              label={t('budgets.fields.name')}
              autoComplete="off"
              warning={nameTaken ? t('budgets.nameTaken', { name: typedName.trim() }) : null}
            />
          </div>
          <Button
            type="submit"
            className="sm:mt-6"
            disabled={rename.isPending || sync.pending !== null}
          >
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
  const views = useRecordViews()
  // Only the end date matters to this form (see RenameForm).
  const base = useEditBase(budget, budget, views.budgetEnd)
  const valuesOf = (from: MyBudget) => ({ endDate: from.end_date_entered ?? '' })
  const form = useForm<z.input<typeof endDateSchema>, unknown, z.output<typeof endDateSchema>>({
    resolver: zodResolver(endDateSchema),
    defaultValues: valuesOf(budget),
  })
  const sync = useConcurrentForm(form, base, valuesOf, () => setEndDate.reset(), {
    error: setEndDate.error,
  })

  const save = (endDate: string | null) =>
    setEndDate.mutateAsync({ endDate, revision: (base.base ?? budget).revision }).then(
      (stored) => {
        if (stored) base.savedAs(stored.revision)
        form.reset({ endDate: stored?.end_date_entered ?? '' })
      },
      () => undefined,
    )
  const onSubmit = form.handleSubmit(({ endDate }) => save(endDate))

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate>
      <FieldGroup>
        <div className="flex flex-col gap-1">
          <h3 className="font-medium">{t('settings.budget.endDate')}</h3>
          <p className="text-sm text-muted-foreground">
            {/* R-BUDGET-054: the date entered, and the last day that results from it. */}
            {budget.end_date_entered && budget.end_date
              ? t('settings.budget.endsWith', {
                  entered: formatCalendarDate(budget.end_date_entered),
                  date: formatCalendarDate(budget.end_date),
                })
              : t('settings.budget.noEndDate')}
          </p>
        </div>
        <ConcurrentNotices
          gone={false}
          pending={sync.pending}
          updated={sync.updated}
          recovered={sync.recovered}
          onUseTheirs={sync.useTheirs}
          onKeepMine={sync.keepMine}
          error={setEndDate.error}
          message={errorMessage}
        />
        <CalendarDateField
          control={form.control}
          name="endDate"
          label={t('budgets.fields.endDateOptional')}
          description={t('settings.budget.endDateHelp')}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={setEndDate.isPending || sync.pending !== null}>
            {setEndDate.isPending ? t('common.saving') : t('settings.budget.saveEndDate')}
          </Button>
          {budget.end_date_entered && (
            <Button
              type="button"
              variant="outline"
              disabled={setEndDate.isPending || sync.pending !== null}
              onClick={() => void save(null)}
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
