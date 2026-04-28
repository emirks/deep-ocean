import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import type { BlockerConfig, AppConfig, AppTarget, RuleStatus, TargetStatus } from '../../types'
import type { IBlocker } from './BaseBlocker'
import { createLogger } from '../logger'

const execFileAsync = promisify(execFile)
const username = os.userInfo().username
const log = createLogger('AppBlocker')

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
    log.info(`block() — ${apps.length} app(s): ${apps.map(a => a.exeName).join(', ')}`)
    await Promise.all(apps.map(async ({ exePath, exeName }) => {
      const alreadyDenied = await this._isDenied(exePath).catch(() => false)
      if (alreadyDenied) {
        log.debug(`  "${exeName}" — already denied, skipping duplicate ACE`)
      } else {
        log.debug(`  "${exeName}" — running: icacls "${exePath}" /deny ${username}:(X)`)
        const r = await execFileAsync('icacls', [exePath, '/deny', `${username}:(X)`])
        log.info(`  "${exeName}" — DENY(X) applied (${r.stdout.trim().split('\n').pop()?.trim()})`)
      }
      if (exeName) {
        log.debug(`  taskkill /F /IM "${exeName}"`)
        await execFileAsync('taskkill', ['/F', '/IM', exeName])
          .then(() => log.info(`  "${exeName}" — process killed`))
          .catch(e  => log.debug(`  "${exeName}" — taskkill skipped (not running): ${e.message}`))
      }
    }))
    log.info(`block() complete`)
  }

  async unblock(config: BlockerConfig): Promise<void> {
    const apps = getApps(config)
    log.info(`unblock() — ${apps.length} app(s): ${apps.map(a => a.exeName).join(', ')}`)
    await Promise.all(apps.map(async ({ exePath, exeName }) => {
      log.debug(`  "${exeName}" — running: icacls "${exePath}" /remove:d ${username}`)
      const r = await execFileAsync('icacls', [exePath, '/remove:d', username])
      log.info(`  "${exeName}" — DENY removed (${r.stdout.trim().split('\n').pop()?.trim()})`)
    }))
    log.info(`unblock() complete`)
  }

  async getStatus(config: BlockerConfig): Promise<RuleStatus> {
    const apps = getApps(config)
    if (apps.length === 0) return 'error'
    try {
      const results = await Promise.all(apps.map(({ exePath }) => this._isDenied(exePath)))
      const status: RuleStatus = results.some(Boolean) ? 'blocked' : 'unblocked'
      log.debug(`getStatus() → ${status} | ${apps.map((a, i) => `${a.exeName}=${results[i]}`).join(', ')}`)
      return status
    } catch (e) {
      log.error('getStatus() threw:', e)
      return 'error'
    }
  }

  async getTargetStatuses(config: BlockerConfig): Promise<TargetStatus[]> {
    const apps = getApps(config)
    const statuses = await Promise.all(apps.map(async ({ exeName, exePath }) => {
      const label = exeName || exePath.split(/[\\/]/).pop() || exePath
      try {
        const denied = await this._isDenied(exePath)
        log.debug(`  "${label}" → ${denied ? 'blocked' : 'unblocked'}`)
        return { label, status: denied ? 'blocked' as const : 'unblocked' as const }
      } catch (e) {
        log.error(`  "${label}" → error:`, e)
        return { label: exeName, status: 'error' as const }
      }
    }))
    log.debug(`getTargetStatuses() — ${statuses.map(s => `${s.label}=${s.status}`).join(', ')}`)
    return statuses
  }

  private async _isDenied(exePath: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('icacls', [exePath])
      const lowerUser = username.toLowerCase()
      const lines = stdout.split('\n')

      log.debug(`  _isDenied("${exePath.split(/[\\/]/).pop()}") icacls output:`)
      lines.forEach(l => { if (l.trim()) log.debug(`    ${l.trimEnd()}`) })

      const denied = lines.some(line => {
        const l = line.toLowerCase()
        return l.includes(lowerUser) && (l.includes('deny') || l.includes('(n)'))
      })
      log.debug(`  _isDenied("${exePath.split(/[\\/]/).pop()}") → ${denied}`)
      return denied
    } catch (e: any) {
      const errText = (String(e?.stderr ?? '') + String(e?.message ?? '')).toLowerCase()
      log.warn(`  _isDenied icacls failed: "${e?.stderr?.trim() || e?.message?.trim()}"`)
      if (errText.includes('access is denied') || errText.includes('access denied')) {
        log.warn(`  → treating icacls access-denied as blocked`)
        return true
      }
      throw e
    }
  }
}

// Export helper so processMonitor can read apps without importing all of AppBlocker
export { getApps }
