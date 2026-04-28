import type { Rule, TargetStatus } from '../../types'
import type { IBlocker } from './BaseBlocker'
import { FolderBlocker } from './FolderBlocker'
import { AppBlocker } from './AppBlocker'
import { WebsiteBlocker } from './WebsiteBlocker'

const registry: Record<string, IBlocker> = {
  folder:  new FolderBlocker(),
  app:     new AppBlocker(),
  website: new WebsiteBlocker()
}

export const BlockerEngine = {
  getTypes: (): { type: string; label: string }[] =>
    Object.values(registry).map(b => ({ type: b.type, label: b.label })),

  block:             (rule: Rule) => registry[rule.type].block(rule.config),
  unblock:           (rule: Rule) => registry[rule.type].unblock(rule.config),
  getStatus:         (rule: Rule) => registry[rule.type].getStatus(rule.config),
  getTargetStatuses: (rule: Rule): Promise<TargetStatus[]> =>
    registry[rule.type].getTargetStatuses(rule.config)
}
