import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger
} from '@/components/ui/tooltip'
import { useRulesStore } from '@/stores/rulesStore'
import { useTargetStatusStore } from '@/stores/targetStatusStore'
import { useGatewaysStore } from '@/stores/gatewaysStore'
import { useCallback } from 'react'
import { Edit2, Folder, Globe, Monitor, Trash2, Loader2, Lock, ShieldCheck } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import type { Rule, GatewayDef, TargetStatus } from '../../types'
import { cn } from '@/lib/utils'

interface Props { rule: Rule }

const typeIcon: Record<string, React.ComponentType<{ className?: string }>> = {
  folder:  Folder,
  app:     Monitor,
  website: Globe
}

// ── helpers ──────────────────────────────────────────────────────────────────

function nextScheduleText(rule: Rule): string {
  if (!rule.schedules.length) return 'No schedule'
  const now     = new Date()
  const today   = now.getDay()
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
    .map(d => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join('–')
  return `${daysLabel}  ${rule.schedules[0].lockTime}–${rule.schedules[0].unlockTime}`
}

/** Dot + label + status text for a single target's live OS state */
function TargetDot({ ts }: { ts: TargetStatus }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className={cn(
        'flex-shrink-0 h-1.5 w-1.5 rounded-full',
        ts.status === 'blocked'   && 'bg-emerald-400',
        ts.status === 'unblocked' && 'bg-muted-foreground/40',
        ts.status === 'error'     && 'bg-orange-400'
      )} />
      <span className="text-xs text-muted-foreground truncate font-mono flex-1">{ts.label}</span>
      <span className={cn(
        'flex-shrink-0 text-xs font-medium',
        ts.status === 'blocked'   && 'text-emerald-400',
        ts.status === 'unblocked' && 'text-muted-foreground/60',
        ts.status === 'error'     && 'text-orange-400'
      )}>
        {ts.status === 'blocked' ? 'locked' : ts.status === 'unblocked' ? 'open' : 'error'}
      </span>
    </div>
  )
}

const isTransitioning = (s: Rule['status']) => s === 'locking' || s === 'unlocking'

// ── component ────────────────────────────────────────────────────────────────

