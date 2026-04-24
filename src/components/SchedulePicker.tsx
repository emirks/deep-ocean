import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { PlusCircle, Trash2 } from 'lucide-react'
import type { Schedule } from '../../types'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface Props {
  schedules: Schedule[]
  onChange: (schedules: Schedule[]) => void
}

const defaultSchedule = (): Schedule => ({
  days: [1, 2, 3, 4, 5],
  lockTime: '09:00',
  unlockTime: '18:00'
})

export function SchedulePicker({ schedules, onChange }: Props) {
  const update = (i: number, patch: Partial<Schedule>) => {
    onChange(schedules.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  }

  const toggleDay = (schedIdx: number, day: number) => {
    const s = schedules[schedIdx]
    const days = s.days.includes(day) ? s.days.filter(d => d !== day) : [...s.days, day].sort()
    update(schedIdx, { days })
  }

  const remove = (i: number) => {
    onChange(schedules.filter((_, idx) => idx !== i))
  }

  return (
    <div className="space-y-4">
      {schedules.map((s, i) => (
        <div key={i} className="rounded-md border border-border p-4 space-y-3 bg-muted/20">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Schedule {i + 1}</span>
            {schedules.length > 1 && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => remove(i)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((day, d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(i, d)}
                className={cn(
                  'h-8 w-10 rounded text-xs font-medium transition-colors border',
                  s.days.includes(d)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                )}
              >
                {day}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Lock at</Label>
              <Input
                type="time"
                value={s.lockTime}
                onChange={e => update(i, { lockTime: e.target.value })}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Unlock at</Label>
              <Input
                type="time"
                value={s.unlockTime}
                onChange={e => update(i, { unlockTime: e.target.value })}
                className="h-9 text-sm"
              />
            </div>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full border-dashed"
        onClick={() => onChange([...schedules, defaultSchedule()])}
      >
        <PlusCircle className="h-4 w-4 mr-2" />
        Add Schedule
      </Button>
    </div>
  )
}
