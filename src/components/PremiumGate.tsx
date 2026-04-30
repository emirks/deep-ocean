/**
 * PremiumGate wraps any premium-only UI.
 *
 * States:
 *   • auth not loaded yet       → renders nothing (avoids flash)
 *   • not logged in             → "Sign in to unlock" card
 *   • logged in but not premium → "Upgrade to Premium" card
 *   • premium                   → renders children
 */
import { Link } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { Lock, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

const CHECKOUT_URL = import.meta.env.VITE_LEMON_SQUEEZY_CHECKOUT_URL as string | undefined

interface Props {
  children:    React.ReactNode
  /** Short label shown in the gate card, e.g. "Server-time schedules" */
  feature:     string
  /** Extra classes on the gate card wrapper */
  className?:  string
}

export function PremiumGate({ children, feature, className }: Props) {
  const { loaded, user, isPremium } = useAuthStore()

  if (!loaded) return null
  if (isPremium) return <>{children}</>

  // ── Not premium (or not logged in) ─────────────────────────────────────────

  const openCheckout = async () => {
    if (CHECKOUT_URL) await window.api.openExternal(CHECKOUT_URL)
  }

  return (
    <div className={cn(
      'rounded-lg border border-purple-500/20 bg-purple-500/5 px-4 py-4',
      className
    )}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0 rounded-md bg-purple-500/15 p-1.5">
          <Lock className="h-3.5 w-3.5 text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-purple-200">{feature}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {user
              ? 'Upgrade to DeepOcean Premium to unlock this feature.'
              : 'Sign in and upgrade to DeepOcean Premium to unlock this feature.'
            }
          </p>
          <div className="flex items-center gap-2 mt-3">
            {!user ? (
              <Link to="/login">
                <Button size="sm" variant="outline" className="h-7 text-xs border-purple-500/40 text-purple-300 hover:bg-purple-500/10">
                  Sign in
                </Button>
              </Link>
            ) : null}
            {CHECKOUT_URL ? (
              <Button
                size="sm"
                onClick={openCheckout}
                className="h-7 text-xs bg-purple-600 hover:bg-purple-500 text-white gap-1.5"
              >
                <Sparkles className="h-3 w-3" />
                Upgrade to Premium
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground/50 italic">
                (Checkout URL not configured — see SETUP.md)
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
