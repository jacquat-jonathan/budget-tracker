import type { AuthError, Session, User } from '@supabase/supabase-js'
import { vi } from 'vitest'

interface AuthResult<TData> {
  data: TData
  error: AuthError | null
}
type SessionData = { session: Session | null; user: User | null }

/**
 * In-memory stand-in for the Supabase client. Use with
 * `vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }))` (inside vi.hoisted when
 * needed) so tests never reach a backend.
 */
export function createSupabaseMock(initialSession: Session | null = null) {
  let session = initialSession
  type Listener = (event: string, session: Session | null) => void
  const listeners = new Set<Listener>()

  const emit = (event: string, next: Session | null) => {
    session = next
    for (const listener of listeners) listener(event, next)
  }

  const auth = {
    getSession: vi.fn(() => Promise.resolve({ data: { session }, error: null })),
    onAuthStateChange: vi.fn((listener: Listener) => {
      listeners.add(listener)
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } }
    }),
    signInWithPassword: vi.fn((): Promise<AuthResult<SessionData>> =>
      Promise.resolve({ data: { session: null, user: null }, error: null }),
    ),
    signUp: vi.fn((): Promise<AuthResult<SessionData>> =>
      Promise.resolve({ data: { session: null, user: null }, error: null }),
    ),
    signOut: vi.fn(() => {
      emit('SIGNED_OUT', null)
      return Promise.resolve({ error: null })
    }),
    resetPasswordForEmail: vi.fn((): Promise<AuthResult<object>> =>
      Promise.resolve({ data: {}, error: null }),
    ),
    updateUser: vi.fn((): Promise<AuthResult<{ user: User | null }>> =>
      Promise.resolve({ data: { user: null }, error: null }),
    ),
  }

  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
  }

  return {
    client: { auth, from: vi.fn(() => query) },
    /** Simulate Supabase reporting a sign-in (or any auth event) to listeners. */
    emit,
  }
}

export function fakeSession(overrides: Partial<Session['user']> = {}): Session {
  return {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: '00000000-0000-0000-0000-000000000001',
      aud: 'authenticated',
      email: 'alex@example.com',
      app_metadata: {},
      user_metadata: { display_name: 'Alex' },
      created_at: '2026-01-01T00:00:00Z',
      ...overrides,
    },
  }
}
