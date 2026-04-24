import type { BlockerConfig, RuleStatus } from '../../types'

export interface IBlocker {
  readonly type: string
  readonly label: string
  validate(config: BlockerConfig): boolean
  block(config: BlockerConfig): Promise<void>
  unblock(config: BlockerConfig): Promise<void>
  getStatus(config: BlockerConfig): Promise<RuleStatus>
}
