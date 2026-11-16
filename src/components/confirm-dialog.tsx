import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import type { DbErrorOverrides } from '@/lib/db-errors'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel: string
  onConfirm: () => void
  pending?: boolean
  /** Shown inline when the action failed. */
  error?: unknown
  /** The action's own words for some refusals. */
  errorMessages?: DbErrorOverrides
  destructive?: boolean
  /** The user must type this text (e.g. the budget's name) before confirming. */
  typeToConfirm?: string
}

/** Confirmation for an action with consequences, with its pending state and error inline. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  pending = false,
  error,
  errorMessages,
  destructive = false,
  typeToConfirm,
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage(errorMessages)
  const id = useId()
  const [typed, setTyped] = useState('')
  const confirmed = typeToConfirm === undefined || typed.trim() === typeToConfirm.trim()

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setTyped('')
        onOpenChange(next)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-2">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {typeToConfirm !== undefined && (
          <Field>
            <FieldLabel htmlFor={id}>
              {t('confirm.typeToConfirm', { text: typeToConfirm })}
            </FieldLabel>
            <Input
              id={id}
              value={typed}
              autoComplete="off"
              onChange={(event) => setTyped(event.target.value)}
            />
          </Field>
        )}
        {error !== undefined && error !== null && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(error)}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t('common.cancel')}</AlertDialogCancel>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={pending || !confirmed}
            onClick={onConfirm}
          >
            {pending ? t('common.saving') : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
