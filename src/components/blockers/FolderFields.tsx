import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FolderOpen, Plus, X, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FolderConfig } from '../../../types'

interface Props {
  config: FolderConfig
  onChange: (config: FolderConfig) => void
  /** Number of paths that existed when the rule was loaded in edit mode. Those paths are read-only. */
  existingCount?: number
}

export function FolderFields({ config, onChange, existingCount = 0 }: Props) {
  const paths = config.paths ?? []

  const addPicked = async () => {
    const p = await window.api.pickFolder()
    if (p && !paths.includes(p)) onChange({ paths: [...paths, p] })
  }

  const addTyped = (idx: number, value: string) => {
    const next = [...paths]
    next[idx] = value
    onChange({ paths: next })
  }

  const remove = (idx: number) => {
    onChange({ paths: paths.filter((_, i) => i !== idx) })
  }

  const addBlank = () => {
    onChange({ paths: [...paths, ''] })
  }

  return (
    <div className="space-y-3">
      <Label>Folders to block</Label>

      {paths.map((p, idx) => {
        const locked = idx < existingCount
        return locked ? (
          <div key={idx} className="flex gap-2 items-center px-3 py-2 rounded-md bg-muted/30 border border-border/50">
            <Lock className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
            <span className="flex-1 font-mono text-xs text-muted-foreground truncate">{p}</span>
          </div>
        ) : (
          <div key={idx} className="flex gap-2">
            <Input
              value={p}
              onChange={e => addTyped(idx, e.target.value)}
              placeholder="C:\Users\You\Projects\SomeGame"
              className="flex-1 font-mono text-xs"
            />
            <Button type="button" variant="outline" size="icon" onClick={addPicked} title="Browse">
              <FolderOpen className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => remove(idx)}
              className={cn('text-muted-foreground hover:text-destructive')}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )
      })}

      <Button type="button" variant="outline" size="sm" onClick={addBlank} className="w-full">
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Add folder
      </Button>

      <p className="text-xs text-muted-foreground">
        Access is denied via NTFS ACL (<code className="text-primary">icacls</code>).
        Locking large directories may take a moment.
      </p>
    </div>
  )
}
