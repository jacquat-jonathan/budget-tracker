import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/auth-context'
import type { Tables } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

export type Profile = Tables<'profiles'>

export const profileQueryKey = (userId: string | undefined) => ['profile', userId] as const

/** The signed-in user's profile row (created by a database trigger on sign-up). */
export function useProfile() {
  const { user } = useAuth()
  const userId = user?.id

  return useQuery({
    queryKey: profileQueryKey(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId ?? '')
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/** Name to show for the signed-in user: profile, then sign-up metadata, then email. */
export function useDisplayName(): string | null {
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const metadataName: unknown = user?.user_metadata.display_name
  return (
    profile?.display_name?.trim() ||
    (typeof metadataName === 'string' && metadataName.trim()) ||
    null
  )
}
