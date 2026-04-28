import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './__root'
import { useSettingsStore } from '@/stores/settingsStore'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import type { AppSettings } from '../../types'

function SettingRow({ label, description, children }: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

function Settings() {
  const settings = useSettingsStore()
  const { update } = settings

  const save = async (patch: Partial<AppSettings>) => {
    update(patch)
    await window.api.updateSettings(patch)
  }

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-4 border-b border-border">
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-xs text-muted-foreground">App preferences and behaviour</p>
      </header>

      <div className="flex-1 overflow-auto px-6 py-2">
        <div className="max-w-lg divide-y divide-border">

          <SettingRow
            label="Launch at startup"
            description="Start DeepOcean when you log in (recommended — required for scheduled blocks)"
          >
            <Switch
              checked={settings.launchAtStartup}
              onCheckedChange={v => save({ launchAtStartup: v })}
            />
          </SettingRow>

          <Separator />

          <SettingRow
            label="Notifications"
            description="Show a notification when a rule locks or unlocks"
          >
            <Switch
              checked={settings.notifications}
              onCheckedChange={v => save({ notifications: v })}
            />
          </SettingRow>

          <SettingRow
            label="Pre-lock warning"
            description="Send a notification N minutes before a scheduled lock fires"
          >
            <Select
              value={String(settings.preNotificationMinutes)}
              onValueChange={v => save({ preNotificationMinutes: Number(v) })}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Off</SelectItem>
                <SelectItem value="5">5 minutes</SelectItem>
                <SelectItem value="10">10 minutes</SelectItem>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>

          <Separator />

          <SettingRow
            label="Theme"
            description="Light, dark, or follow system preference"
          >
            <Select
              value={settings.theme}
              onValueChange={v => save({ theme: v as AppSettings['theme'] })}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>

        </div>
      </div>
    </div>
  )
}

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: Settings
})
