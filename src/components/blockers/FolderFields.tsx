import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FolderOpen } from 'lucide-react'
import type { FolderConfig } from '../../../types'

interface Props {
  config: FolderConfig
  onChange: (config: FolderConfig) => void
}

export function FolderFields({ config, onChange }: Props) {
  const pick = async () => {
    const path = await window.api.pickFolder()
    if (path) onChange({ path })
  }

  return (
    <div className="space-y-2">
      <Label>Folder path</Label>
      <div className="flex gap-2">
        <Input
          value={config.path}
          onChange={e => onChange({ path: e.target.value })}
          placeholder="C:\Users\You\Projects\Minecraft"
          className="flex-1"
        />
        <Button type="button" variant="outline" size="icon" onClick={pick}>
          <FolderOpen className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        DeepOcean will deny all access to this folder during blocked hours using <code className="text-primary">icacls</code>.
      </p>
    </div>
  )
}
