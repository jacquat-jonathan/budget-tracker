import { createElement, lazy, type ComponentType, type LazyExoticComponent } from 'react'

/** A page's code (or its strings) could not be downloaded: offline, or the server failed. */
export class PageLoadError extends Error {
  constructor(cause: unknown) {
    super('page_load_failed', { cause })
    this.name = 'PageLoadError'
  }
}

/**
 * A page loaded on first visit, like React.lazy, except that a failed download is not kept:
 * the next render (a retry, or the same page visited again) downloads it again. React.lazy
 * keeps a rejected load for good, so a page that failed offline stayed broken after the
 * connection came back.
 */
// R-APP-532: a page that failed to load is loaded again on retry.
export function lazyPage(load: () => Promise<{ default: ComponentType }>): ComponentType {
  const make = (): LazyExoticComponent<ComponentType> =>
    lazy(() =>
      load().catch((error: unknown) => {
        current = make()
        throw new PageLoadError(error)
      }),
    )
  let current = make()
  function Page() {
    return createElement(current)
  }
  return Page
}
