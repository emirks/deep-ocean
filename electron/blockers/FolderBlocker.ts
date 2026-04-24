import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import type { BlockerConfig, FolderConfig, RuleStatus } from '../../types'
import type { IBlocker } from './BaseBlocker'

const execAsync = promisify(exec)
const username = os.userInfo().username

export class FolderBlocker implements IBlocker {
  readonly type = 'folder'
  readonly label = 'Folder'

  validate(config: BlockerConfig): boolean {
    const c = config as FolderConfig
    return typeof c.path === 'string' && c.path.length > 0
  }

  async block(config: BlockerConfig): Promise<void> {
    const { path } = config as FolderConfig
    await execAsync(`icacls "${path}" /deny "${username}:(OI)(CI)F"`)
  }

  async unblock(config: BlockerConfig): Promise<void> {
    const { path } = config as FolderConfig
    await execAsync(`icacls "${path}" /remove:d "${username}"`)
  }

  async getStatus(config: BlockerConfig): Promise<RuleStatus> {
    const { path } = config as FolderConfig
    try {
      const { stdout } = await execAsync(`icacls "${path}"`)
      return stdout.toLowerCase().includes('deny') ? 'blocked' : 'unblocked'
    } catch {
      return 'error'
    }
  }
}
