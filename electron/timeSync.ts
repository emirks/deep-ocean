/**
 * timeSync.ts — server-time offset cache.
 *
 * Primary source: timeapi.io (JSON response with millisecond precision).
 * Fallback source: google.com HEAD request Date header (RFC 7231, second precision).
 *
 * When useServerTime is enabled the scheduler uses getAdjustedNow() so that
 * manually rolling back the system clock cannot bypass a scheduled lock.
 *
 * worldtimeapi.org was tested and is unreachable — not used.
 */

import https from 'node:https'
import { IncomingMessage } from 'node:http'
import { createLogger } from './logger'

const log = createLogger('TimeSync')

let cachedOffsetMs  = 0
let lastSyncedAt:   Date | null = null
let syncIntervalRef: ReturnType<typeof setInterval> | null = null

// ── Public accessors ──────────────────────────────────────────────────────────

export function getAdjustedNow(): Date {
  return new Date(Date.now() + cachedOffsetMs)
}

export function getCachedOffsetMs(): number {
  return cachedOffsetMs
}

export function getLastSyncedAt(): Date | null {
  return lastSyncedAt
}

// ── Internal fetch helpers ────────────────────────────────────────────────────

/** GET https://timeapi.io — returns full JSON body with millisecond precision. */
function fetchViaTimapiIo(): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = 'https://timeapi.io/api/time/current/zone?timeZone=Etc%2FUTC'
    log.debug(`fetchViaTimapiIo — GET ${url}`)

    const req = https.get(url, (res: IncomingMessage) => {
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`timeapi.io returned HTTP ${res.statusCode}`))
        return
      }
      let body = ''
      res.on('data', (chunk: string) => { body += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(body)
          // Build UTC timestamp from explicit fields — avoids timezone parsing ambiguity
          const serverMs = Date.UTC(
            json.year, json.month - 1, json.day,
            json.hour, json.minute, json.seconds, json.milliSeconds ?? 0
          )
          if (isNaN(serverMs)) throw new Error('Parsed timestamp is NaN')
          log.debug(`fetchViaTimapiIo — raw datetime="${json.dateTime}" → ${new Date(serverMs).toISOString()}`)
          resolve(serverMs)
        } catch (e) {
          reject(new Error(`timeapi.io parse error: ${(e as Error).message} — body: ${body.slice(0, 200)}`))
        }
      })
      res.on('error', reject)
    })

    req.setTimeout(8000, () => {
      req.destroy(new Error('timeapi.io request timed out after 8 s'))
    })
    req.on('error', (e) => reject(e))
  })
}

/** HEAD https://www.google.com — reads Date response header (1 s precision, no body). */
function fetchViaGoogleDateHeader(): Promise<number> {
  return new Promise((resolve, reject) => {
    log.debug('fetchViaGoogleDateHeader — HEAD https://www.google.com')

    const req = https.request(
      { hostname: 'www.google.com', method: 'HEAD', path: '/', timeout: 5000 },
      (res: IncomingMessage) => {
        const dateStr = res.headers['date'] as string | undefined
        res.resume() // consume to free socket

        if (!dateStr) {
          reject(new Error('google.com HEAD: no Date header in response'))
          return
        }
        const serverMs = new Date(dateStr).getTime()
        if (isNaN(serverMs)) {
          reject(new Error(`google.com HEAD: could not parse Date header "${dateStr}"`))
          return
        }
        log.debug(`fetchViaGoogleDateHeader — Date header="${dateStr}" → ${new Date(serverMs).toISOString()}`)
        resolve(serverMs)
      }
    )

    req.setTimeout(5000, () => {
      req.destroy(new Error('google.com HEAD request timed out after 5 s'))
    })
    req.on('error', (e) => reject(e))
    req.end()
  })
}

// ── Public sync API ───────────────────────────────────────────────────────────

/**
 * Fetch server time, cache the offset, return result.
 * Tries timeapi.io first, falls back to Google Date header.
 */
export async function fetchAndCacheOffset(): Promise<{
  serverTime: string
  localTime: string
  offsetMs: number
  source: string
}> {
  const localMs = Date.now()
  let serverMs: number
  let source: string

  try {
    serverMs = await fetchViaTimapiIo()
    source = 'timeapi.io'
    log.debug('Primary source (timeapi.io) succeeded')
  } catch (primaryErr) {
    log.warn(`Primary source failed (${(primaryErr as Error).message}) — falling back to google.com Date header`)
    try {
      serverMs = await fetchViaGoogleDateHeader()
      source = 'google.com (Date header)'
    } catch (fallbackErr) {
      log.error(`Both time sources failed. Primary: ${(primaryErr as Error).message} | Fallback: ${(fallbackErr as Error).message}`)
      throw new Error(
        `Time sync failed — timeapi.io: ${(primaryErr as Error).message}; google.com: ${(fallbackErr as Error).message}`
      )
    }
  }

  const newOffset = serverMs - localMs
  const driftChanged = Math.abs(newOffset - cachedOffsetMs) > 500

  cachedOffsetMs = newOffset
  lastSyncedAt   = new Date()

  log.info(
    `Time synced via ${source} — ` +
    `offset=${newOffset >= 0 ? '+' : ''}${newOffset}ms ` +
    `server=${new Date(serverMs).toISOString()} ` +
    `local=${new Date(localMs).toISOString()}` +
    (driftChanged ? ` (drift changed)` : '')
  )

  return {
    serverTime: new Date(serverMs).toISOString(),
    localTime:  new Date(localMs).toISOString(),
    offsetMs:   newOffset,
    source
  }
}

/**
 * Start a periodic re-sync interval (every 30 min).
 * Does NOT perform an immediate sync — caller should await fetchAndCacheOffset() first.
 */
export function startPeriodicSync(): void {
  if (syncIntervalRef) {
    log.debug('startPeriodicSync — interval already running, skipping')
    return
  }
  log.info('startPeriodicSync — scheduling re-sync every 30 min')
  syncIntervalRef = setInterval(async () => {
    log.debug('Periodic re-sync firing')
    try {
      const result = await fetchAndCacheOffset()
      log.info(`Periodic re-sync complete — offset=${result.offsetMs}ms via ${result.source}`)
    } catch (e) {
      log.warn(`Periodic re-sync failed: ${(e as Error).message} — continuing with last offset=${cachedOffsetMs}ms`)
    }
  }, 30 * 60 * 1000)
}

/** Stop periodic re-sync and reset offset to 0 (back to local time). */
export function stopPeriodicSync(): void {
  if (syncIntervalRef) {
    clearInterval(syncIntervalRef)
    syncIntervalRef = null
    const prev = cachedOffsetMs
    cachedOffsetMs  = 0
    lastSyncedAt    = null
    log.info(`stopPeriodicSync — interval cleared, offset reset 0 (was ${prev}ms)`)
  } else {
    log.debug('stopPeriodicSync — no interval was running')
  }
}
