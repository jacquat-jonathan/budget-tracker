import { render, screen } from '@testing-library/react'

import { ConfigError } from '@/components/config-error'
import { getSupabaseConfig, MissingEnvError, missingEnvVars } from '@/lib/env'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('missing Supabase settings [R-APP-003]', () => {
  it('are detected, blank values included', () => {
    expect(missingEnvVars()).toEqual([])
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '   ')
    expect(missingEnvVars()).toEqual(['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'])
  })

  it('stop the Supabase client from being configured', () => {
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')
    expect(() => getSupabaseConfig()).toThrow(MissingEnvError)
    expect(() => getSupabaseConfig()).toThrow(/VITE_SUPABASE_PUBLISHABLE_KEY/)
  })

  it('are named on the page shown instead of the app', () => {
    render(<ConfigError missing={['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']} />)
    expect(screen.getByText(/VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY/)).toBeInTheDocument()
  })
})
