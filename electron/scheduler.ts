import cron, { type ScheduledTask } from 'node-cron'
import { BrowserWindow } from 'electron'
import type { Rule, Schedule } from '../types'
import { BlockerEngine } from './blockers/BlockerEngine'
import { store } from './store'
import { notify } from './notifications'
import { createLogger } from './logger'
import { getAdjustedNow } from './timeSync'

const log = createLogger('Scheduler')

let activeTasks: ScheduledTask[] = []

function sendStatusUpdate(id: string, status: Rule['status']): void {
  const wins = BrowserWindow.getAllWindows().filter(w => !w.isDestroyed())
  log.debug(`sendStatusUpdate — id=${id} status=${status} — ${wins.length} window(s) reachable`)
  wins.forEach(win => win.webContents.send('rules:status-update', { id, status }))
}

function updateRuleStatus(id: string, status: Rule['status']): void {
  const rules = store.get('rules')
  store.set('rules', rules.map(r => r.id === id ? { ...r, status } : r))
}

function toCron(time: string, days: number[]): string {
  const [hour, minute] = time.split(':')
  const dayStr = days.length ? days.join(',') : '*'
  return `${minute} ${hour} * * ${dayStr}`
}

function minutesBefore(time: string, minutes: number): string | null {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m - minutes
  if (total < 0) return null
  const nh = Math.floor(total / 60)
  const nm = total % 60
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
}

/**
 * Exported so main.ts can use it for immediate enable/disable decisions.
 * Uses getAdjustedNow() which applies the server-time offset when useServerTime is on.
 */
export function isWithinSchedule(schedules: Schedule[]): boolean {
  const now = getAdjustedNow()
  const day = now.getDay()
  const minutes = now.getHours() * 60 + now.getMinutes()
  return schedules.some(s => {
    const [lh, lm] = s.lockTime.split(':').map(Number)
    const [uh, um] = s.unlockTime.split(':').map(Number)
    const lockMins   = lh * 60 + lm
    const unlockMins = uh * 60 + um
    return s.days.includes(day) && minutes >= lockMins && minutes < unlockMins
  })
}

export function initScheduler(): void {
  const rules = store.get('rules') as Rule[]
  const { preNotificationMinutes } = store.get('settings')
  const enabled = rules.filter(r => r.enabled)
  const disabled = rules.filter(r => !r.enabled)

  log.info(`initScheduler — ${rules.length} rule(s) total (${enabled.length} enabled, ${disabled.length} disabled)`)

  for (const rule of rules) {
    if (!rule.enabled) {
      log.info(`  "${rule.label}" disabled — clearing any lingering OS locks`)
      BlockerEngine.unblock(rule).catch(e => log.warn(`  Unblock of disabled rule "${rule.label}" failed (may be clean):`, e))
      continue
    }

    // ── Register cron jobs ────────────────────────────────────────────────────

    for (const schedule of rule.schedules) {
      const lockCron   = toCron(schedule.lockTime,   schedule.days)
      const unlockCron = toCron(schedule.unlockTime, schedule.days)
      log.debug(`  "${rule.label}" — registering cron lock=${lockCron}  unlock=${unlockCron}`)

      const blockTask = cron.schedule(lockCron, async () => {
        log.info(`Cron LOCK fired — "${rule.label}" (${schedule.lockTime})`)
        try {
          updateRuleStatus(rule.id, 'locking')
          sendStatusUpdate(rule.id, 'locking')
          await BlockerEngine.block(rule)
          updateRuleStatus(rule.id, 'blocked')
          sendStatusUpdate(rule.id, 'blocked')
          log.info(`Cron LOCK complete — "${rule.label}"`)
          notify('DeepOcean — Locked', rule.label)
        } catch (e) {
          log.error(`Cron LOCK failed — "${rule.label}":`, e)
          updateRuleStatus(rule.id, 'error')
          sendStatusUpdate(rule.id, 'error')
        }
      })
      activeTasks.push(blockTask)

      const unblockTask = cron.schedule(unlockCron, async () => {
        log.info(`Cron UNLOCK fired — "${rule.label}" (${schedule.unlockTime})`)
        try {
          updateRuleStatus(rule.id, 'unlocking')
          sendStatusUpdate(rule.id, 'unlocking')
          await BlockerEngine.unblock(rule)
          updateRuleStatus(rule.id, 'unblocked')
          sendStatusUpdate(rule.id, 'unblocked')
          log.info(`Cron UNLOCK complete — "${rule.label}"`)
          notify('DeepOcean — Unlocked', rule.label)
        } catch (e) {
          log.error(`Cron UNLOCK failed — "${rule.label}":`, e)
          updateRuleStatus(rule.id, 'error')
          sendStatusUpdate(rule.id, 'error')
        }
      })
      activeTasks.push(unblockTask)

      if (preNotificationMinutes > 0) {
        const preTime = minutesBefore(schedule.lockTime, preNotificationMinutes)
        if (preTime) {
          const preCron = toCron(preTime, schedule.days)
          log.debug(`  "${rule.label}" — registering pre-notify cron=${preCron} (${preNotificationMinutes} min before lock)`)
          const preTask = cron.schedule(preCron, () => {
            log.info(`Pre-lock notification — "${rule.label}" locking in ${preNotificationMinutes} min`)
            notify(`DeepOcean — Locking in ${preNotificationMinutes} min`, rule.label)
          })
          activeTasks.push(preTask)
        }
      }
    }

    // ── Startup reconciliation ────────────────────────────────────────────────

    const shouldBeBlocked = isWithinSchedule(rule.schedules)
    log.info(`  "${rule.label}" startup reconcile — shouldBeBlocked=${shouldBeBlocked}`)

    if (shouldBeBlocked) {
      BlockerEngine.block(rule)
        .then(() => {
          log.info(`  "${rule.label}" startup block applied`)
          updateRuleStatus(rule.id, 'blocked')
          sendStatusUpdate(rule.id, 'blocked')
        })
        .catch(e => {
          log.error(`  "${rule.label}" startup block failed:`, e)
          updateRuleStatus(rule.id, 'error')
          sendStatusUpdate(rule.id, 'error')
        })
    } else {
      BlockerEngine.unblock(rule)
        .then(() => {
          log.info(`  "${rule.label}" startup unblock applied`)
          updateRuleStatus(rule.id, 'unblocked')
          sendStatusUpdate(rule.id, 'unblocked')
        })
        .catch(e => {
          log.error(`  "${rule.label}" startup unblock failed:`, e)
          updateRuleStatus(rule.id, 'error')
          sendStatusUpdate(rule.id, 'error')
        })
    }
  }

  log.info(`initScheduler — ${activeTasks.length} cron task(s) registered`)
}

export function reloadScheduler(): void {
  log.info(`reloadScheduler — stopping ${activeTasks.length} existing task(s)`)
  activeTasks.forEach(t => t.stop())
  activeTasks = []
  initScheduler()
}
