import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { useDocumentTitle } from '@/hooks/use-document-title'

interface StatusPageProps {
  icon: LucideIcon
  code?: string
  title: string
  description: string
  action?: ReactNode
}

/** Full-screen message for 404, unexpected errors and missing configuration. */
export function StatusPage({ icon: Icon, code, title, description, action }: StatusPageProps) {
  useDocumentTitle(title)

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-muted">
        <Icon className="size-7 text-muted-foreground" aria-hidden />
      </span>
      {code && <p className="font-mono text-sm text-muted-foreground">{code}</p>}
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="max-w-md text-muted-foreground">{description}</p>
      {action}
    </main>
  )
}
