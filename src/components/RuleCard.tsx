import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from './StatusBadge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRulesStore } from '@/stores/rulesStore'
import { Edit2, Folder, Globe, Monitor, Trash2, Lock, Unlock, Loader2, ShieldCheck } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import type { Rule, PhraseGateway } from '../../types'
import { cn } from '@/lib/utils'

interface Props {
  rule: Rule
}

const typeIcon: Record<string, React.ComponentType<{ className?: string }>> = {
  folder:  Folder,
  app:     Monitor,
  website: Globe
}

function nextScheduleText(rule: Rule): string {
  if (!rule.schedules.length) return 'No schedule'
  const now = new Date()
  const today = now.getDay()
  const minutes = now.getHours() * 60 + now.getMinutes()

  for (const s of rule.schedules) {
    const [lh, lm] = s.lockTime.split(':').map(Number)
    const [uh, um] = s.unlockTime.split(':').map(Number)
    const lockMins   = lh * 60 + lm
    const unlockMins = uh * 60 + um
    if (s.days.includes(today)) {
      if (minutes < lockMins)   return `Locks today at ${s.lockTime}`
      if (minutes < unlockMins) return `Unlocks today at ${s.unlockTime}`
    }
  }

  const daysLabel = rule.schedules[0].days
    .map(d => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d])
    .join('–')
  return `${daysLabel}  ${rule.schedules[0].lockTime} – ${rule.schedules[0].unlockTime}`
}

function ruleSubtitle(rule: Rule): string {
  if (rule.type === 'folder') {
    const c = rule.config as { paths?: string[]; path?: string }
    const paths = c.paths ?? (c.path ? [c.path] : [])
    if (paths.length === 0) return ''
    if (paths.length === 1) return paths[0].split(/[\\/]/).pop() ?? paths[0]
    return `${paths.length} folders`
  }
  if (rule.type === 'app') {
    const c = rule.config as { apps?: { exeName: string }[]; exeName?: string }
    const apps = c.apps ?? (c.exeName ? [{ exeName: c.exeName }] : [])
    if (apps.length === 0) return ''
    if (apps.length === 1) return apps[0].exeName
    return `${apps.length} apps`
  }
  if (rule.type === 'website') {
    const c = rule.config as { domains: string[] }
    if (c.domains.length === 0) return ''
    if (c.domains.length === 1) return c.domains[0]
    return `${c.domains.length} domains`
  }
  return ''
}

const isTransitioning = (status: Rule['status']) =>
  status === 'locking' || status === 'unlocking'

export function RuleCard({ rule }: Props) {
  const { removeRule, updateStatus } = useRulesStore()
  const navigate = useNavigate()

  // Gateway dialog state
  const [gatewayOpen, setGatewayOpen] = useState(false)
  const [phraseInput, setPhraseInput] = useState('')
  const [gatewayError, setGatewayError] = useState('')

  const TypeIcon = typeIcon[rule.type] ?? Folder
  const inTransition = isTransitioning(rule.status)

  const doUnlock = async () => {
    updateStatus(rule.id, 'unlocking')
    await window.api.unblockNow(rule.id)
    // status will be pushed via IPC; local update is just optimistic
  }

  const doBlock = async () => {
    updateStatus(rule.id, 'locking')
    await window.api.blockNow(rule.id)
  }

  const handleToggle = async () => {
    if (inTransition) return

    if (rule.status === 'blocked') {
      // Check for gateways before unblocking
      const phraseGateway = rule.gateways?.find(
        (g): g is PhraseGateway => g.type === 'phrase'
      )
      if (phraseGateway) {
        setPhraseInput('')
        setGatewayError('')
        setGatewayOpen(true)
        return
      }
      await doUnlock()
    } else {
      await doBlock()
    }
  }

  const handleGatewayConfirm = async () => {
    const phraseGateway = rule.gateways?.find(
      (g): g is PhraseGateway => g.type === 'phrase'
    )
    if (!phraseGateway) return
    if (phraseInput !== phraseGateway.phrase) {
      setGatewayError('Phrase does not match. Try again.')
      setPhraseInput('')
      return
    }
    setGatewayOpen(false)
    setPhraseInput('')
    setGatewayError('')
    await doUnlock()
  }

  const handleRemove = async () => {
    await window.api.removeRule(rule.id)
    removeRule(rule.id)
  }

  const hasGateways = rule.gateways && rule.gateways.length > 0

  return (
    <>
      <Card className={cn(
        'transition-all border',
        rule.status === 'blocked'   && 'border-red-500/20 bg-red-950/10',
        rule.status === 'unblocked' && 'border-border',
        rule.status === 'locking'   && 'border-orange-500/20 bg-orange-950/10',
        rule.status === 'unlocking' && 'border-blue-500/20 bg-blue-950/10',
        rule.status === 'paused'    && 'border-yellow-500/20 bg-yellow-950/10',
        rule.status === 'error'     && 'border-orange-500/20 bg-orange-950/10'
      )}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex-shrink-0 mt-0.5 p-2 rounded-md bg-muted">
                <TypeIcon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{rule.label}</span>
                  <StatusBadge status={rule.status} />
                  {hasGateways && (
                    <span title="Has gateway — phrase required to unlock">
                      <ShieldCheck className="h-3.5 w-3.5 text-purple-400" />
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{ruleSubtitle(rule)}</p>
                <p className="text-xs text-muted-foreground">{nextScheduleText(rule)}</p>
                {inTransition && (
                  <p className="text-xs text-muted-foreground/60 mt-0.5 flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {rule.status === 'locking' ? 'Applying filesystem lock…' : 'Removing filesystem lock…'}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                disabled={inTransition}
                onClick={handleToggle}
                className={cn(
                  'h-8 text-xs min-w-[96px]',
                  rule.status === 'blocked'
                    ? 'border-green-500/30 text-green-400 hover:bg-green-500/10'
                    : 'border-red-500/30 text-red-400 hover:bg-red-500/10',
                  inTransition && 'opacity-50 cursor-not-allowed'
                )}
              >
                {inTransition ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Working…</>
                ) : rule.status === 'blocked' ? (
                  <><Unlock className="h-3.5 w-3.5 mr-1" /> Unlock</>
                ) : (
                  <><Lock className="h-3.5 w-3.5 mr-1" /> Block</>
                )}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                disabled={inTransition}
                onClick={() => navigate({ to: '/add-rule', search: { editId: rule.id } })}
              >
                <Edit2 className="h-3.5 w-3.5" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                disabled={inTransition}
                onClick={handleRemove}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gateway — phrase confirmation dialog */}
      <Dialog open={gatewayOpen} onOpenChange={open => { if (!open) setGatewayOpen(false) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-purple-400" />
              Gateway — Confirm unlock
            </DialogTitle>
            <DialogDescription>
              This rule requires you to type the confirmation phrase before it can be unlocked.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label>Type the phrase exactly</Label>
            <Input
              autoFocus
              value={phraseInput}
              onChange={e => { setPhraseInput(e.target.value); setGatewayError('') }}
              onKeyDown={e => e.key === 'Enter' && handleGatewayConfirm()}
              placeholder={rule.gateways?.find(g => g.type === 'phrase') ? '…' : ''}
              className={gatewayError ? 'border-red-500' : ''}
            />
            {gatewayError && (
              <p className="text-xs text-red-400">{gatewayError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setGatewayOpen(false)}>Cancel</Button>
            <Button onClick={handleGatewayConfirm}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
