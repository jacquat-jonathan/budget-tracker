import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'

import { ThemeProvider } from '@/components/theme/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { resetAuthBootstrap } from '@/features/auth/auth-bootstrap'
import { AuthProvider } from '@/features/auth/auth-provider'

/** Render routes in a memory router with the app's providers, starting at `path`. */
export function renderRoutes(routes: RouteObject[], path: string) {
  // Each render is a fresh page load as far as the auth bootstrap is concerned.
  resetAuthBootstrap()
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  const result = render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <RouterProvider router={router} />
          <Toaster />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
  return { ...result, router, queryClient }
}
