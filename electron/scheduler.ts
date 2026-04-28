import cron, { type ScheduledTask } from 'node-cron'
import { BrowserWindow } from 'electron'
import type { Rule, Schedule } from '../types'
import { BlockerEngine } from './blockers/BlockerEngine'
import { store } from './store'
import { notify } from './notifications'

let activeTasks: ScheduledTask[] = []

function sendStatusUpdate(id: string, status: Rule['status']): void {
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) win.webContents.send('rules:status-update', { id, status })
  })
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

/**
 * Returns a time string N minutes before the given "HH:MM" time.
 * Returns null if the result would be negative (i.e. lockTime is too close to midnight).
 */
function minutesBefore(time: string, minutes: number): string | null {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m - minutes
  if (total < 0) return null
  const nh = Math.floor(total / 60)
  const nm = total % 60
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
}

function isWithinSchedule(schedules: Schedule[]): boolean {
  const now = new Date()
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

  for (const rule of rules) {
    for (const schedule of rule.schedules) {
      // Lock task
      const blockTask = cron.schedule(toCron(schedule.lockTime, schedule.days), async () => {
        try {
          updateRuleStatus(rule.id, 'locking')
          sendStatusUpdate(rule.id, 'locking')
          await BlockerEngine.block(rule)
          updateRuleStatus(rule.id, 'blocked')
          sendStatusUpdate(rule.id, 'blocked')
          notify('DeepOcean — Blocked', rule.label)
        } catch (e) {
          console.error('[scheduler] block error', e)
          updateRuleStatus(rule.id, 'error')
          sendStatusUpdate(rule.id, 'error')
        }
      })
      activeTasks.push(blockTask)

      // Unlock task
      const unblockTask = cron.schedule(toCron(schedule.unlockTime, schedule.days), async () => {
        try {
          updateRuleStatus(rule.id, 'unlocking')
          sendStatusUpdate(rule.id, 'unlocking')
          await BlockerEngine.unblock(rule)
          updateRuleStatus(rule.id, 'unblocked')
          sendStatusUpdate(rule.id, 'unblocked')
          notify('DeepOcean — Unblocked', rule.label)
        } catch (e) {
          console.error('[scheduler] unblock error', e)
          updateRuleStatus(rule.id, 'error')
          sendStatusUpdate(rule.id, 'error')
        }
      })
      activeTasks.push(unblockTask)

      // Pre-notification task (fires N minutes before lock)
      if (preNotificationMinutes > 0) {
        const preTime = minutesBefore(schedule.lockTime, preNotificationMinutes)
        if (preTime) {
          const preTask = cron.schedule(toCron(preTime, schedule.days), () => {
            notify(
              `DeepOcean — Locking in ${preNotificationMinutes} min`,
              rule.label
            )
          })
          activeTasks.push(preTask)
        }
      }
    }

    // On startup: reconcile actual filesystem state with the schedule
    const shouldBeBlocked = rule.schedules.length > 0 && isWithinSchedule(rule.schedules)
    if (shouldBeBlocked && rule.status !== 'blocked') {
      BlockerEngine.block(rule).catch(e => console.error('[scheduler] startup block error', e))
    } else if (!shouldBeBlocked && rule.status === 'blocked') {
      BlockerEngine.unblock(rule).catch(e => console.error('[scheduler] startup unblock error', e))
    }
  }
}

export function reloadScheduler(): void {
  activeTasks.forEach(t => t.stop())
  activeTasks = []
  initScheduler()
}
