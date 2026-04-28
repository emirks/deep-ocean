import { promises as fs } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { BlockerConfig, WebsiteConfig, RuleStatus, TargetStatus } from '../../types'
import type { IBlocker } from './BaseBlocker'
import { createLogger } from '../logger'

const execFileAsync = promisify(execFile)
const log = createLogger('WebsiteBlocker')

const HOSTS_FILE = 'C:\\Windows\\System32\\drivers\\etc\\hosts'
const BLOCK_IP = '0.0.0.0'
const COMMENT_TAG = '# DeepOcean'

function makeEntry(domain: string): string {
  return `${BLOCK_IP} ${domain} ${COMMENT_TAG}`
}

/** Expand a bare domain into both the apex and www variant. */
function expandDomain(domain: string): string[] {
  const bare = domain.replace(/^www\./i, '')
  return [`${bare}`, `www.${bare}`]
}

function allVariants(domains: string[]): string[] {
  return [...new Set(domains.flatMap(expandDomain))]
}

async function flushDns(): Promise<void> {
  try {
    log.debug('Flushing DNS cache (ipconfig /flushdns)')
    await execFileAsync('ipconfig', ['/flushdns'])
    log.debug('DNS cache flushed')
  } catch (e) {
    log.warn('DNS flush failed (non-fatal):', e)
  }
}

export class WebsiteBlocker implements IBlocker {
  readonly type = 'website'
  readonly label = 'Website'

  validate(config: BlockerConfig): boolean {
    const c = config as WebsiteConfig
    return Array.isArray(c.domains) && c.domains.length > 0
  }

  async block(config: BlockerConfig): Promise<void> {
    const { domains } = config as WebsiteConfig
    const variants = allVariants(domains)
    log.info(`block() — ${domains.length} domain(s): ${domains.join(', ')}`)
    log.debug(`  variants to block: ${variants.join(', ')}`)

    const content = await fs.readFile(HOSTS_FILE, 'utf8')
    const newEntries = variants.filter(d => !content.includes(makeEntry(d))).map(makeEntry)

    if (newEntries.length === 0) {
      log.info(`block() — all ${variants.length} variant(s) already present in hosts, skipping`)
      return
    }
    log.info(`block() — appending ${newEntries.length} new host entry/entries`)
    newEntries.forEach(e => log.debug(`  + ${e}`))

    await fs.appendFile(HOSTS_FILE, '\n' + newEntries.join('\n') + '\n')
    await flushDns()
    log.info(`block() complete`)
  }

  async unblock(config: BlockerConfig): Promise<void> {
    const { domains } = config as WebsiteConfig
    const variants = allVariants(domains)
    log.info(`unblock() — ${domains.length} domain(s): ${domains.join(', ')}`)

    const content = await fs.readFile(HOSTS_FILE, 'utf8')
    const lines = content.split('\n')
    const filtered = lines.filter(line => !variants.some(d => line.trimEnd() === makeEntry(d)))
    const removed = lines.length - filtered.length

    if (removed === 0) {
      log.info(`unblock() — no matching entries found in hosts (already clean)`)
      return
    }
    log.info(`unblock() — removing ${removed} host line(s)`)
    variants.forEach(v => log.debug(`  - ${makeEntry(v)}`))

    await fs.writeFile(HOSTS_FILE, filtered.join('\n'), 'utf8')
    await flushDns()
    log.info(`unblock() complete`)
  }

  async getStatus(config: BlockerConfig): Promise<RuleStatus> {
    const { domains } = config as WebsiteConfig
    const variants = allVariants(domains)
    try {
      const content = await fs.readFile(HOSTS_FILE, 'utf8')
      const results = variants.map(d => ({ domain: d, present: content.includes(makeEntry(d)) }))
      const allBlocked = results.every(r => r.present)
      log.debug(`getStatus() → ${allBlocked ? 'blocked' : 'unblocked'} | ${results.map(r => `${r.domain}=${r.present}`).join(', ')}`)
      return allBlocked ? 'blocked' : 'unblocked'
    } catch (e) {
      log.error('getStatus() — failed to read hosts file:', e)
      return 'error'
    }
  }

  async getTargetStatuses(config: BlockerConfig): Promise<TargetStatus[]> {
    const { domains } = config as WebsiteConfig
    try {
      const content = await fs.readFile(HOSTS_FILE, 'utf8')
      const statuses = domains.map(d => {
        const blocked = allVariants([d]).every(v => content.includes(makeEntry(v)))
        log.debug(`  "${d}" → ${blocked ? 'blocked' : 'unblocked'}`)
        return { label: d, status: blocked ? 'blocked' as const : 'unblocked' as const }
      })
      log.debug(`getTargetStatuses() — ${statuses.map(s => `${s.label}=${s.status}`).join(', ')}`)
      return statuses
    } catch (e) {
      log.error('getTargetStatuses() — failed to read hosts file:', e)
      return domains.map(d => ({ label: d, status: 'error' as const }))
    }
  }
}
