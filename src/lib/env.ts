/** Build-time configuration read from `VITE_` variables (see `.env.example`). */

const REQUIRED = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'] as const

type RequiredEnvVar = (typeof REQUIRED)[number]

function read(name: RequiredEnvVar): string {
  const value: unknown = import.meta.env[name]
  return typeof value === 'string' ? value.trim() : ''
}

/** Names of required variables that are missing or empty. */
export function missingEnvVars(): RequiredEnvVar[] {
  return REQUIRED.filter((name) => read(name) === '')
}

export class MissingEnvError extends Error {
  readonly missing: readonly string[]

  constructor(missing: readonly string[]) {
    super(
      `Missing environment variable(s): ${missing.join(', ')}. ` +
        'Copy .env.example to .env.local and fill in the Supabase URL and publishable key ' +
        '(for the local stack, `npx supabase status` prints both), then restart the dev server ' +
        'or rebuild.',
    )
    this.name = 'MissingEnvError'
    this.missing = missing
  }
}

export interface SupabaseConfig {
  url: string
  publishableKey: string
}

export function getSupabaseConfig(): SupabaseConfig {
  const missing = missingEnvVars()
  if (missing.length > 0) throw new MissingEnvError(missing)
  return {
    url: read('VITE_SUPABASE_URL'),
    publishableKey: read('VITE_SUPABASE_PUBLISHABLE_KEY'),
  }
}
