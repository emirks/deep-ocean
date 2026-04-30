/**
 * autoLaunch.ts — Windows Task Scheduler-based auto-launch for elevated apps.
 *
 * app.setLoginItemSettings() writes to HKCU\...\Run, which Windows silently
 * ignores for executables that carry a requireAdministrator UAC manifest —
 * startup items run before elevation and Windows won't auto-elevate them.
 *
 * Task Scheduler with /rl HIGHEST is the correct solution: the task runs at
 * user logon with "highest available" privileges (admin without a UAC prompt
 * for users who are members of the Administrators group).
 *
 * All functions are no-ops when app.isPackaged === false so that running
 * `pnpm dev` never registers the raw Electron binary as a startup entry.
 *
 * To test without rebooting (admin cmd):
 *   schtasks /run /tn "DeepOcean"
 *
 * To verify the task was created:
 *   schtasks /query /tn "DeepOcean"
 * or open Task Scheduler → Task Scheduler Library → DeepOcean.
 */

import { execSync } from 'node:child_process'
import { app } from 'electron'
import { createLogger } from './logger'

const log = createLogger('AutoLaunch')

const TASK_NAME = 'DeepOcean'

/**
 * Registers a Task Scheduler logon task that re-launches this executable
 * with /rl HIGHEST (admin-level, no UAC prompt for Administrators).
 * Safe to call repeatedly — /f overwrites any existing task.
 */
export function enableAutoLaunch(): void {
  if (!app.isPackaged) {
    log.info('enableAutoLaunch — skipped in dev mode (app not packaged)')
    return
  }
  const exePath = process.execPath
  // /sc ONLOGON  → trigger: at logon of the current user
  // /rl HIGHEST  → run with highest available privileges (no UAC prompt)
  // /f           → overwrite if a task with this name already exists
  const cmd =
    `schtasks /create /tn "${TASK_NAME}" ` +
    `/tr "\\"${exePath}\\"" ` +
    `/sc ONLOGON /rl HIGHEST /f`
  log.info(`enableAutoLaunch — ${cmd}`)
  try {
    execSync(cmd, { stdio: 'ignore' })
    log.info('enableAutoLaunch — task created successfully')
  } catch (e) {
    log.error(`enableAutoLaunch — schtasks failed: ${(e as Error).message}`)
    throw e
  }
}

/**
 * Removes the Task Scheduler logon task. Swallows the error if the task
 * does not exist (safe to call when already disabled).
 */
export function disableAutoLaunch(): void {
  if (!app.isPackaged) {
    log.info('disableAutoLaunch — skipped in dev mode (app not packaged)')
    return
  }
  log.info('disableAutoLaunch — removing task')
  try {
    execSync(`schtasks /delete /tn "${TASK_NAME}" /f`, { stdio: 'ignore' })
    log.info('disableAutoLaunch — task removed')
  } catch {
    log.debug('disableAutoLaunch — task not found, nothing to remove')
  }
}

/**
 * Returns true if the Task Scheduler entry currently exists.
 * Used on startup to reconcile the stored launchAtStartup setting with
 * the actual task state (e.g. if the user manually deleted the task).
 */
export function isAutoLaunchEnabled(): boolean {
  if (!app.isPackaged) return false
  try {
    execSync(`schtasks /query /tn "${TASK_NAME}"`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
