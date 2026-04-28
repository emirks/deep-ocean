import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import type { BlockerConfig, AppConfig, AppTarget, RuleStatus, TargetStatus } from '../../types'
import type { IBlocker } from './BaseBlocker'

const execFileAsync = promisify(execFile)
const username = os.userInfo().username

/**
 * Normalises legacy single-app format ({ exeName, exePath }) and current
 * multi-app format ({ apps: AppTarget[] }) to an array.
 */
function getApps(config: BlockerConfig): AppTarget[] {
  const c = config as AppConfig & { exeName?: string; exePath?: string }
  if (Array.isArray(c.apps) && c.apps.length > 0) return c.apps
  if (c.exePath) return [{ exeName: c.exeName ?? '', exePath: c.exePath }]  // backward compat
  return []
}

export class AppBlocker implements IBlocker {
  readonly type = 'app'
  readonly label = 'Application'

  validate(config: BlockerConfig): boolean {
    return getApps(config).length > 0
  }

  async block(config: BlockerConfig): Promise<void> {
    const apps = getApps(config)
    await Promise.all(apps.map(async ({ exePath, exeName }) => {
      await execFileAsync('icacls', [exePath, '/deny', `${username}:(X)`])
      if (exeName) {
        await execFileAsync('taskkill', ['/F', '/IM', exeName]).catch(() => {})
      }
    }))
  }

  async unblock(config: BlockerConfig): Promise<void> {
    const apps = getApps(config)
    await Promise.all(
      apps.map(({ exePath }) => execFileAsync('icacls', [exePath, '/remove:d', username]))
    )
  }

  async getStatus(config: BlockerConfig): Promise<RuleStatus> {
    const apps = getApps(config)
    if (apps.length === 0) return 'error'
    try {
      const results = await Promise.all(apps.map(({ exePath }) => this._isDenied(exePath)))
      if (results.some(Boolean)) return 'blocked'
      return 'unblocked'
    } catch {
      return 'error'
    }
  }

  async getTargetStatuses(config: BlockerConfig): Promise<TargetStatus[]> {
    const apps = getApps(config)
    return Promise.all(apps.map(async ({ exeName, exePath }) => {
      try {
        const denied = await this._isDenied(exePath)
        return { label: exeName || exePath.split(/[\\/]/).pop() || exePath, status: denied ? 'blocked' as const : 'unblocked' as const }
      } catch {
        return { label: exeName, status: 'error' as const }
      }
    }))
  }

  private async _isDenied(exePath: string): Promise<boolean> {
    const { stdout } = await execFileAsync('icacls', [exePath])
    const lowerUser = username.toLowerCase()
    return stdout.split('\n').some(line => {
      const l = line.toLowerCase()
      return l.includes(lowerUser) && l.includes('deny')
    })
  }
}

// Export helper so processMonitor can read apps without importing all of AppBlocker
export { getApps }
