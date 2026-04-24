import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { RuleStatus } from '../../types'

interface Props {
  status: RuleStatus
}

const config: Record<RuleStatus, { label: string; classes: string }> = {
  blocked:   { label: '● BLOCKED',   classes: 'border-red-500/30 bg-red-500/10 text-red-400' },
  unblocked: { label: '○ ACTIVE',    classes: 'border-green-500/30 bg-green-500/10 text-green-400' },
  paused:    { label: '⏸ PAUSED',    classes: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400' },
  error:     { label: '⚠ ERROR',     classes: 'border-orange-500/30 bg-orange-500/10 text-orange-400' }
}

export function StatusBadge({ status }: Props) {
  const { label, classes } = config[status] ?? config.error
  return (
    <Badge variant="outline" className={cn('font-mono text-xs px-2 py-0.5', classes)}>
      {label}
    </Badge>
  )
}
