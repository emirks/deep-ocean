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
import { useTargetStatusStore } from '@/stores/targetStatusStore'
import {
  Edit2, Folder, Globe, Monitor, Trash2, Loader2, Lock, ShieldCheck
} from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import type { Rule, PhraseGateway, TargetStatus } from '../../types'
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

/** Dot indicator for a single target's live OS state */
function TargetDot({ ts }: { ts: TargetStatus }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className={cn(
        'flex-shrink-0 h-1.5 w-1.5 rounded-full',
        ts.status === 'blocked'   && 'bg-red-400',
        ts.status === 'unblocked' && 'bg-emerald-400',
        ts.status === 'error'     && 'bg-orange-400'
      )} />
      <span className="text-xs text-muted-foreground truncate font-mono">{ts.label}</span>
    </div>
  )
}

const isTransitioning = (s: Rule['status']) => s === 'locking' || s === 'unlocking'
const isActive        = (s: Rule['status']) => s === 'blocked'

// ── component ────────────────────────────────────────────────────────────────

export function RuleCard({ rule }: Props) {
  const { removeRule, updateStatus } = useRulesStore()
  const targetStatuses = useTargetStatusStore(s => s.statuses[rule.id] ?? [])
  const navigate = useNavigate()

  const [gatewayOpen, setGatewayOpen] = useState(false)
  const [phraseInput, setPhraseInput] = useState('')
  const [gatewayError, setGatewayError] = useState('')

  const TypeIcon    = typeIcon[rule.type] ?? Folder
  const inTransit   = isTransitioning(rule.status)
  const active      = isActive(rule.status)
  const hasGateway  = rule.gateways && rule.gateways.length > 0
  const phraseGw    = rule.gateways?.find((g): g is PhraseGateway => g.type === 'phrase')

  // ── actions ────────────────────────────────────────────────────────────────

  const doActivate = async () => {
    updateStatus(rule.id, 'locking')
    await window.api.blockNow(rule.id)
  }

  const doDeactivate = async () => {
    updateStatus(rule.id, 'unlocking')
    await window.api.unblockNow(rule.id)
  }

  const handleDeactivateClick = () => {
    if (inTransit) return
    if (hasGateway && phraseGw) {
      setPhraseInput('')
      setGatewayError('')
      setGatewayOpen(true)
    } else {
      doDeactivate()
    }
  }

  const handleGatewayConfirm = async () => {
    if (!phraseGw) return
    if (phraseInput !== phraseGw.phrase) {
      setGatewayError('Phrase does not match. Try again.')
      setPhraseInput('')
      return
    }
    setGatewayOpen(false)
    await doDeactivate()
  }

  const handleRemove = async () => {
    await window.api.removeRule(rule.id)
    removeRule(rule.id)
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <Card className={cn(
        'transition-all border',
        rule.status === 'blocked'   && 'border-red-500/25 bg-red-950/10',
        rule.status === 'unblocked' && 'border-border',
        rule.status === 'locking'   && 'border-orange-500/25 bg-orange-950/10',
        rule.status === 'unlocking' && 'border-blue-500/25 bg-blue-950/10',
        rule.status === 'error'     && 'border-orange-500/25 bg-orange-950/10'
      )}>
        <CardContent className="p-4">

          {/* ── Row 1: icon / name+badges / action buttons ── */}
          <div className="flex items-start justify-between gap-3">

            {/* Left */}
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex-shrink-0 mt-0.5 p-2 rounded-md bg-muted">
                <TypeIcon className="h-4 w-4 text-muted-foreground" />
              </div>

              <div className="min-w-0 space-y-0.5">
                {/* Name + status badge + gateway lock */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{rule.label}</span>
                  <StatusBadge status={rule.status} />
                  {hasGateway && (
                    <span
                      title="Gateway active — phrase required to deactivate"
                      className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400 text-xs px-1.5 py-0.5"
                    >
                      <Lock className="h-2.5 w-2.5" />
                      gated
                    </span>
                  )}
                </div>

                {/* Schedule line */}
                <p className="text-xs text-muted-foreground">{nextScheduleText(rule)}</p>

                {/* Transition progress */}
                {inTransit && (
                  <p className="text-xs text-muted-foreground/60 flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {rule.status === 'locking' ? 'Applying OS lock…' : 'Removing OS lock…'}
                  </p>
                )}
              </div>
            </div>

            {/* Right: action buttons */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {inTransit ? (
                <Button variant="outline" size="sm" disabled className="h-8 text-xs min-w-[96px] opacity-50">
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Working…
                </Button>
              ) : active ? (
                /* Deactivate — subdued, gated if needed */
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeactivateClick}
                  className="h-8 text-xs min-w-[96px] border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/60 hover:text-foreground"
                >
                  {hasGateway && <Lock className="h-3 w-3 mr-1 text-purple-400" />}
                  Deactivate
                </Button>
              ) : (
                /* Activate — prominent red, applies the block */
                <Button
                  variant="outline"
                  size="sm"
                  onClick={doActivate}
                  className="h-8 text-xs min-w-[96px] border-red-500/40 text-red-400 hover:bg-red-500/10"
                >
                  Activate
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

              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                disabled={inTransit}
                onClick={handleRemove}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* ── Row 2: per-target live status dots ── */}
          {targetStatuses.length > 0 && (
            <div className={cn(
              'mt-3 pt-3 border-t border-border/50',
              targetStatuses.length > 3 ? 'grid grid-cols-2 gap-y-1.5 gap-x-4' : 'flex flex-col gap-1.5'
            )}>
              {targetStatuses.map((ts, i) => (
                <TargetDot key={i} ts={ts} />
              ))}
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
              Gateway — confirm deactivation
            </DialogTitle>
            <DialogDescription>
              This rule is gated. Type the required phrase to deactivate it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label>Type the exact phrase</Label>
            <Input
              autoFocus
              value={phraseInput}
              onChange={e => { setPhraseInput(e.target.value); setGatewayError('') }}
              onKeyDown={e => e.key === 'Enter' && handleGatewayConfirm()}
              className={gatewayError ? 'border-red-500' : ''}
            />
            {gatewayError && <p className="text-xs text-red-400">{gatewayError}</p>}
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
