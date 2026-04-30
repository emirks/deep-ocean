import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './__root'
import { useState, useEffect } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useGatewaysStore } from '@/stores/gatewaysStore'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import {
  Lock, Unlock, ShieldCheck, RefreshCw, CheckCircle2, AlertCircle, Loader2, Clock
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AppSettings } from '../../types'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtOffset(ms: number): string {
  const abs = Math.abs(ms)
  if (abs < 1000) return `${ms >= 0 ? '+' : ''}${ms}ms`
  return `${ms >= 0 ? '+' : ''}${(ms / 1000).toFixed(1)}s`
}

function fmtAgo(isoStr: string): string {
  const secs = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000)
  if (secs < 60)  return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return `${Math.floor(secs / 3600)}h ago`
}

// ── SettingRow ────────────────────────────────────────────────────────────────

function SettingRow({
  label, description, disabled = false, children
}: {
  label: string
  description?: string
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={cn(
      'flex items-center justify-between gap-4 py-3.5',
      disabled && 'opacity-40 select-none'
    )}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className={cn('flex-shrink-0', disabled && 'pointer-events-none')}>
        {children}
      </div>
    </div>
  )
}

// ── ServerTimeRow ─────────────────────────────────────────────────────────────

function ServerTimeRow({ disabled }: { disabled: boolean }) {
  const settings = useSettingsStore()
  const { update } = settings

  const [syncing,    setSyncing]    = useState(false)
  const [syncResult, setSyncResult] = useState<{
    serverTime: string; offsetMs: number; error?: string
  } | null>(null)
  const [lastSynced, setLastSynced] = useState<string | null>(null)

  // Load cached status on mount
  useEffect(() => {
    window.api.getTimeStatus().then(s => {
      if (s.lastSynced) setLastSynced(s.lastSynced)
    }).catch(() => {})
  }, [])

  const save = async (patch: Partial<AppSettings>) => {
    update(patch)
    await window.api.updateSettings(patch)
  }

  const syncNow = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await window.api.getServerTime()
      setSyncResult({ serverTime: res.serverTime, offsetMs: res.offsetMs })
      setLastSynced(new Date().toISOString())
    } catch (e: any) {
      setSyncResult({ serverTime: '', offsetMs: 0, error: e?.message ?? 'Network error' })
    } finally {
      setSyncing(false)
    }
  }

  const hasDrift = syncResult && !syncResult.error && Math.abs(syncResult.offsetMs) > 60_000

  return (
    <div className={cn('py-3.5 space-y-3', disabled && 'opacity-40 select-none pointer-events-none')}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Use server time for schedules</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            When on, schedule lock/unlock times are checked against a reliable server clock
            (via google.com) — prevents bypassing locks by rolling back the system clock.
          </p>
        </div>
        <Switch
          checked={settings.useServerTime}
          onCheckedChange={v => save({ useServerTime: v })}
          disabled={disabled}
        />
      </div>

      {settings.useServerTime && (
        <div className="pl-0 space-y-2">
          {/* Last synced status */}
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              {lastSynced && !syncResult && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  Last synced {fmtAgo(lastSynced)}
                </p>
              )}
              {syncResult && !syncResult.error && (
                <p className={cn(
                  'text-xs flex items-center gap-1.5',
                  hasDrift ? 'text-amber-400' : 'text-emerald-400'
                )}>
                  {hasDrift
                    ? <AlertCircle className="h-3.5 w-3.5" />
                    : <CheckCircle2 className="h-3.5 w-3.5" />
                  }
                  {hasDrift
                    ? `Clock drift: ${fmtOffset(syncResult.offsetMs)}`
                    : `Synced — offset ${fmtOffset(syncResult.offsetMs)}`
                  }
                  &nbsp;·&nbsp;
                  Server: {new Date(syncResult.serverTime).toLocaleTimeString()}
                </p>
              )}
              {syncResult?.error && (
                <p className="text-xs text-red-400 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Sync failed: {syncResult.error}
                </p>
              )}
            </div>

            <Button
              variant="outline" size="sm"
              onClick={syncNow}
              disabled={syncing || disabled}
              className={cn(
                'h-7 text-xs',
                syncResult && !syncResult.error && !hasDrift && 'border-emerald-500/40 text-emerald-400',
                hasDrift && 'border-amber-500/40 text-amber-400',
                syncResult?.error && 'border-red-500/40 text-red-400'
              )}
            >
              {syncing
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <RefreshCw className="h-3.5 w-3.5" />
              }
              <span className="ml-1.5">{syncResult ? 'Resync' : 'Sync now'}</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── GatewayDialog (inline challenge) ─────────────────────────────────────────

function GatewayDialog({
  open,
  onOpenChange,
  phrase,
  gatewayName,
  onPass
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  phrase: string
  gatewayName: string
  onPass: () => void
}) {
  const [input, setInput] = useState('')
  const [error, setError] = useState('')

  const confirm = () => {
    if (input !== phrase) {
      setError('Phrase does not match. Try again.')
      setInput('')
      return
    }
    setInput('')
    setError('')
    onOpenChange(false)
    onPass()
  }

  const handleOpen = (v: boolean) => {
    if (!v) { setInput(''); setError('') }
    onOpenChange(v)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-purple-400" />
            Unlock protected settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Pass the <strong className="text-foreground">{gatewayName}</strong> gateway to edit these settings.
          </p>
          <div className="rounded-md border border-purple-500/20 bg-purple-500/5 px-4 py-3">
            <p className="text-sm font-medium text-purple-200 leading-relaxed">"{phrase}"</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Type the phrase exactly</Label>
            <Input
              autoFocus
              value={input}
              onChange={e => { setInput(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && confirm()}
              className={error ? 'border-red-500' : ''}
              placeholder="Type here…"
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpen(false)}>Cancel</Button>
          <Button onClick={confirm}>Unlock</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Settings page ─────────────────────────────────────────────────────────────

function Settings() {
  const settings  = useSettingsStore()
  const { update } = settings
  const gateways  = useGatewaysStore(s => s.gateways)

  const gatewayDef = settings.settingsGatewayId
    ? gateways.find(g => g.id === settings.settingsGatewayId) ?? null
    : null

  // The protected section starts locked if a gateway is assigned.
  // Once unlocked for this visit, stays unlocked until the user manually re-locks or navigates away.
  const [sectionLocked,   setSectionLocked]   = useState(!!gatewayDef)
  const [challengeOpen,   setChallengeOpen]   = useState(false)

  // If the gateway is removed externally, auto-unlock the section
  useEffect(() => {
    if (!gatewayDef) setSectionLocked(false)
  }, [gatewayDef])

  // If a new gateway is assigned while settings is open, re-lock the section
  useEffect(() => {
    if (gatewayDef) setSectionLocked(true)
  }, [settings.settingsGatewayId])

  const save = async (patch: Partial<AppSettings>) => {
    update(patch)
    await window.api.updateSettings(patch)
  }

  const handleLockClick = () => {
    if (sectionLocked) {
      // Need to pass gateway to unlock
      setChallengeOpen(true)
    } else {
      // Re-lock the section
      setSectionLocked(true)
    }
  }

  return (
    <>
      <div className="flex flex-col h-full">
        <header className="px-6 py-4 border-b border-border">
          <h1 className="text-lg font-semibold">Settings</h1>
          <p className="text-xs text-muted-foreground">App preferences and behaviour</p>
        </header>

        <div className="flex-1 overflow-auto px-6 py-5">
          <div className="max-w-lg space-y-5">

            {/* ── Protected section ─────────────────────────────────────────── */}
            <div className={cn(
              'rounded-lg border p-4 space-y-1 transition-colors',
              gatewayDef && sectionLocked
                ? 'border-amber-500/30 bg-amber-500/5'
                : gatewayDef
                  ? 'border-purple-500/30 bg-purple-500/5'
                  : 'border-border bg-muted/10'
            )}>
              {/* Section header */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {gatewayDef && sectionLocked
                    ? <Lock className="h-3.5 w-3.5 text-amber-400" />
                    : <ShieldCheck className={cn('h-3.5 w-3.5', gatewayDef ? 'text-purple-400' : 'text-muted-foreground/60')} />
                  }
                  <span className={cn(
                    'text-xs font-semibold tracking-wide uppercase',
                    gatewayDef && sectionLocked ? 'text-amber-300' : 'text-muted-foreground'
                  )}>
                    Protected settings
                  </span>
                  {gatewayDef && sectionLocked && (
                    <span className="text-xs text-amber-400/70">· {gatewayDef.name}</span>
                  )}
                </div>

                {/* Lock / unlock button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLockClick}
                  className={cn(
                    'h-7 px-2 text-xs gap-1.5',
                    gatewayDef && sectionLocked
                      ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {gatewayDef && sectionLocked
                    ? <><Unlock className="h-3.5 w-3.5" /> Unlock</>
                    : gatewayDef
                      ? <><Lock className="h-3.5 w-3.5" /> Lock</>
                      : null
                  }
                </Button>
              </div>

              {/* Locked content */}
              <div className="divide-y divide-border/50">
                <SettingRow
                  label="Launch at startup"
                  description="Start DeepOcean when you log in (required for scheduled blocks)"
                  disabled={!!(gatewayDef && sectionLocked)}
                >
                  <Switch
                    checked={settings.launchAtStartup}
                    onCheckedChange={v => save({ launchAtStartup: v })}
                    disabled={!!(gatewayDef && sectionLocked)}
                  />
                </SettingRow>

                <ServerTimeRow disabled={!!(gatewayDef && sectionLocked)} />
              </div>
            </div>

            <Separator />

            {/* ── General settings ──────────────────────────────────────────── */}
            <div className="divide-y divide-border">
              <SettingRow
                label="Notifications"
                description="Show a notification when a rule locks or unlocks"
              >
                <Switch
                  checked={settings.notifications}
                  onCheckedChange={v => save({ notifications: v })}
                />
              </SettingRow>

              <SettingRow
                label="Pre-lock warning"
                description="Send a notification N minutes before a scheduled lock fires"
              >
                <Select
                  value={String(settings.preNotificationMinutes)}
                  onValueChange={v => save({ preNotificationMinutes: Number(v) })}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Off</SelectItem>
                    <SelectItem value="5">5 minutes</SelectItem>
                    <SelectItem value="10">10 minutes</SelectItem>
                    <SelectItem value="15">15 minutes</SelectItem>
                    <SelectItem value="30">30 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>

              <SettingRow
                label="Theme"
                description="Light, dark, or follow system preference"
              >
                <Select
                  value={settings.theme}
                  onValueChange={v => save({ theme: v as AppSettings['theme'] })}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">System</SelectItem>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
            </div>

            <Separator />

            {/* ── Protected-section gateway selector ────────────────────────── */}
            <SettingRow
              label="Lock protected settings with gateway"
              description="Choose a gateway to protect the section above. When set, a phrase must be typed before those settings can be changed."
            >
              <Select
                value={settings.settingsGatewayId ?? '__none__'}
                onValueChange={v => save({ settingsGatewayId: v === '__none__' ? null : v })}
              >
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="No lock" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No lock</SelectItem>
                  {gateways.map(g => (
                    <SelectItem key={g.id} value={g.id}>
                      <span className="flex items-center gap-1.5">
                        <Lock className="h-3 w-3 text-purple-400" />
                        {g.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>

          </div>
        </div>
      </div>

      {/* Gateway challenge dialog */}
      {gatewayDef && (
        <GatewayDialog
          open={challengeOpen}
          onOpenChange={setChallengeOpen}
          phrase={gatewayDef.phrase}
          gatewayName={gatewayDef.name}
          onPass={() => setSectionLocked(false)}
        />
      )}
    </>
  )
}

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: Settings
})
