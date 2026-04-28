import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FolderOpen, Plus, X } from 'lucide-react'
import type { FolderConfig } from '../../../types'

interface Props {
  config: FolderConfig
  onChange: (config: FolderConfig) => void
}

export function FolderFields({ config, onChange }: Props) {
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

      {paths.map((p, idx) => (
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
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}

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
