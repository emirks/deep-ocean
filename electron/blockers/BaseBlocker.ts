import type { BlockerConfig, RuleStatus, TargetStatus } from '../../types'

export interface IBlocker {
  readonly type: string
  readonly label: string
  validate(config: BlockerConfig): boolean
  block(config: BlockerConfig): Promise<void>
  unblock(config: BlockerConfig): Promise<void>
  getStatus(config: BlockerConfig): Promise<RuleStatus>
  /** Returns the live OS state for each individual target inside this config. */
  getTargetStatuses(config: BlockerConfig): Promise<TargetStatus[]>
}
