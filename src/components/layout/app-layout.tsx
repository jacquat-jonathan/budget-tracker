import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useLocation, useMatches } from 'react-router'

import type { PageHandle } from '@/app/navigation'
import { paths } from '@/app/paths'
import { FullPageSpinner } from '@/components/full-page-spinner'
import { PageLoadBoundary } from '@/components/page-load-boundary'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { useBudgets } from '@/features/budgets/current-budget-context'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AccountSwitchedAlert } from '@/features/auth/components/account-switched-alert'
import { LinkErrorAlert } from '@/features/auth/components/link-error-alert'
import { BudgetLostAlert } from '@/features/budgets/components/budget-lost-alert'
import { useDocumentTitle } from '@/hooks/use-document-title'

/** Same cookie the shadcn sidebar writes when it is toggled. */
function readSidebarOpen(): boolean {
  return !document.cookie.split('; ').includes('sidebar_state=false')
}

function isPageHandle(handle: unknown): handle is PageHandle {
  return typeof handle === 'object' && handle !== null && 'nav' in handle
}

function useCurrentPage(): PageHandle | undefined {
  const matches = useMatches()
  return matches
    .map((match) => match.handle)
    .filter(isPageHandle)
    .at(-1)
}

function AppBreadcrumb() {
  const { t } = useTranslation()
  const page = useCurrentPage()
  const pageTitle = page ? t(`nav.${page.nav}`) : undefined
  useDocumentTitle(pageTitle)

  return (
    <Breadcrumb aria-label={t('ui.breadcrumb')}>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden sm:inline-flex">
          <BreadcrumbLink asChild>
            <Link to={paths.dashboard}>{t('app.name')}</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {pageTitle && (
          <>
            <BreadcrumbSeparator className="hidden sm:inline-flex" />
            <BreadcrumbItem>
              <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

/** Signed-in shell: collapsible sidebar, header with breadcrumb, and the routed page. */
export function AppLayout() {
  const { current } = useBudgets()
  const { pathname } = useLocation()
  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider defaultOpen={readSidebarOpen()}>
        <AppSidebar />
        {/* min-w-0: the page shrinks beside the sidebar instead of pushing past the screen,
            so long names truncate rather than scroll the page sideways. */}
        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/80">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-center"
            />
            <AppBreadcrumb />
          </header>
          <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:p-6">
            {/* An email link that landed while signed in and did not sign anyone in. */}
            <LinkErrorAlert />
            <AccountSwitchedAlert />
            <BudgetLostAlert />
            {/* A page whose code could not be downloaded offers to try again, inside the
                layout; the boundary starts afresh on another page. */}
            <PageLoadBoundary key={pathname}>
              <Suspense fallback={<FullPageSpinner inline />}>
                {/* R-BUDGET-053: a page belongs to one budget. When the current budget changes
                    (switched, deleted, or I was removed) the page is rebuilt, so no dialog or
                    form opened for one budget can save into another. */}
                <Outlet key={current?.id ?? 'none'} />
              </Suspense>
            </PageLoadBoundary>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
