import type { Session, User } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

import type { AccountSwitch } from '@/features/auth/auth-bootstrap'
import type { AuthLinkError } from '@/features/auth/auth-redirect'

export interface AuthContextValue {
  session: Session | null
  user: User | null
  /** True until the stored session (or the one from an email link) has been restored. */
  loading: boolean
  /**
   * A password-recovery link signed the user in: they must choose a new password before
   * using the app. Driven by the recovery link and Supabase's PASSWORD_RECOVERY event.
   */
  recovery: boolean
  /** Call once the new password is saved. */
  completeRecovery: () => void
  /** The email link the user arrived through was expired, already used or invalid. */
  linkError: AuthLinkError | null
  dismissLinkError: () => void
  /** The email link this page load landed with signed in another account than before. */
  accountSwitch: AccountSwitch | null
  dismissAccountSwitch: () => void
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider.')
  return context
}
