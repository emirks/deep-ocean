import { createRoute, Link } from '@tanstack/react-router'
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
import {
  Popover, PopoverContent, PopoverTrigger
} from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import {
  Lock, Unlock, ShieldCheck, RefreshCw, CheckCircle2,
  AlertCircle, Loader2, Clock, Globe
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AppSettings } from '../../types'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtOffset(ms: number): string {
  const sign = ms >= 0 ? '+' : ''
  const abs  = Math.abs(ms)
  if (abs < 1000) return `${sign}${ms}ms`
  return `${sign}${(ms / 1000).toFixed(1)}s`
}

function fmtAgo(isoStr: string): string {
  const secs = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000)
  if (secs < 60)   return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return `${Math.floor(secs / 3600)}h ago`
}

/** "Europe/Istanbul" → "Europe / Istanbul" for display */
function formatTz(tz: string): string {
  return tz.replace(/_/g, ' ')
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

interface SyncResult {
  serverTime: string
  offsetMs:   number
  timezone:   string
  source?:    string
  error?:     string
}

function ServerTimeRow({ disabled }: { disabled: boolean }) {
  const { useServerTime, update } = useSettingsStore()

  const [syncing,    setSyncing]    = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [lastSynced, setLastSynced] = useState<string | null>(null)
  // null  = not yet detected from server (show "detecting…")
  // ''    = detection failed (show "detection failed")
  // 'X/Y' = server-detected IANA timezone from IP
  const [timezone,   setTimezone]   = useState<string | null>(null)

  // On mount, load the last server-synced timezone from the main process cache
  useEffect(() => {
    window.api.getTimeStatus()
      .then(s => {
        if (s.lastSynced) setLastSynced(s.lastSynced)
        // Only accept a value that came from an actual server sync (not the Intl fallback)
        if (s.timezone) setTimezone(s.timezone)
        else             setTimezone(null)  // not yet synced from server
        console.debug('[Settings] Time status:', s)
      })
      .catch(e => {
        console.warn('[Settings] getTimeStatus failed:', e)
        setTimezone(null)
      })
  }, [])

  const save = async (patch: Partial<AppSettings>) => {
    update(patch)
    await window.api.updateSettings(patch)
    console.info('[Settings] Saved:', patch)
  }

  const syncNow = async () => {
    console.info('[Settings] Manual server time sync requested')
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await window.api.getServerTime()
      console.info('[Settings] Sync result:', res)
      setSyncResult({
        serverTime: res.serverTime,
        offsetMs:   res.offsetMs,
        timezone:   res.timezone,
        source:     res.source
      })
      setTimezone(res.timezone)
      setLastSynced(new Date().toISOString())
    } catch (e: any) {
      console.error('[Settings] Sync error:', e)
      setTimezone('')   // mark as "detection failed"
      setSyncResult({ serverTime: '', offsetMs: 0, timezone: '', error: e?.message ?? 'Network error' })
    } finally {
      setSyncing(false)
    }
  }

  const hasDrift = syncResult && !syncResult.error && Math.abs(syncResult.offsetMs) > 60_000
  // null = not yet synced, '' = detection failed, 'X/Y' = server-detected
  const displayTz  = syncResult?.timezone || timezone

  return (
    <div className={cn('py-3.5 space-y-3', disabled && 'opacity-40 select-none pointer-events-none')}>
      {/* Toggle row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Use server time for schedules</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Timezone is detected from your IP (server-side, not from Windows settings).
            Schedule checks use server time — prevents bypassing locks by rolling back
            the system clock or changing the timezone. Syncs at startup and every 30 min.
          </p>
        </div>
        <Switch
          checked={useServerTime}
          onCheckedChange={v => save({ useServerTime: v })}
          disabled={disabled}
        />
      </div>

      {/* Timezone + sync status (always shown so user knows what timezone is detected) */}
      <div className={cn(
        'rounded-md border border-border/50 bg-muted/20 p-3 space-y-2',
        !useServerTime && 'opacity-60'
      )}>
        {/* Timezone — null=pending, ''=failed, 'X/Y'=detected */}
        <div className="flex items-center gap-2 text-xs">
          <Globe className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-muted-foreground">IP-detected timezone:</span>
          {displayTz === null && (
            <span className="text-muted-foreground italic flex items-center gap-1">
              {syncing
                ? <><Loader2 className="h-3 w-3 animate-spin" /> detecting…</>
                : 'sync to detect'
              }
            </span>
          )}
          {displayTz === '' && (
            <span className="text-red-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> detection failed
            </span>
          )}
          {displayTz && (
            <span className="font-medium">{formatTz(displayTz)}</span>
          )}
        </div>

        {/* Sync status */}
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0 text-xs">
            {!syncResult && lastSynced && (
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                Last synced {fmtAgo(lastSynced)}
              </span>
            )}
            {!syncResult && !lastSynced && useServerTime && (
              <span className="text-muted-foreground">Not yet synced this session</span>
            )}
            {syncResult && !syncResult.error && (
              <span className={cn(
                'flex items-center gap-1.5',
                hasDrift ? 'text-amber-400' : 'text-emerald-400'
              )}>
                {hasDrift
                  ? <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  : <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                }
                <span>
                  {hasDrift ? 'Clock drift detected' : 'Clock accurate'}
                  {' · drift '}{fmtOffset(syncResult.offsetMs)}
                  {' · '}
                  {/* Show server time in the IP-detected timezone, not Windows timezone */}
                  {syncResult.timezone
                    ? new Date(syncResult.serverTime).toLocaleTimeString('en-US', {
                        timeZone: syncResult.timezone,
                        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
                      })
                    : new Date(syncResult.serverTime).toLocaleTimeString()
                  }
                  {syncResult.source && (
                    <span className="text-muted-foreground/60"> · {syncResult.source}</span>
                  )}
                </span>
              </span>
            )}
            {syncResult?.error && (
              <span className="text-red-400 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                Sync failed: {syncResult.error}
              </span>
            )}
          </div>

          {useServerTime && (
            <Button
              variant="outline" size="sm"
              onClick={syncNow}
              disabled={syncing || disabled}
              className={cn(
                'h-7 text-xs flex-shrink-0',
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
          )}
        </div>
      </div>
    </div>
  )
}

// ── GatewayDialog (phrase challenge) ─────────────────────────────────────────

function GatewayDialog({
  open, onOpenChange, phrase, gatewayName, onPass
}: {
  open:           boolean
  onOpenChange:   (v: boolean) => void
  phrase:         string
  gatewayName:    string
  onPass:         () => void
}) {
  const [input, setInput] = useState('')
  const [error, setError] = useState('')

  const confirm = () => {
    if (input !== phrase) {
      console.warn('[Settings] Gateway phrase mismatch for:', gatewayName)
      setError('Phrase does not match. Try again.')
      setInput('')
      return
    }
    console.info('[Settings] Gateway passed:', gatewayName)
    setInput(''); setError('')
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
            Pass the <strong className="text-foreground">{gatewayName}</strong> gateway
            to edit the protected settings.
          </p>
          <div className="rounded-md border border-purple-500/20 bg-purple-500/5 px-4 py-3 select-none">
            <p className="text-sm font-medium text-purple-200" style={{ userSelect: 'none' }}>"{phrase}"</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Type the phrase exactly</Label>
            <Input
              autoFocus
              value={input}
              onChange={e => { setInput(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && confirm()}
              onPaste={e => e.preventDefault()}
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

// ── LockButton — gateway picker + lock/unlock control ────────────────────────
//
// Single control point for the entire lock lifecycle:
//   • Unlocked, no gateway  → "🔒 Lock" → popover picks gateway → assigns + locks
//   • Unlocked, has gateway → "🔒 Lock" → popover picks same/different or removes
//   • Locked                → "🔓 Unlock" → gateway phrase dialog → unlocks

function LockButton({
  sectionLocked,
  gatewayDef,
  onLockWith,
  onRemoveLock,
  onUnlockRequest
}: {
  sectionLocked:   boolean
  gatewayDef:      { id: string; name: string; phrase: string } | null
  onLockWith:      (gwId: string) => void
  onRemoveLock:    () => void
  onUnlockRequest: () => void
}) {
  const gateways           = useGatewaysStore(s => s.gateways)
  const [popoverOpen, setPopoverOpen] = useState(false)

  if (sectionLocked) {
    return (
      <Button
        variant="ghost" size="sm"
        onClick={onUnlockRequest}
        className="h-7 px-2 text-xs gap-1.5 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
      >
        <Unlock className="h-3.5 w-3.5" />
        Unlock
      </Button>
    )
  }

  // Unlocked — show the gateway picker popover
  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost" size="sm"
          className={cn(
            'h-7 px-2 text-xs gap-1.5',
            gatewayDef
              ? 'text-purple-400 hover:text-purple-300 hover:bg-purple-500/10'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Lock className="h-3.5 w-3.5" />
          Lock
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-60 p-1.5">
        <p className="text-xs text-muted-foreground px-2 py-1 font-semibold uppercase tracking-wide">
          Lock with gateway
        </p>

        {gateways.length === 0 ? (
          <div className="px-2 py-3 text-xs text-muted-foreground space-y-1">
            <p>No gateways defined yet.</p>
            <Link to="/gateways" onClick={() => setPopoverOpen(false)}>
              <span className="text-purple-400 hover:text-purple-300 underline-offset-2 hover:underline">
                Create a gateway →
              </span>
            </Link>
          </div>
        ) : (
          gateways.map(gw => (
            <button
              key={gw.id}
              onClick={() => { onLockWith(gw.id); setPopoverOpen(false) }}
              className={cn(
                'w-full text-left px-2 py-2 rounded-md flex items-start gap-2.5 transition-colors',
                'hover:bg-muted/80',
                gw.id === gatewayDef?.id && 'bg-purple-500/10'
              )}
            >
              <Lock className={cn(
                'h-3.5 w-3.5 mt-0.5 flex-shrink-0',
                gw.id === gatewayDef?.id ? 'text-purple-400' : 'text-muted-foreground/60'
              )} />
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'text-sm font-medium',
                  gw.id === gatewayDef?.id && 'text-purple-200'
                )}>
                  {gw.name}
                  {gw.id === gatewayDef?.id && (
                    <span className="text-xs text-purple-400/70 font-normal ml-1.5">· current</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground truncate font-mono">"{gw.phrase}"</p>
              </div>
            </button>
          ))
        )}

        {/* Remove lock option — only when a gateway is currently assigned */}
        {gatewayDef && (
          <>
            <div className="border-t border-border/50 my-1" />
            <button
              onClick={() => { onRemoveLock(); setPopoverOpen(false) }}
              className="w-full text-left px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
            >
              Remove lock
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ── Settings page ─────────────────────────────────────────────────────────────

function Settings() {
  const { update, settingsUnlocked, setUnlocked, ...settings } = useSettingsStore()
  const gateways = useGatewaysStore(s => s.gateways)

  // Single source of truth:
  //   settings.settingsGatewayId (persisted in electron-store) = which gateway is assigned
  //   settingsUnlocked (in-memory Zustand)                     = current session lock state
  const gatewayDef = settings.settingsGatewayId
    ? gateways.find(g => g.id === settings.settingsGatewayId) ?? null
    : null

  const sectionLocked = !!gatewayDef && !settingsUnlocked

  const [challengeOpen, setChallengeOpen] = useState(false)

  // If the assigned gateway is removed from the gateways list, auto-unlock
  useEffect(() => {
    if (settings.settingsGatewayId && !gatewayDef) {
      console.info('[Settings] Assigned gateway no longer exists — unlocking section')
      setUnlocked(true)
    }
  }, [gatewayDef, settings.settingsGatewayId, setUnlocked])

  const save = async (patch: Partial<AppSettings>) => {
    update(patch)
    await window.api.updateSettings(patch)
    console.info('[Settings] Saved:', patch)
  }

  // Called when user picks a gateway from the Lock popover
  const handleLockWith = async (gwId: string) => {
    const gw = gateways.find(g => g.id === gwId)
    console.info('[Settings] Locking with gateway:', gw?.name)
    await save({ settingsGatewayId: gwId })
    setUnlocked(false)
  }

  // Called when user clicks "Remove lock" in the Lock popover
  const handleRemoveLock = async () => {
    console.info('[Settings] Removing settings lock')
    await save({ settingsGatewayId: null })
    setUnlocked(true)
  }

  console.debug(
    '[Settings] Render — sectionLocked:', sectionLocked,
    '| gateway:', gatewayDef?.name ?? 'none',
    '| sessionUnlocked:', settingsUnlocked
  )

  return (
    <>
      <div className="flex flex-col h-full">
        <header className="px-6 py-4 border-b border-border">
          <h1 className="text-lg font-semibold">Settings</h1>
          <p className="text-xs text-muted-foreground">App preferences and behaviour</p>
        </header>

        <div className="flex-1 overflow-auto px-6 py-5">
          <div className="max-w-lg space-y-5">

            {/* ── General settings (always accessible) ── */}
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
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
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
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">System</SelectItem>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
            </div>

            <Separator />

            {/* ── Protected section (bottom of page) ── */}
            <div className={cn(
              'rounded-lg border p-4 space-y-1 transition-colors',
              sectionLocked
                ? 'border-amber-500/30 bg-amber-500/5'
                : gatewayDef
                  ? 'border-purple-500/30 bg-purple-500/5'
                  : 'border-border bg-muted/10'
            )}>
              {/* Section header */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {sectionLocked
                    ? <Lock className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
                    : <ShieldCheck className={cn(
                        'h-3.5 w-3.5 flex-shrink-0',
                        gatewayDef ? 'text-purple-400' : 'text-muted-foreground/50'
                      )} />
                  }
                  <div className="min-w-0">
                    <span className={cn(
                      'text-xs font-semibold tracking-wide uppercase',
                      sectionLocked ? 'text-amber-300' : 'text-muted-foreground'
                    )}>
                      Protected settings
                    </span>
                    {sectionLocked && (
                      <span className="text-xs text-amber-400/70 ml-1.5 normal-case font-normal">
                        · locked by {gatewayDef?.name}
                      </span>
                    )}
                    {!sectionLocked && gatewayDef && (
                      <span className="text-xs text-purple-400/60 ml-1.5 normal-case font-normal">
                        · unlocked
                      </span>
                    )}
                    {!gatewayDef && (
                      <span className="text-xs text-muted-foreground/50 ml-1.5 normal-case font-normal">
                        · click Lock to protect
                      </span>
                    )}
                  </div>
                </div>

                {/* The single control: LockButton owns all gateway assignment logic */}
                <LockButton
                  sectionLocked={sectionLocked}
                  gatewayDef={gatewayDef}
                  onLockWith={handleLockWith}
                  onRemoveLock={handleRemoveLock}
                  onUnlockRequest={() => setChallengeOpen(true)}
                />
              </div>

              {/* Protected settings content */}
              <div className="divide-y divide-border/50">
                <SettingRow
                  label="Launch at startup"
                  description="Start DeepOcean when you log in (required for scheduled blocks)"
                  disabled={sectionLocked}
                >
                  <Switch
                    checked={settings.launchAtStartup}
                    onCheckedChange={v => save({ launchAtStartup: v })}
                    disabled={sectionLocked}
                  />
                </SettingRow>

                <ServerTimeRow disabled={sectionLocked} />
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Gateway phrase challenge */}
      {gatewayDef && (
        <GatewayDialog
          open={challengeOpen}
          onOpenChange={setChallengeOpen}
          phrase={gatewayDef.phrase}
          gatewayName={gatewayDef.name}
          onPass={() => {
            setUnlocked(true)
            console.info('[Settings] Protected section unlocked for this session')
          }}
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