export function RuleCard({ rule }: Props) {
  const { removeRule, setEnabled, updateStatus } = useRulesStore()
  const { statuses, setForRule } = useTargetStatusStore()
  const allGateways = useGatewaysStore(s => s.gateways)
  const targetStatuses = statuses[rule.id] ?? []
  const navigate = useNavigate()

  const [gatewayOpen, setGatewayOpen]   = useState(false)
  const [gatewayIdx,  setGatewayIdx]    = useState(0)
  const [phraseInput, setPhraseInput]   = useState('')
  const [gatewayError, setGatewayError] = useState('')

  const TypeIcon    = typeIcon[rule.type] ?? Folder
  const inTransit   = isTransitioning(rule.status)
  const ruleGateways: GatewayDef[] = (rule.gatewayIds ?? [])
    .map(id => allGateways.find(g => g.id === id))
    .filter((g): g is GatewayDef => !!g)
  const hasGateway  = ruleGateways.length > 0

  /** Immediately refresh the per-target dots after an enable/disable action. */
  const refreshTargets = useCallback(async () => {
    try {
      const all = await window.api.getTargetStatuses()
      if (all[rule.id]) setForRule(rule.id, all[rule.id])
    } catch { /* non-fatal */ }
  }, [rule.id, setForRule])

  // ── actions ────────────────────────────────────────────────────────────────

  const doEnable = async () => {
    setEnabled(rule.id, true)
    await window.api.enableRule(rule.id)
    refreshTargets()
  }

  const doDisable = async () => {
    setEnabled(rule.id, false)
    updateStatus(rule.id, 'unlocking')
    await window.api.disableRule(rule.id)
    refreshTargets()
  }

  const handleDisableClick = () => {
    if (inTransit) return
    if (hasGateway) {
      setPhraseInput('')
      setGatewayError('')
      setGatewayIdx(0)
      setGatewayOpen(true)
    } else {
      doDisable()
    }
  }

  const handleGatewayConfirm = async () => {
    const gw = ruleGateways[gatewayIdx]
    if (!gw) return
    if (phraseInput !== gw.phrase) {
      setGatewayError('Phrase does not match. Try again.')
      setPhraseInput('')
      return
    }
    // Check if there are more gateways to pass
    if (gatewayIdx < ruleGateways.length - 1) {
      setGatewayIdx(g => g + 1)
      setPhraseInput('')
      setGatewayError('')
      return
    }
    // All gateways passed
    setGatewayOpen(false)
    await doDisable()
  }

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  const handleRemove = async () => {
    await window.api.removeRule(rule.id)
    removeRule(rule.id)
  }

  const currentGateway = ruleGateways[gatewayIdx]

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider delayDuration={300}>
      <>
        <Card className={cn(
          'transition-all border',
          rule.enabled  && rule.status === 'blocked'   && 'border-emerald-500/25 bg-emerald-950/10',
          rule.enabled  && rule.status === 'locking'   && 'border-orange-500/25 bg-orange-950/10',
          rule.enabled  && rule.status === 'unlocking' && 'border-blue-500/25 bg-blue-950/10',
          !rule.enabled && 'border-border opacity-75',
          rule.status === 'error' && 'border-orange-500/25 bg-orange-950/10'
        )}>
          <CardContent className="p-4">

            {/* ── Row 1: icon / name+badges / actions ── */}
            <div className="flex items-start justify-between gap-3">

              {/* Left */}
              <div className="flex items-start gap-3 min-w-0">
                <div className="flex-shrink-0 mt-0.5 p-2 rounded-md bg-muted">
                  <TypeIcon className="h-4 w-4 text-muted-foreground" />
                </div>

                <div className="min-w-0 space-y-0.5">
                  {/* Name + enabled badge + gateway badge */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{rule.label}</span>

                    {rule.enabled ? (
                      <Badge variant="outline" className="font-mono text-xs px-2 py-0.5 border-green-500/40 bg-green-500/15 text-green-400">
                        ● ACTIVE
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="font-mono text-xs px-2 py-0.5 border-muted-foreground/25 bg-muted/40 text-muted-foreground">
                        ○ INACTIVE
                      </Badge>
                    )}

                    {hasGateway && (
                      <span
                        title={`Gateway: ${ruleGateways.map(g => g.name).join(', ')}`}
                        className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400 text-xs px-1.5 py-0.5"
                      >
                        <Lock className="h-2.5 w-2.5" />
                        gated
                      </span>
                    )}
                  </div>

                  {/* Schedule */}
                  <p className="text-xs text-muted-foreground">{nextScheduleText(rule)}</p>

                  {/* OS lock transition */}
                  {inTransit && (
                    <p className="text-xs text-muted-foreground/60 flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {rule.status === 'locking' ? 'Applying OS lock…' : 'Removing OS lock…'}
                    </p>
                  )}
                </div>
              </div>

              {/* Right: Enable / Disable button + edit + delete */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {inTransit ? (
                  <Button variant="outline" size="sm" disabled className="h-8 text-xs min-w-[88px] opacity-50">
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Working…
                  </Button>
                ) : rule.enabled ? (
                  <Button
                    variant="outline" size="sm"
                    onClick={handleDisableClick}
                    className="h-8 text-xs min-w-[88px] border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/60 hover:text-foreground"
                  >
                    {hasGateway && <Lock className="h-3 w-3 mr-1 text-purple-400" />}
                    Disable
                  </Button>
                ) : (
                  <Button
                    variant="outline" size="sm"
                    onClick={doEnable}
                    className="h-8 text-xs min-w-[88px] border-green-500/40 text-green-400 hover:bg-green-500/10"
                  >
                    Enable
                  </Button>
                )}

                <Button
                  variant="ghost" size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  disabled={inTransit}
                  onClick={() => navigate({ to: '/add-rule', search: { editId: rule.id } })}
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>

                {/* Delete disabled while rule is active */}
                {rule.enabled ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 text-muted-foreground/30 cursor-not-allowed"
                          disabled
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      Disable the rule before deleting
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Button
                    variant="ghost" size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    disabled={inTransit}
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            {/* ── Row 2: per-target live OS lock dots ── */}
            {targetStatuses.length > 0 && (
              <div className={cn(
                'mt-3 pt-3 border-t border-border/50',
                targetStatuses.length > 3
                  ? 'grid grid-cols-2 gap-y-1.5 gap-x-4'
                  : 'flex flex-col gap-1.5'
              )}>
                {targetStatuses.map((ts, i) => <TargetDot key={i} ts={ts} />)}
              </div>
            )}

          </CardContent>
        </Card>

        {/* ── Gateway phrase dialog ── */}
        <Dialog open={gatewayOpen} onOpenChange={open => { if (!open) setGatewayOpen(false) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-purple-400" />
                Gateway — confirm disable
                {ruleGateways.length > 1 && (
                  <span className="text-xs text-muted-foreground font-normal ml-1">
                    ({gatewayIdx + 1}/{ruleGateways.length})
                  </span>
                )}
              </DialogTitle>
              <DialogDescription>
                Pass the gateway to disable <strong>{rule.label}</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {currentGateway && (
                <>
                  <div className="flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5 text-purple-400" />
                    <p className="text-sm font-medium text-purple-200">{currentGateway.name}</p>
                  </div>
                  <div className="rounded-md border border-purple-500/20 bg-purple-500/5 px-4 py-3 select-none">
                    <p className="text-sm font-medium text-purple-200 leading-relaxed whitespace-pre-wrap break-words" style={{ userSelect: 'none' }}>
                      {currentGateway.phrase}
                    </p>
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Type the phrase exactly · Ctrl+Enter to confirm</Label>
                <textarea
                  autoFocus
                  value={phraseInput}
                  rows={3}
                  onChange={e => { setPhraseInput(e.target.value); setGatewayError('') }}
                  onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleGatewayConfirm() }}
                  onPaste={e => e.preventDefault()}
                  className={`w-full resize-none rounded-md border bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring whitespace-pre-wrap break-words ${gatewayError ? 'border-red-500' : 'border-input'}`}
                />
                {gatewayError && <p className="text-xs text-red-400">{gatewayError}</p>}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setGatewayOpen(false)}>Cancel</Button>
              <Button onClick={handleGatewayConfirm}>
                {gatewayIdx < ruleGateways.length - 1 ? 'Next →' : 'Confirm & Disable'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation */}
        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-destructive" />
                Delete rule?
              </DialogTitle>
              <DialogDescription>
                <span className="font-medium text-foreground">"{rule.label}"</span> will be permanently
                deleted and any active OS blocks it holds will be removed. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={async () => { setDeleteConfirmOpen(false); await handleRemove() }}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    </TooltipProvider>
  )
}
