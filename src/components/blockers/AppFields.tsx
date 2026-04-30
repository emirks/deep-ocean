import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { FileSearch, Plus, X, Lock } from 'lucide-react'
import type { AppConfig, AppTarget } from '../../../types'

interface Props {
  config: AppConfig
  onChange: (config: AppConfig) => void
  /** Number of apps that existed when the rule was loaded in edit mode. Those apps are read-only. */
  existingCount?: number
}

export function AppFields({ config, onChange, existingCount = 0 }: Props) {
  const apps: AppTarget[] = config.apps ?? []

  const pickAndAdd = async () => {
    const exePath = await window.api.pickExe()
    if (!exePath) return
    const parts = exePath.replace(/\\/g, '/').split('/')
    const exeName = parts[parts.length - 1]
    if (!apps.some(a => a.exePath === exePath)) {
      onChange({ apps: [...apps, { exeName, exePath }] })
    }
  }

  const remove = (idx: number) => {
    onChange({ apps: apps.filter((_, i) => i !== idx) })
  }

  return (
    <div className="space-y-3">
      <Label>Applications to block</Label>

      {apps.map((app, idx) => {
        const locked = idx < existingCount
        return (
          <div key={idx} className="flex items-center gap-2 p-2.5 rounded-md bg-muted/40 border border-border">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{app.exeName}</p>
              <p className="text-xs text-muted-foreground font-mono truncate">{app.exePath}</p>
            </div>
            {locked ? (
              <Lock className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(idx)}
                className="flex-shrink-0 h-7 w-7 text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )
      })}

      <Button type="button" variant="outline" size="sm" className="w-full" onClick={pickAndAdd}>
        <FileSearch className="h-3.5 w-3.5 mr-1.5" />
        Browse & add .exe
      </Button>

      <p className="text-xs text-muted-foreground">
        Denies execute permission via <code className="text-primary">icacls</code> and kills running instances.
        A background monitor re-kills the app every 5 s if it restarts.
      </p>
    </div>
  )
}
