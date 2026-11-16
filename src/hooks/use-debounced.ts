import { useEffect, useState } from 'react'

/**
 * The value once it has stopped changing for `delay` ms, compared by value (an object built
 * anew on each render is the same value), and whether what is returned is behind the value
 * given (`stale`): a preview not read on each keystroke, shown as loading meanwhile.
 */
export function useDebounced<T>(value: T, delay = 300): { value: T; stale: boolean } {
  const key = JSON.stringify(value)
  const [settled, setSettled] = useState({ key, value })
  useEffect(() => {
    if (key === settled.key) return
    const timer = window.setTimeout(() => setSettled({ key, value }), delay)
    return () => window.clearTimeout(timer)
    // The key stands for the value: a new object with the same content re-arms nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, settled.key, delay])
  return { value: settled.value, stale: settled.key !== key }
}
