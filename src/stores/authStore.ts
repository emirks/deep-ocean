import { create } from 'zustand'
import type { User, Session } from '@supabase/supabase-js'

interface AuthState {
  user:       User    | null
  session:    Session | null
  isPremium:  boolean
  /** False until the initial session check in __root resolves. */
  loaded:     boolean

  setSession:   (session: Session | null) => void
  setIsPremium: (v: boolean)              => void
  setLoaded:    (v: boolean)              => void
  clear:        ()                        => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user:      null,
  session:   null,
  isPremium: false,
  loaded:    false,

  setSession:   (session) => set({ session, user: session?.user ?? null }),
  setIsPremium: (isPremium) => set({ isPremium }),
  setLoaded:    (loaded)    => set({ loaded }),
  clear:        ()          => set({ user: null, session: null, isPremium: false }),
}))
