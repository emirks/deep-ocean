import { create } from 'zustand'
import type { AppSettings } from '../../types'

interface SettingsState extends AppSettings {
  loaded: boolean
  /**
   * In-memory only (not persisted). True once the user passes the gateway
   * challenge for the protected settings section. Survives route navigation
   * within a single app session; resets to false on app reload.
   */
  settingsUnlocked: boolean
  setSettings:      (settings: AppSettings) => void
  update:           (patch: Partial<AppSettings>) => void
  setUnlocked:      (v: boolean) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  launchAtStartup: true,
  notifications: true,
  preNotificationMinutes: 5,
  theme: 'system',
  settingsGatewayId: null,
  useServerTime: false,
  loaded: false,
  settingsUnlocked: false,
  setSettings: (settings) => set({ ...settings, loaded: true }),
  update:      (patch)    => set((s) => ({ ...s, ...patch })),
  setUnlocked: (v)        => set({ settingsUnlocked: v })
}))
