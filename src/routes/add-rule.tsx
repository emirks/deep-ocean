import { createRoute, useNavigate, useSearch, Link } from '@tanstack/react-router'
import { rootRoute } from './__root'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { SchedulePicker } from '@/components/SchedulePicker'
import { FolderFields } from '@/components/blockers/FolderFields'
import { AppFields } from '@/components/blockers/AppFields'
import { WebsiteFields } from '@/components/blockers/WebsiteFields'
import { Separator } from '@/components/ui/separator'
import { useRulesStore } from '@/stores/rulesStore'
import { useGatewaysStore } from '@/stores/gatewaysStore'
import { ArrowLeft, Save, ShieldCheck, Lock, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  BlockerType, BlockerConfig, FolderConfig, AppConfig, WebsiteConfig,
  Schedule, Rule
} from '../../types'

const defaultConfig: Record<BlockerType, BlockerConfig> = {
  folder:  { paths: [] } as FolderConfig,
  app:     { apps: [] } as AppConfig,
  website: { domains: [] } as WebsiteConfig
}

const defaultSchedule = (): Schedule => ({
  days: [1, 2, 3, 4, 5],
  lockTime: '09:00',
  unlockTime: '18:00'
})

function AddRule() {
  const navigate = useNavigate()
  const search = useSearch({ from: '/add-rule' })
  const editId = (search as { editId?: string }).editId
  const existingRule = useRulesStore(s => s.rules.find(r => r.id === editId))
  const { addRule } = useRulesStore()
  const gateways = useGatewaysStore(s => s.gateways)

  const isActive = !!existingRule?.enabled

  const [label,      setLabel]      = useState('')
  const [type,       setType]       = useState<BlockerType>('folder')
  const [config,     setConfig]     = useState<BlockerConfig>(defaultConfig.folder)
  const [schedules,  setSchedules]  = useState<Schedule[]>([defaultSchedule()])
  const [gatewayIds, setGatewayIds] = useState<string[]>([])
  const [saving,     setSaving]     = useState(false)
  const [blockerTypes, setBlockerTypes] = useState<{ type: string; label: string }[]>([])

  // Count of targets that existed when the rule was opened — these are locked for active rules
  const [lockedFolderCount,  setLockedFolderCount]  = useState(0)
  const [lockedAppCount,     setLockedAppCount]      = useState(0)
  const [lockedWebDomains,   setLockedWebDomains]    = useState<string[]>([])

  useEffect(() => {
    window.api.getBlockerTypes().then(setBlockerTypes)
  }, [])

  useEffect(() => {
    if (existingRule) {
      setLabel(existingRule.label)
      setType(existingRule.type)
      setConfig(existingRule.config)
      setSchedules(existingRule.schedules)
      setGatewayIds(existingRule.gatewayIds ?? [])

      // Capture locked counts from existing config
      if (existingRule.type === 'folder') {
        setLockedFolderCount((existingRule.config as FolderConfig).paths?.length ?? 0)
      } else if (existingRule.type === 'app') {
        setLockedAppCount((existingRule.config as AppConfig).apps?.length ?? 0)
      } else if (existingRule.type === 'website') {
        setLockedWebDomains((existingRule.config as WebsiteConfig).domains ?? [])
      }
    }
  }, [existingRule])

  const handleTypeChange = (t: string) => {
    if (isActive) return  // type is locked for active rules
    const bt = t as BlockerType
    setType(bt)
    setConfig({ ...defaultConfig[bt] })
  }

  const toggleGateway = (id: string) => {
    if (isActive) return
    setGatewayIds(prev =>
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    )
  }

  const handleSave = async () => {
    if (!label.trim()) return
    setSaving(true)
    try {
      if (editId && existingRule) {
        // Active rules: only update label and config (no schedule/type/gateway changes)
        const patch = isActive
          ? { id: editId, label, config }
          : { id: editId, label, type, config, schedules, gatewayIds }
        const updated = await window.api.updateRule(patch)
        useRulesStore.getState().setRules(
          useRulesStore.getState().rules.map(r => r.id === editId ? updated : r)
        )
      } else {
        const newRule: Omit<Rule, 'id' | 'status' | 'createdAt'> = {
          label, type, config, schedules, gatewayIds,
          enabled: true
        }
        const rule = await window.api.addRule(newRule)
        addRule(rule)
      }
      navigate({ to: '/' })
    } finally {
      setSaving(false)
    }
  }

  const selectedGateways = gateways.filter(g => gatewayIds.includes(g.id))

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-3 px-6 py-4 border-b border-border">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: '/' })}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold">{editId ? 'Edit Rule' : 'Add Rule'}</h1>
          <p className="text-xs text-muted-foreground">Configure what to block, when, and how hard</p>
        </div>
      </header>

      {/* Active-rule lockout banner */}
      {isActive && (
        <div className="mx-6 mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-300">Rule is active — some fields are locked</p>
            <p className="text-xs text-amber-400/80 mt-0.5">
              Schedule, existing targets, and gateway cannot be changed while the rule is enabled.
              You can still rename the rule and add new targets.
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto px-6 py-5">
        <div className="max-w-lg space-y-6">

          {/* ── Name ── */}
          <div className="space-y-2">
            <Label>Rule name</Label>
            <Input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Minecraft, Social Media…"
            />
          </div>

          <Separator />

          {/* ── Block type + fields ── */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className={cn(isActive && 'opacity-50')}>Block type</Label>
              <Select value={type} onValueChange={handleTypeChange} disabled={isActive}>
                <SelectTrigger className={cn(isActive && 'opacity-50 cursor-not-allowed')}>
                  <SelectValue placeholder="Select type…" />
                </SelectTrigger>
                <SelectContent>
                  {blockerTypes.map(bt => (
                    <SelectItem key={bt.type} value={bt.type}>{bt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {type === 'folder' && (
              <FolderFields
                config={config as FolderConfig}
                onChange={c => setConfig(c)}
                existingCount={isActive ? lockedFolderCount : 0}
              />
            )}
            {type === 'app' && (
              <AppFields
                config={config as AppConfig}
                onChange={c => setConfig(c)}
                existingCount={isActive ? lockedAppCount : 0}
              />
            )}
            {type === 'website' && (
              <WebsiteFields
                config={config as WebsiteConfig}
                onChange={c => setConfig(c)}
                lockedDomains={isActive ? lockedWebDomains : []}
              />
            )}
          </div>

          <Separator />

          {/* ── Schedule ── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className={cn(isActive && 'opacity-50')}>Schedule</Label>
              {isActive && <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />}
            </div>
            <SchedulePicker
              schedules={schedules}
              onChange={setSchedules}
              locked={isActive}
            />
          </div>

          <Separator />

          {/* ── Gateways ── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <ShieldCheck className={cn('h-4 w-4', isActive ? 'text-muted-foreground/50' : 'text-purple-400')} />
                Gateway
              </h2>
              {isActive && <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />}
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              A gateway must be passed before this rule can be manually disabled.
              Scheduled unlocks bypass gateways.
              {!isActive && (
                <> &nbsp;
                  <Link to="/gateways" className="text-purple-400 hover:text-purple-300 underline-offset-2 hover:underline">
                    Manage gateways →
                  </Link>
                </>
              )}
            </p>

            {isActive ? (
              /* Read-only display of assigned gateways */
              <div className="space-y-2">
                {selectedGateways.length === 0 ? (
                  <p className="text-xs text-muted-foreground/60 italic">No gateway assigned</p>
                ) : (
                  selectedGateways.map(gw => (
                    <div
                      key={gw.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-purple-500/20 bg-purple-500/5"
                    >
                      <Lock className="h-3.5 w-3.5 text-purple-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-purple-200">{gw.name}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">"{gw.phrase}"</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : gateways.length === 0 ? (
              <div className="rounded-lg border border-border/50 bg-muted/20 p-4 text-center">
                <p className="text-sm text-muted-foreground">No gateways defined yet.</p>
                <Link to="/gateways">
                  <Button variant="link" size="sm" className="text-purple-400 mt-1 h-auto p-0">
                    Create your first gateway →
                  </Button>
                </Link>
              </div>
            ) : (
              /* Selectable gateway cards */
              <div className="space-y-2">
                {gateways.map(gw => {
                  const selected = gatewayIds.includes(gw.id)
                  return (
                    <button
                      key={gw.id}
                      type="button"
                      onClick={() => toggleGateway(gw.id)}
                      className={cn(
                        'w-full text-left flex items-center gap-3 p-3 rounded-lg border transition-colors',
                        selected
                          ? 'border-purple-500/40 bg-purple-500/10'
                          : 'border-border hover:border-border/80 hover:bg-muted/20'
                      )}
                    >
                      <div className={cn(
                        'flex-shrink-0 h-4 w-4 rounded border-2 flex items-center justify-center',
                        selected ? 'border-purple-400 bg-purple-400' : 'border-muted-foreground/40'
                      )}>
                        {selected && (
                          <svg className="h-2.5 w-2.5 text-background" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm font-medium', selected && 'text-purple-200')}>{gw.name}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">"{gw.phrase}"</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      </div>

      <footer className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
        <Button variant="outline" onClick={() => navigate({ to: '/' })}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving || !label.trim()}>
          <Save className="h-4 w-4 mr-1.5" />
          {saving ? 'Saving…' : editId ? 'Update Rule' : 'Save Rule'}
        </Button>
      </footer>
    </div>
  )
}

export const addRuleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/add-rule',
  validateSearch: (search: Record<string, unknown>) => ({
    editId: typeof search.editId === 'string' ? search.editId : undefined
  }),
  component: AddRule
})
