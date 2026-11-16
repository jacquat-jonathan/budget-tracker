import { useEffect, useId, useState, type ReactNode } from 'react'

import { FocusReturnContext, openers, resolveOpener } from '@/components/dialog-focus-context'

/** For the shared dialog roots: remember who opened a controlled dialog. */
export function FocusReturnProvider({
  open,
  children,
}: {
  open: boolean | undefined
  children: ReactNode
}) {
  const key = useId()
  const [wasOpen, setWasOpen] = useState(false)
  const [opener, setOpener] = useState<HTMLElement | null>(null)
  // Resolved while rendering the opening, before React changes the page: the menu item that
  // opened the dialog still has focus then.
  if (open !== undefined && open !== wasOpen) {
    setWasOpen(open)
    if (open) setOpener(resolveOpener(document.activeElement))
  }
  useEffect(() => {
    if (!opener) return
    openers.set(key, opener)
    return () => {
      openers.delete(key)
    }
  }, [key, opener])
  return (
    <FocusReturnContext.Provider value={open === undefined ? null : { key, opener }}>
      {children}
    </FocusReturnContext.Provider>
  )
}

