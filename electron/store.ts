import Store from 'electron-store'
import type { Rule, AppSettings, GatewayDef } from '../types'

interface StoreSchema {
  rules: Rule[]
  gateways: GatewayDef[]
  settings: AppSettings
}

export const store = new Store<StoreSchema>({
  defaults: {
    rules: [],
    gateways: [],
    settings: {
      launchAtStartup: true,
      notifications: true,
      preNotificationMinutes: 5,
      theme: 'system',
      settingsGatewayId: null,
      useServerTime: false
    }
  }
})
