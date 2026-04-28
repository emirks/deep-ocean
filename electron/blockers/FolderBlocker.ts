import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import type { BlockerConfig, FolderConfig, RuleStatus, TargetStatus } from '../../types'
import type { IBlocker } from './BaseBlocker'

const execFileAsync = promisify(execFile)
const username = os.userInfo().username

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

export class FolderBlocker implements IBlocker {
  readonly type = 'folder'
  readonly label = 'Folder'

  validate(config: BlockerConfig): boolean {
    return getPaths(config).length > 0
  }

  async block(config: BlockerConfig): Promise<void> {
    const paths = getPaths(config)
    // Run in parallel across all paths for speed
    await Promise.all(
      paths.map(p => execFileAsync('icacls', [p, '/deny', `${username}:(OI)(CI)F`]))
    )
  }

  async unblock(config: BlockerConfig): Promise<void> {
    const paths = getPaths(config)
    await Promise.all(
      paths.map(p => execFileAsync('icacls', [p, '/remove:d', username]))
    )
  }

  async getStatus(config: BlockerConfig): Promise<RuleStatus> {
    const paths = getPaths(config)
    if (paths.length === 0) return 'error'
    try {
      const results = await Promise.all(paths.map(p => this._isDenied(p)))
      if (results.some(Boolean)) return 'blocked'
      return 'unblocked'
    } catch {
      return 'error'
    }
  }

  async getTargetStatuses(config: BlockerConfig): Promise<TargetStatus[]> {
    const paths = getPaths(config)
    return Promise.all(paths.map(async p => {
      const label = p.split(/[\\/]/).pop() ?? p
      try {
        const denied = await this._isDenied(p)
        return { label, status: denied ? 'blocked' as const : 'unblocked' as const }
      } catch {
        return { label, status: 'error' as const }
      }
    }))
  }

  private async _isDenied(p: string): Promise<boolean> {
    const { stdout } = await execFileAsync('icacls', [p])
    const lowerUser = username.toLowerCase()
    return stdout.split('\n').some(line => {
      const l = line.toLowerCase()
      return l.includes(lowerUser) && l.includes('deny')
    })
  }
}
