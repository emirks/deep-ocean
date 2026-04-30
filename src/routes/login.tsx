import { createRoute, useNavigate } from '@tanstack/react-router'
import { rootRoute } from './__root'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Loader2, Mail, ShieldCheck, Clock, Lock, Waves, ArrowRight, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import logo from '@/assets/logo.png'

const REDIRECT_TO = 'deepocean://auth/callback'

const PREMIUM_PERKS = [
  { icon: Clock,        text: 'Server-time schedules — clock rollback & timezone bypass blocked' },
  { icon: Lock,         text: 'Settings lock — protect your config behind a gateway phrase' },
  { icon: ShieldCheck,  text: 'Future security hardening features as they ship' },
]

// ── Google button ─────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

function LoginPage() {
  const navigate = useNavigate()

  const [view,        setView]        = useState<'main' | 'magic-link' | 'sent'>('main')
  const [email,       setEmail]       = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')

  // ── Google OAuth ───────────────────────────────────────────────────────────

  const handleGoogle = async () => {
    setLoading(true); setError('')
    try {
      const { data, error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options:  { redirectTo: REDIRECT_TO, skipBrowserRedirect: true },
      })
      if (oauthErr) throw oauthErr
      if (data.url) await window.api.openExternal(data.url)
    } catch (e: any) {
      setError(e?.message ?? 'Could not start Google sign-in.')
    } finally {
      setLoading(false)
    }
  }

  // ── Magic link ─────────────────────────────────────────────────────────────

  const handleMagicLink = async () => {
    if (!email.trim()) return
    setLoading(true); setError('')
    try {
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: REDIRECT_TO },
      })
      if (otpErr) throw otpErr
      setView('sent')
    } catch (e: any) {
      setError(e?.message ?? 'Could not send magic link.')
    } finally {
      setLoading(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">

      {/* Left panel — branding + perks */}
      <div className="hidden lg:flex w-80 flex-shrink-0 flex-col border-r border-border bg-sidebar px-8 py-10">
        <div className="flex items-center gap-3 mb-10">
          <img src={logo} alt="DeepOcean" className="h-9 w-9 rounded-xl object-cover" />
          <span className="font-semibold text-lg tracking-tight">DeepOcean</span>
        </div>

        <div className="flex-1">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-5">
            Premium unlocks
          </p>
          <div className="space-y-5">
            {PREMIUM_PERKS.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-start gap-3">
                <div className="mt-0.5 flex-shrink-0 rounded-md bg-purple-500/10 p-1.5">
                  <Icon className="h-3.5 w-3.5 text-purple-400" />
                </div>
                <p className="text-sm text-muted-foreground leading-snug">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
          <Waves className="h-3 w-3" />
          <span>DeepOcean — stay deep, stay focused</span>
        </div>
      </div>

      {/* Right panel — auth form */}
      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm space-y-8">

          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2 justify-center mb-2">
            <img src={logo} alt="" className="h-8 w-8 rounded-lg object-cover" />
            <span className="font-semibold">DeepOcean</span>
          </div>

          {/* ── sent state ── */}
          {view === 'sent' ? (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="rounded-full bg-emerald-500/10 p-4">
                  <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                </div>
              </div>
              <div>
                <h1 className="text-xl font-semibold">Check your inbox</h1>
                <p className="text-sm text-muted-foreground mt-2">
                  We sent a magic link to <strong className="text-foreground">{email}</strong>.
                  Click it and the app will sign you in automatically.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setView('magic-link')} className="text-muted-foreground">
                Use a different email
              </Button>
            </div>

          ) : view === 'magic-link' ? (
            /* ── magic link form ── */
            <div className="space-y-6">
              <div>
                <button
                  onClick={() => { setView('main'); setError('') }}
                  className="text-xs text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1"
                >
                  ← Back
                </button>
                <h1 className="text-2xl font-semibold">Sign in with email</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  We'll send a one-click magic link — no password needed.
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    autoFocus
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError('') }}
                    onKeyDown={e => { if (e.key === 'Enter') handleMagicLink() }}
                    disabled={loading}
                  />
                </div>
                {error && <p className="text-xs text-red-400">{error}</p>}
                <Button
                  className="w-full"
                  onClick={handleMagicLink}
                  disabled={loading || !email.trim()}
                >
                  {loading
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <><Mail className="h-4 w-4 mr-2" />Send magic link</>
                  }
                </Button>
              </div>
            </div>

          ) : (
            /* ── main auth view ── */
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-semibold">Sign in to DeepOcean</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Create an account or sign in to unlock premium security features.
                </p>
              </div>

              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full gap-2.5"
                  onClick={handleGoogle}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
                  Continue with Google
                </Button>

                <div className="relative">
                  <Separator />
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">
                    or
                  </span>
                </div>

                <Button
                  variant="outline"
                  className="w-full gap-2.5 text-muted-foreground"
                  onClick={() => { setView('magic-link'); setError('') }}
                  disabled={loading}
                >
                  <Mail className="h-4 w-4" />
                  Continue with email
                  <ArrowRight className="h-3.5 w-3.5 ml-auto" />
                </Button>

                {error && <p className="text-xs text-red-400 text-center">{error}</p>}
              </div>

              <p className="text-xs text-muted-foreground text-center leading-relaxed">
                Signing in lets us know who our users are and unlocks
                premium anti-bypass features.{' '}
                <span className="text-muted-foreground/60">Core blocking is always free.</span>
              </p>
            </div>
          )}

          {/* Skip link — always visible */}
          {view !== 'sent' && (
            <div className="text-center pt-2">
              <button
                onClick={() => navigate({ to: '/' })}
                className={cn(
                  'text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors',
                  'underline-offset-2 hover:underline'
                )}
              >
                Skip for now — continue without an account
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})
