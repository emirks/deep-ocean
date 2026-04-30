// ─── Block types ───────────────────────────────────────────────────────────────

export type BlockerType = 'folder' | 'app' | 'website'

/**
 * locking/unlocking = transition in progress (icacls may take time on large trees).
 * The UI shows a spinner for these states.
 */
export type RuleStatus = 'blocked' | 'unblocked' | 'locking' | 'unlocking' | 'error'

export interface Schedule {
  days: number[]     // 0=Sun … 6=Sat
  lockTime: string   // "09:00"
  unlockTime: string // "18:00"
}

/**
 * Live OS state for a single target (one folder path, one exe, one domain).
 * Distinct from the rule-level status which aggregates all targets.
 */
export interface TargetStatus {
  /** Human-readable label — folder name, exe name, or domain */
  label: string
  /** Actual OS state for this specific target */
  status: 'blocked' | 'unblocked' | 'error'
}

// ─── Block configs ─────────────────────────────────────────────────────────────

export interface FolderConfig {
  paths: string[]
}

export interface AppTarget {
  exeName: string
  exePath: string
}

export interface AppConfig {
  apps: AppTarget[]
}

export interface WebsiteConfig {
  domains: string[]
}

export type BlockerConfig = FolderConfig | AppConfig | WebsiteConfig

// ─── Gateways ──────────────────────────────────────────────────────────────────
//
// A GatewayDef is a named, globally-defined friction layer.
// Rules reference gateways by ID (gatewayIds[]). Settings use a single gateway
// (settingsGatewayId). Scheduled unlocks always bypass gateways.
//
// Only phrase gateways are implemented; extend `phrase` → union type when more
// variants (timer, email, Telegram) are added.

export interface GatewayDef {
  id: string
  name: string
  phrase: string
  createdAt: string
}

// ─── Rule ──────────────────────────────────────────────────────────────────────

export interface Rule {
  id: string
  type: BlockerType
  label: string
  config: BlockerConfig
  schedules: Schedule[]
  /** IDs referencing globally-defined GatewayDef entries. All must pass before manual disable. */
  gatewayIds: string[]
  /**
   * User's choice: is this rule armed?
   * When true the scheduler locks/unlocks according to the schedule.
   * When false the rule is dormant and all targets are unlocked.
   * This is the ONLY field the user directly controls.
   */
  enabled: boolean
  /**
   * Current OS lock state — computed by the scheduler and synced on focus.
   * Never directly controlled by the user; only updated by the scheduler or
   * the enable/disable actions.
   */
  status: RuleStatus
  createdAt: string
}

// ─── Settings ──────────────────────────────────────────────────────────────────

export interface AppSettings {
  launchAtStartup: boolean
  notifications: boolean
  /** Minutes before a schedule lock to send a warning notification. 0 = disabled. */
  preNotificationMinutes: number
  theme: 'light' | 'dark' | 'system'
  /** GatewayDef.id that locks the protected settings section. null = no lock. */
  settingsGatewayId: string | null
  /**
   * When true, the scheduler uses server time (via google.com Date header) instead
   * of local time for schedule checks — prevents clock-rollback bypass.
   */
  useServerTime: boolean
}
