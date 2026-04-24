import cron from 'node-cron'
import type { Rule, Schedule } from '../types'
import { BlockerEngine } from './blockers/BlockerEngine'
import { store } from './store'
import { notify } from './notifications'

function toCron(time: string, days: number[]): string {
  const [hour, minute] = time.split(':')
  const dayStr = days.join(',')
  return `${minute} ${hour} * * ${dayStr}`
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

  for (const rule of rules) {
    for (const schedule of rule.schedules) {
      cron.schedule(toCron(schedule.lockTime, schedule.days), async () => {
        try {
          await BlockerEngine.block(rule)
          notify(`DeepOcean — Blocked`, rule.label)
        } catch (e) {
          console.error('[scheduler] block error', e)
        }
      })

      cron.schedule(toCron(schedule.unlockTime, schedule.days), async () => {
        try {
          await BlockerEngine.unblock(rule)
          notify(`DeepOcean — Unblocked`, rule.label)
        } catch (e) {
          console.error('[scheduler] unblock error', e)
        }
      })
    }

    const shouldBeBlocked = isWithinSchedule(rule.schedules)
    if (shouldBeBlocked) {
      BlockerEngine.block(rule).catch(e => console.error('[scheduler] startup block error', e))
    } else {
      BlockerEngine.unblock(rule).catch(e => console.error('[scheduler] startup unblock error', e))
    }
  }
}

export function reloadScheduler(): void {
  cron.getTasks().forEach(task => task.stop())
  initScheduler()
}
