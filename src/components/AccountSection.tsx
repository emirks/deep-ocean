/**
 * AccountSection — sits at the bottom of the sidebar.
 *
 * States:
 *   auth not loaded  → nothing (prevents flash)
 *   not logged in    → "Sign in" prompt
 *   logged in, free  → email + "Upgrade" link
 *   logged in, pro   → email + "Premium" badge
 */
import { Link, useNavigate } from '@tanstack/react-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { LogIn, LogOut, Sparkles, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const CHECKOUT_URL = import.meta.env.VITE_LEMON_SQUEEZY_CHECKOUT_URL as string | undefined

export function AccountSection() {
  const { loaded, user, isPremium, clear } = useAuthStore()
  const navigate = useNavigate()

  if (!loaded) return null

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    clear()
    navigate({ to: '/' })
  }

  const openCheckout = async () => {
    if (CHECKOUT_URL) await window.api.openExternal(CHECKOUT_URL)
  }

  if (!user) {
    return (
      <div className="px-3 py-3 border-t border-border">
        <Link to="/login">
          <Button
            variant="ghost" size="sm"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground h-8 text-xs"
          >
            <LogIn className="h-3.5 w-3.5" />
            Sign in / Create account
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="px-3 py-3 border-t border-border space-y-1.5">
      {/* Email row */}
      <div className="flex items-center gap-2 px-2 py-1">
        <div className="flex-shrink-0 rounded-full bg-muted p-1">
          <User className="h-3 w-3 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{user.email}</p>
          {isPremium ? (
            <span className="inline-flex items-center gap-1 text-xs text-purple-400 font-medium">
              <Sparkles className="h-2.5 w-2.5" /> Premium
            </span>
          ) : (
            <span className="text-xs text-muted-foreground/60">Free plan</span>
          )}
        </div>
      </div>

      {/* Upgrade button (only for free users) */}
      {!isPremium && CHECKOUT_URL && (
        <Button
          variant="ghost" size="sm"
          onClick={openCheckout}
          className={cn(
            'w-full justify-start gap-2 h-7 text-xs',
            'text-purple-400 hover:text-purple-300 hover:bg-purple-500/10'
          )}
        >
          <Sparkles className="h-3 w-3" />
          Upgrade to Premium
        </Button>
      )}

      {/* Sign out */}
      <Button
        variant="ghost" size="sm"
        onClick={handleSignOut}
        className="w-full justify-start gap-2 h-7 text-xs text-muted-foreground/60 hover:text-foreground"
      >
        <LogOut className="h-3 w-3" />
        Sign out
      </Button>
    </div>
  )
}
