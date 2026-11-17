import { createContext, useContext } from 'react'

/**
 * Where keyboard focus goes when a dialog closes (R-APP-006). Radix returns focus to the
 * element that had it when the dialog opened; for a dialog opened from a dropdown menu that
 * is the menu item, which is gone by then, so focus fell to the page body. Here the opener
 * is resolved when the dialog opens: a menu item stands for its menu's trigger button (the
 * row's "Actions" button), and an element inside another dialog (a dialog opened when
 * another one saved) for that dialog's own opener. When the dialog closes, focus returns
 * there; if it is gone too (the row was removed), to the page's heading.
 *
 * Built into the shared Dialog and AlertDialog (src/components/ui), so every controlled
 * dialog gets it. Dialogs opened by their own trigger keep Radix's behaviour.
 */

export const openers = new Map<string, HTMLElement>()

export interface FocusReturn {
  key: string
  opener: HTMLElement | null
}

export const FocusReturnContext = createContext<FocusReturn | null>(null)

export function resolveOpener(active: Element | null): HTMLElement | null {
  let element = active
  // A menu item: its menu's trigger (for a submenu, up to the top menu's trigger).
  for (let depth = 0; element && depth < 5; depth += 1) {
    const menu = element.closest('[role="menu"]')
    if (!menu) break
    const triggerId = menu.getAttribute('aria-labelledby')
    element = triggerId ? document.getElementById(triggerId) : null
  }
  if (!(element instanceof HTMLElement) || element === document.body) return null
  const dialog = element.closest<HTMLElement>('[data-focus-return]')
  const key = dialog?.dataset.focusReturn
  if (key) return openers.get(key) ?? null
  return element
}

function focusPageHeading(): void {
  const heading = document.querySelector<HTMLElement>('main h1') ?? document.querySelector('main')
  if (!heading) return
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
  heading.focus()
}

/** For the shared dialog contents: props that return focus to the opener on close. */
export function useFocusReturn(onCloseAutoFocus?: (event: Event) => void) {
  const context = useContext(FocusReturnContext)
  if (!context) return { onCloseAutoFocus }
  return {
    'data-focus-return': context.key,
    onCloseAutoFocus: (event: Event) => {
      onCloseAutoFocus?.(event)
      if (event.defaultPrevented) return
      const { opener } = context
      if (!opener) return
      event.preventDefault()
      if (opener.isConnected) opener.focus()
      else focusPageHeading()
    },
  }
}
