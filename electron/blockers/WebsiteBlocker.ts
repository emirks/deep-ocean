import { promises as fs } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { BlockerConfig, WebsiteConfig, RuleStatus } from '../../types'
import type { IBlocker } from './BaseBlocker'

const execFileAsync = promisify(execFile)

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
    await execFileAsync('ipconfig', ['/flushdns'])
  } catch { /* non-fatal */ }
}

export class WebsiteBlocker implements IBlocker {
  readonly type = 'website'
  readonly label = 'Website'

  validate(config: BlockerConfig): boolean {
    const c = config as WebsiteConfig
    return Array.isArray(c.domains) && c.domains.length > 0
  }

  async block(config: BlockerConfig): Promise<void> {
    const variants = allVariants((config as WebsiteConfig).domains)
    const content = await fs.readFile(HOSTS_FILE, 'utf8')
    const newEntries = variants
      .filter(d => !content.includes(makeEntry(d)))
      .map(makeEntry)
    if (newEntries.length === 0) return
    await fs.appendFile(HOSTS_FILE, '\n' + newEntries.join('\n') + '\n')
    await flushDns()
  }

  async unblock(config: BlockerConfig): Promise<void> {
    const variants = allVariants((config as WebsiteConfig).domains)
    const content = await fs.readFile(HOSTS_FILE, 'utf8')
    const filtered = content
      .split('\n')
      .filter(line => !variants.some(d => line.trimEnd() === makeEntry(d)))
      .join('\n')
    await fs.writeFile(HOSTS_FILE, filtered, 'utf8')
    await flushDns()
  }

  async getStatus(config: BlockerConfig): Promise<RuleStatus> {
    const variants = allVariants((config as WebsiteConfig).domains)
    try {
      const content = await fs.readFile(HOSTS_FILE, 'utf8')
      const allBlocked = variants.every(d => content.includes(makeEntry(d)))
      return allBlocked ? 'blocked' : 'unblocked'
    } catch {
      return 'error'
    }
  }
}
