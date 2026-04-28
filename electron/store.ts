import Store from 'electron-store'
import type { Rule, AppSettings } from '../types'

interface StoreSchema {
  rules: Rule[]
  settings: AppSettings
}

export const store = new Store<StoreSchema>({
  defaults: {
    rules: [],
    settings: {
      launchAtStartup: true,
      notifications: true,
      preNotificationMinutes: 5,
      theme: 'system'
    }
  }
})
