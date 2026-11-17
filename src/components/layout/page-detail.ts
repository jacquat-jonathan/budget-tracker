import { createContext, useContext, useEffect } from 'react'

/**
 * A page that shows one record (a debt) names it in the breadcrumb and the browser tab:
 * "Car loan · Debts · Budget Tracker". The layout owns the value; the page sets it while shown.
 */
export const PageDetailContext = createContext<((detail: string | null) => void) | null>(null)

// R-APP-536: a record's page is titled with the record's name.
export function usePageDetail(detail: string | null | undefined): void {
  const set = useContext(PageDetailContext)
  useEffect(() => {
    if (!set) return
    set(detail ?? null)
    return () => set(null)
  }, [set, detail])
}
