/**
 * timeSync.ts — server-time offset cache.
 *
 * When useServerTime is enabled the scheduler uses getAdjustedNow() instead of
 * new Date() so that manually rolling back the system clock cannot bypass a lock.
 *
 * The offset is fetched by reading the RFC 7231 `Date` response header from
 * google.com (a HEAD request — no body, extremely fast, no auth, no JSON parsing).
 * Falls back to offset = 0 (local time) if the network is unavailable.
 */

import https from 'node:https'
import { createLogger } from './logger'

const log = createLogger('TimeSync')

let cachedOffsetMs  = 0
let lastSyncedAt: Date | null = null
let syncIntervalRef: ReturnType<typeof setInterval> | null = null

export function getAdjustedNow(): Date {
  return new Date(Date.now() + cachedOffsetMs)
}

export function getCachedOffsetMs(): number {
  return cachedOffsetMs
}

export function getLastSyncedAt(): Date | null {
  return lastSyncedAt
}

/** Fetch server time via the Date response header — fast, proxy-aware, no third-party API. */
export async function fetchAndCacheOffset(): Promise<{
  serverTime: string
  localTime: string
  offsetMs: number
}> {
  return new Promise((resolve, reject) => {
    // Use a HEAD request — only headers, no body transfer
    const req = https.request(
      { hostname: 'google.com', method: 'HEAD', path: '/', timeout: 6000 },
      (res) => {
        const dateStr = res.headers['date']
        res.resume()  // consume response to free socket

        if (!dateStr) {
          reject(new Error('No Date header in response'))
          return
        }

        const serverMs = new Date(dateStr).getTime()
        const localMs  = Date.now()
        cachedOffsetMs = serverMs - localMs
        lastSyncedAt   = new Date()

        log.info(
          `Time synced — offset=${cachedOffsetMs}ms ` +
          `server=${new Date(serverMs).toISOString()} ` +
          `local=${new Date(localMs).toISOString()}`
        )

        resolve({
          serverTime: new Date(serverMs).toISOString(),
          localTime:  new Date(localMs).toISOString(),
          offsetMs:   cachedOffsetMs
        })
      }
    )
    req.on('error', (e) => {
      log.error('Time sync request failed:', e)
      reject(e)
    })
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timed out'))
    })
    req.end()
  })
}

/** Start periodic re-sync (every 30 minutes). Call when useServerTime is enabled. */
export function startPeriodicSync(): void {
  stopPeriodicSync()
  log.info('Starting periodic time sync (every 30 min)')
  fetchAndCacheOffset().catch(e => log.warn('Initial time sync failed:', e))
  syncIntervalRef = setInterval(() => {
    fetchAndCacheOffset().catch(e => log.warn('Periodic time sync failed:', e))
  }, 30 * 60 * 1000)
}

/** Stop periodic re-sync. Call when useServerTime is disabled. */
export function stopPeriodicSync(): void {
  if (syncIntervalRef) {
    clearInterval(syncIntervalRef)
    syncIntervalRef = null
    cachedOffsetMs  = 0
    lastSyncedAt    = null
    log.info('Stopped periodic time sync — offset reset to 0')
  }
}
