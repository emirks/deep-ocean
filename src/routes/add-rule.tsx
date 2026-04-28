import { createRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { rootRoute } from './__root'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { SchedulePicker } from '@/components/SchedulePicker'
import { FolderFields } from '@/components/blockers/FolderFields'
import { AppFields } from '@/components/blockers/AppFields'
import { WebsiteFields } from '@/components/blockers/WebsiteFields'
import { Separator } from '@/components/ui/separator'
import { useRulesStore } from '@/stores/rulesStore'
import { ArrowLeft, Save, ShieldCheck } from 'lucide-react'
import type {
  BlockerType, BlockerConfig, FolderConfig, AppConfig, WebsiteConfig,
  Schedule, Gateway, PhraseGateway
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

  const [label, setLabel]         = useState('')
  const [type, setType]           = useState<BlockerType>('folder')
  const [config, setConfig]       = useState<BlockerConfig>(defaultConfig.folder)
  const [schedules, setSchedules] = useState<Schedule[]>([defaultSchedule()])
  const [gateways, setGateways]   = useState<Gateway[]>([])
  const [saving, setSaving]       = useState(false)
  const [blockerTypes, setBlockerTypes] = useState<{ type: string; label: string }[]>([])

  // Gateway UI state
  const phraseGateway = gateways.find((g): g is PhraseGateway => g.type === 'phrase')
  const phraseEnabled = !!phraseGateway

  useEffect(() => {
    window.api.getBlockerTypes().then(setBlockerTypes)
  }, [])

  useEffect(() => {
    if (existingRule) {
      setLabel(existingRule.label)
      setType(existingRule.type)
      setConfig(existingRule.config)
      setSchedules(existingRule.schedules)
      setGateways(existingRule.gateways ?? [])
    }
  }, [existingRule])

  const handleTypeChange = (t: string) => {
    const bt = t as BlockerType
    setType(bt)
    setConfig({ ...defaultConfig[bt] })
  }

  const togglePhraseGateway = (enabled: boolean) => {
    if (enabled) {
      setGateways(prev => [...prev.filter(g => g.type !== 'phrase'), { type: 'phrase', phrase: '' }])
    } else {
      setGateways(prev => prev.filter(g => g.type !== 'phrase'))
    }
  }

  const updatePhrase = (phrase: string) => {
    setGateways(prev => prev.map(g => g.type === 'phrase' ? { ...g, phrase } : g))
  }

  const handleSave = async () => {
    if (!label.trim()) return
    setSaving(true)
    try {
      if (editId && existingRule) {
        const updated = await window.api.updateRule({ id: editId, label, type, config, schedules, gateways })
        useRulesStore.getState().setRules(
          useRulesStore.getState().rules.map(r => r.id === editId ? updated : r)
        )
      } else {
        const rule = await window.api.addRule({ label, type, config, schedules, gateways })
        addRule(rule)
      }
      navigate({ to: '/' })
    } finally {
      setSaving(false)
    }
  }

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
              <Label>Block type</Label>
              <Select value={type} onValueChange={handleTypeChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type…" />
                </SelectTrigger>
                <SelectContent>
                  {blockerTypes.map(bt => (
                    <SelectItem key={bt.type} value={bt.type}>{bt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {type === 'folder'  && <FolderFields  config={config as FolderConfig}  onChange={c => setConfig(c)} />}
            {type === 'app'     && <AppFields     config={config as AppConfig}     onChange={c => setConfig(c)} />}
            {type === 'website' && <WebsiteFields config={config as WebsiteConfig} onChange={c => setConfig(c)} />}
          </div>

          <Separator />

          {/* ── Schedule ── */}
          <div className="space-y-3">
            <Label>Schedule</Label>
            <SchedulePicker schedules={schedules} onChange={setSchedules} />
          </div>

          <Separator />

          {/* ── Gateways ── */}
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-purple-400" />
                Gateways
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Require extra confirmation before this rule can be manually unlocked.
                Scheduled unlocks bypass gateways.
              </p>
            </div>

            {/* Phrase gateway */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Phrase confirmation</p>
                  <p className="text-xs text-muted-foreground">
                    Must type an exact phrase before unlocking
                  </p>
                </div>
                <Switch
                  checked={phraseEnabled}
                  onCheckedChange={togglePhraseGateway}
                />
              </div>

              {phraseEnabled && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Phrase to type</Label>
                  <Input
                    value={phraseGateway?.phrase ?? ''}
                    onChange={e => updatePhrase(e.target.value)}
                    placeholder="I will be productive"
                    className="text-sm"
                  />
                </div>
              )}
            </div>
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
