import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { FileSearch } from 'lucide-react'
import type { AppConfig } from '../../../types'

interface Props {
  config: AppConfig
  onChange: (config: AppConfig) => void
}

export function AppFields({ config, onChange }: Props) {
  const pick = async () => {
    const exePath = await window.api.pickExe()
    if (exePath) {
      const parts = exePath.replace(/\\/g, '/').split('/')
      const exeName = parts[parts.length - 1]
      onChange({ exeName, exePath })
    }
  }

  return (
    <div className="space-y-3">
      <Badge variant="outline" className="text-yellow-400 border-yellow-400/30 bg-yellow-400/10">
        Coming in v2
      </Badge>
      <div className="space-y-2 opacity-60 pointer-events-none">
        <Label>Executable</Label>
        <div className="flex gap-2">
          <Input value={config.exePath} readOnly placeholder="Select .exe file" className="flex-1" />
          <Button type="button" variant="outline" size="icon" onClick={pick}>
            <FileSearch className="h-4 w-4" />
          </Button>
        </div>
        <Label>Process name</Label>
        <Input value={config.exeName} readOnly placeholder="app.exe" />
      </div>
      <p className="text-xs text-muted-foreground">App blocking will be available in v2.</p>
    </div>
  )
}
