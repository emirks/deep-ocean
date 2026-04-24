export type BlockerType = 'folder' | 'app' | 'website'
export type RuleStatus = 'blocked' | 'unblocked' | 'paused' | 'error'

export interface Schedule {
  days: number[]      // 0=Sun, 1=Mon ... 6=Sat
  lockTime: string    // "09:00"
  unlockTime: string  // "18:00"
}

export interface FolderConfig {
  path: string
}

export interface AppConfig {
  exeName: string
  exePath: string
}

export interface WebsiteConfig {
  domains: string[]
}

export type BlockerConfig = FolderConfig | AppConfig | WebsiteConfig

export interface Rule {
  id: string
  type: BlockerType
  label: string
  config: BlockerConfig
  schedules: Schedule[]
  status: RuleStatus
  createdAt: string
}

export interface AppSettings {
  launchAtStartup: boolean
  notifications: boolean
  confirmationPhrase: string
  confirmationPhraseEnabled: boolean
  theme: 'light' | 'dark' | 'system'
}
