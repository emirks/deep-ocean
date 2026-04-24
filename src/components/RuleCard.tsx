import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from './StatusBadge'
import { useRulesStore } from '@/stores/rulesStore'
import { Edit2, Folder, Globe, Monitor, Trash2, Lock, Unlock } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import type { Rule } from '../../types'
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

export function RuleCard({ rule }: Props) {
  const { removeRule, updateStatus } = useRulesStore()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const TypeIcon = typeIcon[rule.type] ?? Folder

  const handleToggle = async () => {
    setLoading(true)
    try {
      if (rule.status === 'blocked') {
        await window.api.unblockNow(rule.id)
        updateStatus(rule.id, 'unblocked')
      } else {
        await window.api.blockNow(rule.id)
        updateStatus(rule.id, 'blocked')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = async () => {
    await window.api.removeRule(rule.id)
    removeRule(rule.id)
  }

  return (
    <Card className={cn(
      'transition-all border',
      rule.status === 'blocked'   && 'border-red-500/20 bg-red-950/10',
      rule.status === 'unblocked' && 'border-border',
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
              </div>
              <p className="text-xs text-muted-foreground mt-1">{nextScheduleText(rule)}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={handleToggle}
              className={cn(
                'h-8 text-xs',
                rule.status === 'blocked'
                  ? 'border-green-500/30 text-green-400 hover:bg-green-500/10'
                  : 'border-red-500/30 text-red-400 hover:bg-red-500/10'
              )}
            >
              {rule.status === 'blocked'
                ? <><Unlock className="h-3.5 w-3.5 mr-1" /> Unlock now</>
                : <><Lock className="h-3.5 w-3.5 mr-1" /> Block now</>
              }
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => navigate({ to: '/add-rule', search: { editId: rule.id } })}
            >
              <Edit2 className="h-3.5 w-3.5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={handleRemove}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
