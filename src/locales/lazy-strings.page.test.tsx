import { screen } from '@testing-library/react'

import { routes } from '@/app/routes'
import { categoriesDb } from '@/test/budget-fixtures'
import { renderRoutes } from '@/test/render'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'

// This file loads no string group up front (src/test/setup.ts reads the flag): the pages must
// wait for their own.
const mock = vi.hoisted(() => {
  ;(globalThis as { skipStringPreload?: boolean }).skipStringPreload = true
  return { current: null as ReturnType<typeof createSupabaseMock> | null }
})

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

// The import strings arrive late, as a slow chunk would.
vi.mock('@/locales/groups/import', async (original) => {
  await new Promise((resolve) => setTimeout(resolve, 300))
  return original()
})

describe('page strings load with the pages [D-448]', () => {
  it('a page waits for its lazily loaded strings: no key is ever shown', async () => {
    mock.current = createSupabaseMock(fakeSession(), categoriesDb())
    renderRoutes(routes, '/import')
    // The moment the page is there, its strings are too.
    await screen.findByTestId('pdf-input', {}, { timeout: 5000 })
    expect(
      screen.getByRole('heading', { name: 'What would you like to import?' }),
    ).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\bimport\.[a-z]+\.[a-zA-Z]+/)
  }, 10_000)
})
