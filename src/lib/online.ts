import { useSyncExternalStore } from 'react'

/** Whether the browser says it is offline (navigator.onLine false). */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** True while the browser is offline; follows the online and offline events. */
export function useOffline(): boolean {
  return useSyncExternalStore(subscribe, isOffline, () => false)
}

/**
 * A write tried while the browser is offline: refused before anything is sent, so nothing was
 * saved and nothing goes out later by itself.
 */
export class OfflineError extends Error {
  constructor() {
    super('offline')
    this.name = 'OfflineError'
  }
}

/** Every write starts here: offline, it is refused at once (D-634). */
// R-APP-531: a save tried offline is refused with "nothing was saved", never held back.
export function assertOnline(): void {
  if (isOffline()) throw new OfflineError()
}
