import type { BlockerConfig, RuleStatus } from '../../types'
import type { IBlocker } from './BaseBlocker'

export class WebsiteBlocker implements IBlocker {
  readonly type = 'website'
  readonly label = 'Website'

  validate(_config: BlockerConfig): boolean {
    return true
  }

  async block(_config: BlockerConfig): Promise<void> {
    throw new Error('WebsiteBlocker: Not implemented in v1')
  }

  async unblock(_config: BlockerConfig): Promise<void> {
    throw new Error('WebsiteBlocker: Not implemented in v1')
  }

  async getStatus(_config: BlockerConfig): Promise<RuleStatus> {
    return 'unblocked'
  }
}
