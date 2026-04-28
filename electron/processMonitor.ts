/**
 * Process monitor — polls the process list every POLL_INTERVAL_MS and force-kills
 * any executable matching a currently-blocked app rule, regardless of where on
 * disk the binary lives (closes the "copy the exe" bypass).
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { AppConfig, Rule } from '../types'
import { getApps } from './blockers/AppBlocker'
import { store } from './store'
import { createLogger } from './logger'

const execFileAsync = promisify(execFile)
const log = createLogger('ProcessMonitor')

const POLL_INTERVAL_MS = 5_000

let timer: ReturnType<typeof setInterval> | null = null

async function isProcessRunning(exeName: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('tasklist', [
      '/FI', `IMAGENAME eq ${exeName}`,
      '/NH', '/FO', 'CSV'
    ])
    return stdout.toLowerCase().includes(exeName.toLowerCase())
  } catch {
    return false
  }
}

async function killProcess(exeName: string): Promise<void> {
  try {
    await execFileAsync('taskkill', ['/F', '/IM', exeName])
    log.info(`Killed blocked process "${exeName}"`)
  } catch (e) {
    log.debug(`taskkill "${exeName}" — already exited or could not be killed`)
  }
}

async function enforceBlockedApps(): Promise<void> {
  const rules: Rule[] = store.get('rules')
  const blockedAppRules = rules.filter(r => r.type === 'app' && r.status === 'blocked')

  if (blockedAppRules.length === 0) {
    log.debug('enforceBlockedApps — no blocked app rules, skipping')
    return
  }

  log.debug(`enforceBlockedApps — checking ${blockedAppRules.length} blocked app rule(s)`)
  for (const rule of blockedAppRules) {
    const apps = getApps(rule.config as AppConfig)
    for (const { exeName } of apps) {
      if (!exeName) continue
      const running = await isProcessRunning(exeName)
      if (running) {
        log.warn(`Blocked app "${exeName}" (rule: "${rule.label}") is running — killing`)
        await killProcess(exeName)
      } else {
        log.debug(`  "${exeName}" not running — OK`)
      }
    }
  }
}

export function startProcessMonitor(): void {
  if (timer) {
    log.warn('startProcessMonitor called but monitor is already running')
    return
  }
  log.info(`ProcessMonitor started — polling every ${POLL_INTERVAL_MS / 1000}s`)
  timer = setInterval(() => {
    enforceBlockedApps().catch(e => log.error('enforceBlockedApps interval error:', e))
  }, POLL_INTERVAL_MS)
  enforceBlockedApps().catch(e => log.error('enforceBlockedApps initial run error:', e))
}

export function stopProcessMonitor(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
    log.info('ProcessMonitor stopped')
  }
}
