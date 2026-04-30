/**
 * Supabase client for the renderer process.
 *
 * Uses PKCE flow with detectSessionInUrl: false so we can handle the
 * deepocean://auth/callback redirect manually from the main process.
 *
 * The anon key is intentionally public — Supabase Row Level Security
 * (RLS) governs what each authenticated user can access.
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing.\n' +
    'Copy .env.example → .env and fill in your project keys. See SETUP.md.'
  )
}

export const supabase = createClient(
  SUPABASE_URL      ?? '',
  SUPABASE_ANON_KEY ?? '',
  {
    auth: {
      flowType:          'pkce',
      detectSessionInUrl: false,   // handled manually via deep link IPC
      persistSession:     true,    // localStorage works fine in Electron renderer
    },
  }
)

/** Fetch the caller's premium status from the profiles table. */
export async function fetchIsPremium(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('is_premium')
    .eq('id', userId)
    .single()
  if (error) {
    console.warn('[Supabase] fetchIsPremium error:', error.message)
    return false
  }
  return data?.is_premium ?? false
}
