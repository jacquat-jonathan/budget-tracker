import { QueryClient } from '@tanstack/react-query'

import { dbErrorCode } from '@/lib/db-errors'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // A read answered catching_up is not a failure: the catch-up reads it again once the
        // budget is caught up (budget-routes), so it is never retried meanwhile.
        retry: (failures, error) => failures < 1 && dbErrorCode(error) !== 'catching_up',
        refetchOnWindowFocus: false,
      },
    },
  })
}
