import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import type { BlockerConfig, FolderConfig, RuleStatus, TargetStatus } from '../../types'
import type { IBlocker } from './BaseBlocker'
import { createLogger } from '../logger'

const execFileAsync = promisify(execFile)
const username = os.userInfo().username
const log = createLogger('FolderBlocker')

/**
 * Normalises legacy single-path format ({ path: string }) and current
 * multi-path format ({ paths: string[] }) to a string array.
 */
function getPaths(config: BlockerConfig): string[] {
  const c = config as FolderConfig & { path?: string }
  if (Array.isArray(c.paths) && c.paths.length > 0) return c.paths
  if (typeof c.path === 'string' && c.path) return [c.path]   // backward compat
  return []
}

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

export class FolderBlocker implements IBlocker {
  readonly type = 'folder'
  readonly label = 'Folder'

  validate(config: BlockerConfig): boolean {
    return getPaths(config).length > 0
  }

  async block(config: BlockerConfig): Promise<void> {
    const paths = getPaths(config)
    log.info(`block() — ${paths.length} path(s): ${paths.map(basename).join(', ')}`)
    await Promise.all(
      paths.map(async p => {
        const alreadyDenied = await this._isDenied(p).catch(() => false)
        if (alreadyDenied) {
          log.debug(`  "${basename(p)}" — already denied, skipping duplicate ACE`)
          return
        }
        log.debug(`  "${basename(p)}" — running: icacls "${p}" /deny ${username}:(OI)(CI)F`)
        const r = await execFileAsync('icacls', [p, '/deny', `${username}:(OI)(CI)F`])
        log.info(`  "${basename(p)}" — DENY applied (${r.stdout.trim().split('\n').pop()?.trim()})`)
      })
    )
    log.info(`block() complete`)
  }

  async unblock(config: BlockerConfig): Promise<void> {
    const paths = getPaths(config)
    log.info(`unblock() — ${paths.length} path(s): ${paths.map(basename).join(', ')}`)
    await Promise.all(
      paths.map(async p => {
        log.debug(`  "${basename(p)}" — running: icacls "${p}" /remove:d ${username}`)
        const r = await execFileAsync('icacls', [p, '/remove:d', username])
        log.info(`  "${basename(p)}" — DENY removed (${r.stdout.trim().split('\n').pop()?.trim()})`)
      })
    )
    log.info(`unblock() complete`)
  }

  async getStatus(config: BlockerConfig): Promise<RuleStatus> {
    const paths = getPaths(config)
    if (paths.length === 0) return 'error'
    try {
      const results = await Promise.all(paths.map(p => this._isDenied(p)))
      const status: RuleStatus = results.some(Boolean) ? 'blocked' : 'unblocked'
      log.debug(`getStatus() → ${status} | ${paths.map((p, i) => `${basename(p)}=${results[i]}`).join(', ')}`)
      return status
    } catch (e) {
      log.error('getStatus() threw:', e)
      return 'error'
    }
  }

  async getTargetStatuses(config: BlockerConfig): Promise<TargetStatus[]> {
    const paths = getPaths(config)
    const statuses = await Promise.all(paths.map(async p => {
      const label = basename(p)
      try {
        const denied = await this._isDenied(p)
        log.debug(`  "${label}" → ${denied ? 'blocked' : 'unblocked'}`)
        return { label, status: denied ? 'blocked' as const : 'unblocked' as const }
      } catch (e) {
        log.error(`  "${label}" → error:`, e)
        return { label, status: 'error' as const }
      }
    }))
    log.debug(`getTargetStatuses() — ${statuses.map(s => `${s.label}=${s.status}`).join(', ')}`)
    return statuses
  }

  private async _isDenied(p: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('icacls', [p])
      const lowerUser = username.toLowerCase()
      const lines = stdout.split('\n')

      log.debug(`  _isDenied("${basename(p)}") icacls output:`)
      lines.forEach(l => { if (l.trim()) log.debug(`    ${l.trimEnd()}`) })

      // icacls shows a Full-Control deny ACE as "(N)" (No Access), not "(DENY)".
      // We check both forms to be safe across Windows versions.
      const denied = lines.some(line => {
        const l = line.toLowerCase()
        return l.includes(lowerUser) && (l.includes('deny') || l.includes('(n)'))
      })
      log.debug(`  _isDenied("${basename(p)}") → ${denied} (user="${lowerUser}")`)
      return denied
    } catch (e: any) {
      const errText = (String(e?.stderr ?? '') + String(e?.message ?? '')).toLowerCase()
      log.warn(`  _isDenied("${basename(p)}") — icacls failed: "${e?.stderr?.trim() || e?.message?.trim()}"`)
      // A Full-Control deny also revokes READ_CONTROL, causing icacls to fail.
      // That failure is itself proof the deny ACE is active.
      if (errText.includes('access is denied') || errText.includes('access denied')) {
        log.warn(`  → treating icacls access-denied as blocked`)
        return true
      }
      throw e
    }
  }
}
