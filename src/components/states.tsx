import { TriangleAlertIcon, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { cn } from '@/lib/utils'

/** Placeholder rows while data loads; announced to screen readers once. */
export function LoadingState({ rows = 3, className }: { rows?: number; className?: string }) {
  const { t } = useTranslation()
  return (
    <div role="status" className={cn('flex flex-col gap-3', className)}>
      <span className="sr-only">{t('common.loading')}</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  )
}

/** A failed read: the translated reason and a way to try again. */
export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown
  onRetry?: () => void
  className?: string
}) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 p-6 text-center',
        className,
      )}
    >
      <TriangleAlertIcon className="size-6 text-destructive" aria-hidden />
      <p className="font-medium">{t('states.loadFailed')}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t('states.retry')}
        </Button>
      )}
    </div>
  )
}

/** Nothing to show yet, with what to do about it. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-center',
        className,
      )}
    >
      {Icon && (
        <span className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Icon className="size-6 text-muted-foreground" aria-hidden />
        </span>
      )}
      <h2 className="text-lg font-medium">{title}</h2>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  )
}

/** Title, description and the page's main action. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
  )
}
