import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'

import { routes } from '@/app/routes'
import { ThemeProvider } from '@/components/theme/theme-provider'
import { AuthProvider } from '@/features/auth/auth-provider'
import { routerBasename } from '@/lib/base-path'
import { createQueryClient } from '@/lib/query-client'

const router = createBrowserRouter(routes, { basename: routerBasename })

export function App() {
  const [queryClient] = useState(createQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
