import { createRootRoute, Outlet, Link } from '@tanstack/react-router'
import { Waves, LayoutDashboard, PlusCircle, Settings, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEffect, useRef } from 'react'
import { useRulesStore } from '@/stores/rulesStore'
import { useSettingsStore } from '@/stores/settingsStore'

function RootLayout() {
  const setRules    = useRulesStore(s => s.setRules)
  const setSettings = useSettingsStore(s => s.setSettings)
  const syncing     = useRef(false)

  const syncRules = async () => {
    if (syncing.current) return
    syncing.current = true
    try {
      const rules = await window.api.syncRules()
      setRules(rules)
    } catch {
      // Fallback: just fetch stored values without OS reconciliation
      const rules = await window.api.getRules()
      setRules(rules)
    } finally {
      syncing.current = false
    }
  }

  useEffect(() => {
    // Initial load: sync rules with real OS state + load settings
    syncRules()
    window.api.getSettings().then(setSettings)

    // Status events pushed from main process (scheduled blocks, re-blocks, etc.)
    const cleanupStatus = window.api.onStatusUpdate((data: unknown) => {
      const d = data as { id?: string; status?: string; pauseAll?: boolean }
      if (d.id && d.status) {
        useRulesStore.getState().updateStatus(d.id, d.status as never)
      }
    })

    const cleanupTheme = window.api.onThemeChanged((theme: string) => {
      applyTheme(theme)
    })

    // Re-sync when the window regains focus (user may have switched away
    // and blocks may have changed due to scheduled events)
    const onFocus = () => syncRules()
    window.addEventListener('focus', onFocus)

    return () => {
      cleanupStatus()
      cleanupTheme()
      window.removeEventListener('focus', onFocus)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Apply theme whenever settings change
  const theme = useSettingsStore(s => s.theme)
  const loaded = useSettingsStore(s => s.loaded)
  useEffect(() => {
    if (loaded) applyTheme(theme)
  }, [theme, loaded])

  const navItems = [
    { to: '/',          icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/add-rule',  icon: PlusCircle,      label: 'Add Rule'  },
    { to: '/settings',  icon: Settings,        label: 'Settings'  }
  ]

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-border bg-sidebar flex flex-col">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-border">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
            <Waves className="h-4 w-4 text-white" />
          </div>
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

        <div className="px-3 py-4 border-t border-border">
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
            <Shield className="h-3 w-3" />
            <span>DeepOcean v1.1</span>
          </div>
        </div>
      </aside>

      {/* Main content */}
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
