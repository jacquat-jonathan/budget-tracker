import { WalletIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { LanguageSelect } from '@/components/preferences/language-select'
import { ThemeSelect } from '@/components/preferences/theme-select'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useDocumentTitle } from '@/hooks/use-document-title'

interface AuthLayoutProps {
  title: string
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
}

/** Centered card used by every signed-out page, with language and theme controls. */
export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  const { t } = useTranslation()
  useDocumentTitle(title)

  return (
    <div className="flex min-h-svh flex-col bg-muted/40">
      <header className="flex items-center justify-between gap-2 p-4">
        <div className="flex items-center gap-2 font-medium">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <WalletIcon className="size-4" />
          </span>
          {t('app.name')}
        </div>
        <div className="flex items-center gap-1">
          <LanguageSelect />
          <ThemeSelect />
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:items-center sm:pt-0">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>
              <h1 className="text-xl font-semibold">{title}</h1>
            </CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
          {children && <CardContent>{children}</CardContent>}
          {footer && (
            <CardFooter className="flex-col gap-2 text-center text-sm text-muted-foreground">
              {footer}
            </CardFooter>
          )}
        </Card>
      </main>
    </div>
  )
}
