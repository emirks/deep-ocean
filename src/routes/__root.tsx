import { createRootRoute, Outlet, Link } from '@tanstack/react-router'
import { LayoutDashboard, PlusCircle, Settings, Shield, ShieldCheck } from 'lucide-react'
import logo from '@/assets/logo.png'
import { cn } from '@/lib/utils'
import { useEffect, useRef } from 'react'
import { useRulesStore } from '@/stores/rulesStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useTargetStatusStore } from '@/stores/targetStatusStore'
import { useGatewaysStore } from '@/stores/gatewaysStore'
import { supabase, fetchIsPremium } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { AccountSection } from '@/components/AccountSection'

// Safety-net poll — only runs while the window is visible.
// Real-time updates come from IPC status-update events (see onStatusUpdate below).
const TARGET_POLL_INTERVAL_MS = 8_000

function RootLayout() {
  const setRules    = useRulesStore(s => s.setRules)
  const setSettings = useSettingsStore(s => s.setSettings)
  const setAllTargetStatuses = useTargetStatusStore(s => s.setAll)
  const setGateways = useGatewaysStore(s => s.setGateways)
  const { setSession, setIsPremium, setLoaded, clear } = useAuthStore()

  const syncing       = useRef(false)
  const pollTimer     = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Sync helpers ────────────────────────────────────────────────────────────

  const syncRules = async () => {
    if (syncing.current) return
    syncing.current = true
    try {
      const rules = await window.api.syncRules()
      setRules(rules)
    } catch {
      const rules = await window.api.getRules()
      setRules(rules)
    } finally {
      syncing.current = false
    }
  }

  const syncTargetStatuses = async () => {
    try {
      const all = await window.api.getTargetStatuses()
      setAllTargetStatuses(all)
    } catch { /* non-fatal */ }
  }

  const syncAll = () => {
    syncRules()
    syncTargetStatuses()
  }

  // ── Polling — only while the window is visible ──────────────────────────────

  const startPolling = () => {
    stopPolling()
    pollTimer.current = setInterval(syncTargetStatuses, TARGET_POLL_INTERVAL_MS)
  }

  const stopPolling = () => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current)
      pollTimer.current = null
    }
  }

  // ── Auth bootstrap ──────────────────────────────────────────────────────────

  useEffect(() => {
    // 1. Restore any existing session from localStorage
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        setSession(data.session)
        const premium = await fetchIsPremium(data.session.user.id)
        setIsPremium(premium)
      }
      setLoaded(true)
    })

    // 2. Keep store in sync whenever Supabase auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        setSession(session)
        const premium = await fetchIsPremium(session.user.id)
        setIsPremium(premium)
      } else {
        clear()
      }
    })

    // 3. Handle deepocean://auth/callback forwarded from main process
    //    The deep link URL carries the PKCE code; exchangeCodeForSession resolves it.
    const cleanupDeepLink = window.api.onDeepLink(async (url: string) => {
      console.info('[Auth] Deep link received:', url)
      const { data, error } = await supabase.auth.exchangeCodeForSession(url)
      if (error) {
        console.error('[Auth] exchangeCodeForSession failed:', error.message)
        return
      }
      if (data.session) {
        setSession(data.session)
        const premium = await fetchIsPremium(data.session.user.id)
        setIsPremium(premium)
      }
    })

    return () => {
      subscription.unsubscribe()
      cleanupDeepLink()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Boot & event wiring ─────────────────────────────────────────────────────

  useEffect(() => {
    syncAll()
    window.api.getSettings().then(setSettings)
    window.api.getGateways().then(setGateways)

    // IPC events from main process — immediate dot refresh on any state change
    const cleanupStatus = window.api.onStatusUpdate((data: unknown) => {
      const d = data as { id?: string; status?: string }
      if (d.id && d.status) {
        useRulesStore.getState().updateStatus(d.id, d.status as never)
        syncTargetStatuses()
      }
    })

    const cleanupTheme = window.api.onThemeChanged((theme: string) => {
      applyTheme(theme)
    })

    // Re-sync the moment the window regains focus
    const onFocus = () => syncAll()
    window.addEventListener('focus', onFocus)

    // Start / stop the safety-net poll based on page visibility
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncAll()      // catch anything that changed while hidden
        startPolling()
      } else {
        stopPolling()  // no wasted IPC calls while minimised / hidden
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    // Start polling immediately (window is visible on mount)
    startPolling()

    return () => {
      cleanupStatus()
      cleanupTheme()
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      stopPolling()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Apply theme reactively
  const theme  = useSettingsStore(s => s.theme)
  const loaded = useSettingsStore(s => s.loaded)
  useEffect(() => {
    if (loaded) applyTheme(theme)
  }, [theme, loaded])

  // ── Nav ─────────────────────────────────────────────────────────────────────

  const navItems = [
    { to: '/',          icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/add-rule',  icon: PlusCircle,      label: 'Add Rule'  },
    { to: '/gateways',  icon: ShieldCheck,     label: 'Gateways'  },
    { to: '/settings',  icon: Settings,        label: 'Settings'  }
  ]

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <aside className="w-56 flex-shrink-0 border-r border-border bg-sidebar flex flex-col">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-border">
          <img src={logo} alt="DeepOcean" className="h-8 w-8 rounded-lg object-cover flex-shrink-0" />
          <span className="font-semibold text-sidebar-foreground tracking-tight">DeepOcean</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                '[&.active]:bg-sidebar-accent [&.active]:text-sidebar-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>

        {/* Account section */}
        <AccountSection />

        <div className="px-3 pb-3">
          <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground/50">
            <Shield className="h-3 w-3" />
            <span>DeepOcean v1.2.0</span>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}

function applyTheme(theme: string) {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.remove('light')
  } else if (theme === 'light') {
    root.classList.add('light')
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (prefersDark) root.classList.remove('light')
    else root.classList.add('light')
  }
}

export const rootRoute = createRootRoute({ component: RootLayout })
