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

const execFileAsync = promisify(execFile)
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
  } catch { /* process may have already exited */ }
}

async function enforceBlockedApps(): Promise<void> {
  const rules: Rule[] = store.get('rules')
  const blockedAppRules = rules.filter(r => r.type === 'app' && r.status === 'blocked')
  for (const rule of blockedAppRules) {
    const apps = getApps(rule.config as AppConfig)
    for (const { exeName } of apps) {
      if (!exeName) continue
      if (await isProcessRunning(exeName)) {
        await killProcess(exeName)
      }
    }
  }
}

export function startProcessMonitor(): void {
  if (timer) return
  timer = setInterval(() => {
    enforceBlockedApps().catch(e => console.error('[processMonitor]', e))
  }, POLL_INTERVAL_MS)
  enforceBlockedApps().catch(e => console.error('[processMonitor] initial', e))
}

export function stopProcessMonitor(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
