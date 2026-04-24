import type { BlockerConfig, RuleStatus } from '../../types'
import type { IBlocker } from './BaseBlocker'

export class AppBlocker implements IBlocker {
  readonly type = 'app'
  readonly label = 'Application'

  validate(_config: BlockerConfig): boolean {
    return true
  }

  async block(_config: BlockerConfig): Promise<void> {
    throw new Error('AppBlocker: Not implemented in v1')
  }

  async unblock(_config: BlockerConfig): Promise<void> {
    throw new Error('AppBlocker: Not implemented in v1')
  }

  async getStatus(_config: BlockerConfig): Promise<RuleStatus> {
    return 'unblocked'
  }
}
