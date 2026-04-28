import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { RuleStatus } from '../../types'

interface Props {
  status: RuleStatus
}

const config: Record<RuleStatus, { label: string; classes: string }> = {
  blocked:   { label: '● ACTIVE',     classes: 'border-red-500/40 bg-red-500/15 text-red-400' },
  unblocked: { label: '○ INACTIVE',   classes: 'border-muted-foreground/30 bg-muted/40 text-muted-foreground' },
  locking:   { label: '⟳ LOCKING',   classes: 'border-orange-500/40 bg-orange-500/15 text-orange-300 animate-pulse' },
  unlocking: { label: '⟳ UNLOCKING', classes: 'border-blue-500/40 bg-blue-500/15 text-blue-300 animate-pulse' },
  paused:    { label: '⏸ PAUSED',    classes: 'border-yellow-500/40 bg-yellow-500/15 text-yellow-400' },
  error:     { label: '⚠ ERROR',     classes: 'border-orange-500/40 bg-orange-500/15 text-orange-400' }
}

export function StatusBadge({ status }: Props) {
  const { label, classes } = config[status] ?? config.error
  return (
    <Badge variant="outline" className={cn('font-mono text-xs px-2 py-0.5 tracking-wide', classes)}>
      {label}
    </Badge>
  )
}
