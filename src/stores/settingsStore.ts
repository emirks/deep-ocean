import { create } from 'zustand'
import type { AppSettings } from '../../types'

interface SettingsState extends AppSettings {
  loaded: boolean
  setSettings: (settings: AppSettings) => void
  update: (patch: Partial<AppSettings>) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  launchAtStartup: true,
  notifications: true,
  confirmationPhrase: 'I will be productive',
  confirmationPhraseEnabled: false,
  theme: 'system',
  loaded: false,
  setSettings: (settings) => set({ ...settings, loaded: true }),
  update: (patch) => set((s) => ({ ...s, ...patch }))
}))
