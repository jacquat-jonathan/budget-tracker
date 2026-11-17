import { Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useLocation, useMatches } from 'react-router'

import { allNavItems, type PageHandle } from '@/app/navigation'
import { paths } from '@/app/paths'
import { FullPageSpinner } from '@/components/full-page-spinner'
import { PageLoadBoundary } from '@/components/page-load-boundary'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { PageDetailContext } from '@/components/layout/page-detail'
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

function AppBreadcrumb({ detail }: { detail: string | null }) {
  const { t } = useTranslation()
  const page = useCurrentPage()
  const pageTitle = page ? t(`nav.${page.nav}`) : undefined
  useDocumentTitle(detail && pageTitle ? `${detail} · ${pageTitle}` : pageTitle)

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
            <BreadcrumbItem className={detail ? 'hidden sm:inline-flex' : undefined}>
              {detail ? (
                <BreadcrumbLink asChild>
                  <Link
                    to={allNavItems.find((item) => item.key === page?.nav)?.path ?? paths.dashboard}
                  >
                    {pageTitle}
                  </Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </>
        )}
        {pageTitle && detail && (
          <>
            <BreadcrumbSeparator className="hidden sm:inline-flex" />
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="truncate">{detail}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

const MAIN_CONTENT_ID = 'main-content'

/**
 * The first stop of the keyboard: straight to the page, past the sidebar's links. Shown only
 * while it has the focus.
 */
// R-APP-538: a "Skip to content" link comes before the sidebar.
function SkipToContent() {
  const { t } = useTranslation()
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      onClick={(event) => {
        event.preventDefault()
        document.getElementById(MAIN_CONTENT_ID)?.focus()
      }}
      className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-medium shadow-md focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {t('ui.skipToContent')}
    </a>
  )
}

/** Signed-in shell: collapsible sidebar, header with breadcrumb, and the routed page. */
export function AppLayout() {
  const { current } = useBudgets()
  const { pathname } = useLocation()
  const [detail, setDetail] = useState<string | null>(null)
  return (
    <PageDetailContext.Provider value={setDetail}>
      <TooltipProvider delayDuration={0}>
        <SidebarProvider defaultOpen={readSidebarOpen()}>
          <SkipToContent />
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
              <AppBreadcrumb detail={detail} />
            </header>
            <div
              id={MAIN_CONTENT_ID}
              tabIndex={-1}
              className="flex min-w-0 flex-1 flex-col gap-4 p-4 outline-none md:p-6"
            >
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
    </PageDetailContext.Provider>
  )
}
