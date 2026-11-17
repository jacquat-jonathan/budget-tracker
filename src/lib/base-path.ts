/**
 * The site's base path, set at build time through `VITE_BASE_PATH` and applied by Vite as
 * `base`. Vite exposes it as `import.meta.env.BASE_URL`, always with a trailing slash.
 */

/** Router basename: "/" or the base path without its trailing slash, e.g. "/budget". */
export const routerBasename: string = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/'

/** Absolute URL of an in-app path, for links sent by email (confirmation, password reset). */
export function appUrl(path = ''): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
  return new URL(`${base}${path.replace(/^\/+/, '')}`, window.location.origin).toString()
}
