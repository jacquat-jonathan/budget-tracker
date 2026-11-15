import { createClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/database.types'
import { getSupabaseConfig } from '@/lib/env'

const { url, publishableKey } = getSupabaseConfig()

/** The single Supabase client of the app. Only the publishable key reaches the browser. */
export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Implicit flow: confirmation and password-reset links carry the session in the URL
    // fragment, so they also work when opened in another browser or on another device
    // (PKCE would need the code verifier stored by the browser that requested the email).
    flowType: 'implicit',
  },
})
