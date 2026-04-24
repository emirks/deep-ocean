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
      confirmationPhrase: 'I will be productive',
      confirmationPhraseEnabled: false,
      theme: 'system'
    }
  }
})
