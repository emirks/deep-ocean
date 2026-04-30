import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './__root'
import { useState } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useGatewaysStore } from '@/stores/gatewaysStore'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { ShieldCheck, Lock, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AppSettings } from '../../types'

// ── GatewayChallenge ─────────────────────────────────────────────────────────

function GatewayChallenge({
  phrase,
  gatewayName,
  onPass,
  onCancel
}: {
  phrase: string
  gatewayName: string
  onPass: () => void
  onCancel: () => void
}) {
  const [input, setInput] = useState('')
  const [error, setError] = useState('')

  const confirm = () => {
    if (input !== phrase) {
      setError('Phrase does not match. Try again.')
      setInput('')
      return
    }
    onPass()
  }

  return (
    <div className="flex flex-col h-full items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 rounded-full bg-purple-500/10 mb-2">
            <ShieldCheck className="h-8 w-8 text-purple-400" />
          </div>
          <h2 className="text-xl font-semibold">Settings protected</h2>
          <p className="text-sm text-muted-foreground">
            Pass the <strong className="text-foreground">{gatewayName}</strong> gateway to access Settings.
          </p>
        </div>

        <div className="rounded-md border border-purple-500/20 bg-purple-500/5 px-4 py-3">
          <p className="text-sm font-medium text-purple-200 leading-relaxed text-center">
            "{phrase}"
          </p>
        </div>

        <div className="space-y-2">
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

        <div className="flex gap-3">
          <Button variant="outline" onClick={onCancel} className="flex-1">
            Go back
          </Button>
          <Button onClick={confirm} className="flex-1">
            Unlock Settings
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── SettingRow ────────────────────────────────────────────────────────────────

function SettingRow({ label, description, children }: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

// ── ServerTimeRow ─────────────────────────────────────────────────────────────

type TimeCheckState = 'idle' | 'loading' | 'ok' | 'drift' | 'error'

function ServerTimeRow() {
  const [state,      setState]      = useState<TimeCheckState>('idle')
  const [offsetMs,   setOffsetMs]   = useState<number | null>(null)
  const [serverTime, setServerTime] = useState<string | null>(null)
  const [errMsg,     setErrMsg]     = useState<string | null>(null)

  const check = async () => {
    setState('loading')
    setOffsetMs(null)
    setServerTime(null)
    setErrMsg(null)
    try {
      const res = await window.api.getServerTime()
      setOffsetMs(res.offsetMs)
      setServerTime(res.serverTime)
      // More than 60 s drift is suspicious
      setState(Math.abs(res.offsetMs) > 60_000 ? 'drift' : 'ok')
    } catch (e: any) {
      setErrMsg(e?.message ?? 'Network error')
      setState('error')
    }
  }

  const fmtOffset = (ms: number) => {
    const abs = Math.abs(ms)
    if (abs < 1000) return `${ms > 0 ? '+' : '-'}${abs}ms`
    const s = (abs / 1000).toFixed(1)
    return `${ms > 0 ? '+' : '-'}${s}s`
  }

  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">Server time check</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Verify your system clock against a reliable time server (worldtimeapi.org).
          A large drift may allow schedule bypasses.
        </p>
        {state === 'ok' && serverTime && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>
              Clock accurate — offset {fmtOffset(offsetMs!)} &nbsp;·&nbsp;
              Server: {new Date(serverTime).toLocaleTimeString()}
            </span>
          </div>
        )}
        {state === 'drift' && serverTime && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-400">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>
              Clock drift detected: {fmtOffset(offsetMs!)} &nbsp;·&nbsp;
              Server: {new Date(serverTime).toLocaleTimeString()}
            </span>
          </div>
        )}
        {state === 'error' && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-red-400">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>Check failed: {errMsg}</span>
          </div>
        )}
      </div>
      <Button
        variant="outline" size="sm"
        onClick={check}
        disabled={state === 'loading'}
        className={cn(
          'flex-shrink-0',
          state === 'ok'    && 'border-emerald-500/40 text-emerald-400',
          state === 'drift' && 'border-amber-500/40 text-amber-400',
          state === 'error' && 'border-red-500/40 text-red-400'
        )}
      >
        {state === 'loading'
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <RefreshCw className="h-4 w-4" />
        }
        <span className="ml-1.5">
          {state === 'idle' || state === 'loading' ? 'Check time' : 'Recheck'}
        </span>
      </Button>
    </div>
  )
}

// ── Settings page ─────────────────────────────────────────────────────────────

function Settings() {
  const settings  = useSettingsStore()
  const { update } = settings
  const gateways  = useGatewaysStore(s => s.gateways)

  // Gateway challenge state — only required once per page visit
  const [unlocked, setUnlocked] = useState(!settings.settingsGatewayId)

  const gatewayDef = settings.settingsGatewayId
    ? gateways.find(g => g.id === settings.settingsGatewayId)
    : null

  // Re-evaluate when settings change (e.g. gateway removed)
  if (!settings.settingsGatewayId && !unlocked) setUnlocked(true)

  const save = async (patch: Partial<AppSettings>) => {
    update(patch)
    await window.api.updateSettings(patch)
  }

  if (!unlocked && gatewayDef) {
    return (
      <div className="flex flex-col h-full">
        <header className="px-6 py-4 border-b border-border">
          <h1 className="text-lg font-semibold">Settings</h1>
          <p className="text-xs text-muted-foreground">App preferences and behaviour</p>
        </header>
        <GatewayChallenge
          phrase={gatewayDef.phrase}
          gatewayName={gatewayDef.name}
          onPass={() => setUnlocked(true)}
          onCancel={() => window.history.back()}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Settings</h1>
          {gatewayDef && (
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400 text-xs px-1.5 py-0.5">
              <Lock className="h-2.5 w-2.5" />
              gated
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">App preferences and behaviour</p>
      </header>

      <div className="flex-1 overflow-auto px-6 py-2">
        <div className="max-w-lg divide-y divide-border">

          <SettingRow
            label="Launch at startup"
            description="Start DeepOcean when you log in (recommended — required for scheduled blocks)"
          >
            <Switch
              checked={settings.launchAtStartup}
              onCheckedChange={v => save({ launchAtStartup: v })}
            />
          </SettingRow>

          <Separator />

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

          <Separator />

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

          <Separator />

          {/* ── Settings gateway ── */}
          <SettingRow
            label="Settings gateway"
            description="Require a gateway phrase before anyone can open Settings. Manage gateways from the Gateways page."
          >
            <Select
              value={settings.settingsGatewayId ?? '__none__'}
              onValueChange={v => save({ settingsGatewayId: v === '__none__' ? null : v })}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="No protection" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No protection</SelectItem>
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

          <Separator />

          {/* ── Server time ── */}
          <ServerTimeRow />

        </div>
      </div>
    </div>
  )
}

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: Settings
})
