/**
 * timeSync.ts — server-time offset + timezone cache.
 *
 * Uses two parallel fetches:
 *   A) ipapi.co/json/  → IANA timezone + UTC offset from your IP (server-side, not Windows)
 *   B) google.com HEAD → true UTC time from Date header (~100 ms, no body)
 *
 * cachedOffsetMs = googleUTC − Date.now()   (pure clock drift, NOT timezone offset)
 * cachedTimezone = IANA name from IP (e.g. "Europe/Istanbul")
 *
 * getAdjustedScheduleTime() applies the drift correction, then formats in cachedTimezone
 * via Intl.DateTimeFormat.formatToParts — immune to:
 *   • Clock rollback  (cachedOffsetMs corrects it)
 *   • Windows timezone change  (Intl uses cachedTimezone, not the OS setting)
 *
 * Fallback if google fails: use timeapi.io local time + ipapi utcOffsetMs to recover UTC.
 * Fallback if ipapi fails : cachedTimezone stays '' → schedule check uses JS local time.
 */

import https from 'node:https'
import { IncomingMessage } from 'node:http'
import { createLogger } from './logger'

const log = createLogger('TimeSync')

// ── Module state ──────────────────────────────────────────────────────────────

let cachedOffsetMs   = 0          // server UTC − local UTC (pure clock drift, ≈ 0 for accurate clocks)
let cachedTimezone   = ''         // IANA name from IP; '' until first successful sync
let lastSyncedAt:    Date | null = null
let syncIntervalRef: ReturnType<typeof setInterval> | null = null

// ── Accessors ─────────────────────────────────────────────────────────────────

export function getAdjustedNow(): Date {
  return new Date(Date.now() + cachedOffsetMs)
}

export function getCachedOffsetMs(): number {
  return cachedOffsetMs
}

export function getCachedTimezone(): string {
  return cachedTimezone
}

// Alias kept for backward compat with main.ts
export const getSystemTimezone = getCachedTimezone

export function getLastSyncedAt(): Date | null {
  return lastSyncedAt
}

/**
 * Returns the drift-corrected day-of-week and minute-of-day in the server-detected timezone.
 * isWithinSchedule() uses this — immune to clock rollback AND Windows timezone manipulation.
 */
export function getAdjustedScheduleTime(): { day: number; minutes: number } {
  const adjustedMs = Date.now() + cachedOffsetMs
  const tz         = cachedTimezone

  if (tz) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        weekday:  'short',
        hour:     '2-digit',
        minute:   '2-digit',
        hour12:   false
      }).formatToParts(new Date(adjustedMs))

      const dayMap: Record<string, number> = {
        Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6
      }
      const weekday = parts.find(p => p.type === 'weekday')?.value ?? ''
      const hour    = parseInt(parts.find(p => p.type === 'hour')?.value   ?? '0', 10)
      const minute  = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10)
      const day     = dayMap[weekday]

      if (day !== undefined) {
        log.debug(
          `getAdjustedScheduleTime — tz=${tz} day=${weekday}(${day}) ` +
          `time=${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
        )
        return { day, minutes: hour * 60 + minute }
      }
      log.warn(`getAdjustedScheduleTime — unknown weekday "${weekday}", falling back to local`)
    } catch (e) {
      log.warn(`getAdjustedScheduleTime — Intl error for tz="${tz}": ${(e as Error).message}`)
    }
  }

  const d = new Date(adjustedMs)
  return { day: d.getDay(), minutes: d.getHours() * 60 + d.getMinutes() }
}

// ── Fetch primitives ──────────────────────────────────────────────────────────

interface IpapiResult {
  timezone:    string   // e.g. "Europe/Istanbul"
  utcOffsetMs: number   // e.g. +10800000 for UTC+3
}

/** Parse "+0300" / "-0530" → milliseconds. */
function parseUtcOffset(str: string): number {
  const m = str.match(/([+-])(\d{2})(\d{2})/)
  if (!m) return 0
  const sign = m[1] === '+' ? 1 : -1
  return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10)) * 60_000
}

/**
 * GET ipapi.co/json/ — returns the caller's IANA timezone and UTC offset in one shot.
 * Server-side detection: not affected by Windows timezone/clock settings.
 */
function fetchFromIpapi(): Promise<IpapiResult> {
  return new Promise((resolve, reject) => {
    log.debug('fetchFromIpapi — GET https://ipapi.co/json/')
    const req = https.get(
      { hostname: 'ipapi.co', path: '/json/', headers: { 'User-Agent': 'DeepOcean/1.0' } },
      (res: IncomingMessage) => {
        if (res.statusCode !== 200) {
          res.resume()
          reject(new Error(`ipapi.co returned HTTP ${res.statusCode}`))
          return
        }
        let body = ''
        res.on('data', (chunk: string) => { body += chunk })
        res.on('end', () => {
          try {
            const j = JSON.parse(body)
            if (!j.timezone || !j.utc_offset) throw new Error('Missing timezone/utc_offset fields')
            const utcOffsetMs = parseUtcOffset(j.utc_offset as string)
            log.debug(`fetchFromIpapi — tz="${j.timezone}" utc_offset="${j.utc_offset}" → ${utcOffsetMs}ms`)
            resolve({ timezone: j.timezone as string, utcOffsetMs })
          } catch (e) {
            reject(new Error(`ipapi.co parse error: ${(e as Error).message}`))
          }
        })
        res.on('error', reject)
      }
    )
    req.setTimeout(7000, () => req.destroy(new Error('ipapi.co timed out after 7 s')))
    req.on('error', reject)
  })
}

/**
 * HEAD google.com — Date response header is true UTC (~100 ms, no body needed).
 * Returns UTC milliseconds since epoch.
 */
function fetchUtcFromGoogle(): Promise<number> {
  return new Promise((resolve, reject) => {
    log.debug('fetchUtcFromGoogle — HEAD https://www.google.com')
    const req = https.request(
      { hostname: 'www.google.com', method: 'HEAD', path: '/' },
      (res: IncomingMessage) => {
        const dateStr = res.headers['date'] as string | undefined
        res.resume()
        if (!dateStr) { reject(new Error('No Date header')); return }
        const ms = new Date(dateStr).getTime()
        if (isNaN(ms)) { reject(new Error(`Cannot parse Date header "${dateStr}"`)); return }
        log.debug(`fetchUtcFromGoogle — Date="${dateStr}" → ${ms}`)
        resolve(ms)
      }
    )
    req.setTimeout(5000, () => req.destroy(new Error('google.com timed out after 5 s')))
    req.on('error', reject)
    req.end()
  })
}

/**
 * GET timeapi.io for the given timezone — returns the LOCAL time as-is.
 * NOT to be confused with UTC; the returned fields are the wall-clock local values.
 * Used as a fallback when google.com is unavailable; caller must subtract utcOffsetMs
 * to recover the true UTC milliseconds before computing cachedOffsetMs.
 */
function fetchLocalTimeFromTimapiIo(timezone: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const path = `/api/time/current/zone?timeZone=${encodeURIComponent(timezone)}`
    log.debug(`fetchLocalTimeFromTimapiIo — GET https://timeapi.io${path}`)
    const req = https.get(
      { hostname: 'timeapi.io', path, headers: { Accept: 'application/json' } },
      (res: IncomingMessage) => {
        if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return }
        let body = ''
        res.on('data', (chunk: string) => { body += chunk })
        res.on('end', () => {
          try {
            const j = JSON.parse(body)
            // These values are LOCAL time in the requested timezone — treat as UTC via Date.UTC
            // so we can do arithmetic. Caller subtracts utcOffsetMs to get real UTC.
            const localAsUtcMs = Date.UTC(
              j.year, j.month - 1, j.day,
              j.hour, j.minute, j.seconds, j.milliSeconds ?? 0
            )
            if (isNaN(localAsUtcMs)) throw new Error('NaN timestamp from timeapi.io')
            log.debug(`fetchLocalTimeFromTimapiIo — local="${j.dateTime}" tz=${j.timeZone}`)
            resolve(localAsUtcMs)
          } catch (e) {
            reject(new Error(`timeapi.io parse error: ${(e as Error).message}`))
          }
        })
        res.on('error', reject)
      }
    )
    req.setTimeout(8000, () => req.destroy(new Error('timeapi.io timed out after 8 s')))
    req.on('error', reject)
  })
}

// ── Main sync ─────────────────────────────────────────────────────────────────

export interface TimeSyncResult {
  serverTime: string   // ISO-8601 UTC string
  localTime:  string   // ISO-8601 UTC string (Date.now() at call time)
  offsetMs:   number   // pure clock drift: serverUTC − localUTC (NOT timezone offset)
  timezone:   string   // IANA name, server-detected from IP
  source:     string
}

/**
 * Fetch server time + IP timezone, cache the offset, return a full result.
 *
 * Strategy:
 *   Step 1 — ipapi.co/json/ gives timezone + UTC offset (always required first).
 *             google.com HEAD runs in parallel so it's ready as a fallback.
 *   Step 2 — timeapi.io (primary time source) called with the IP-detected timezone.
 *             Subtract ipapi's utcOffset to recover true UTC from the local time value.
 *   Step 3 — If timeapi.io fails, use google.com's UTC result (already available).
 *   Fail    — If ipapi AND google both fail, throw.
 */
export async function fetchAndCacheOffset(): Promise<TimeSyncResult> {
  const localMs = Date.now()

  log.info('fetchAndCacheOffset — step 1: fetching ipapi.co + google.com in parallel…')

  // ipapi gives us timezone+utcOffset; google runs in parallel so it's ready as fallback
  const [ipapiResult, googleResult] = await Promise.allSettled([
    fetchFromIpapi(),
    fetchUtcFromGoogle()
  ])

  log.debug(`Step 1 — ipapi: ${ipapiResult.status}  google: ${googleResult.status}`)

  // Resolve timezone + UTC offset
  let resolvedTimezone  = ''
  let resolvedUtcOffset = 0

  if (ipapiResult.status === 'fulfilled') {
    resolvedTimezone  = ipapiResult.value.timezone
    resolvedUtcOffset = ipapiResult.value.utcOffsetMs
    log.info(`IP timezone: "${resolvedTimezone}" (UTC${resolvedUtcOffset >= 0 ? '+' : ''}${resolvedUtcOffset / 3_600_000}h)`)
  } else {
    log.warn(`ipapi.co failed: ${(ipapiResult.reason as Error).message}`)
  }

  let serverUtcMs: number
  let source: string

  if (resolvedTimezone) {
    // Step 2: try timeapi.io with the IP-detected timezone (primary time source)
    log.info(`Step 2 — trying timeapi.io for timezone "${resolvedTimezone}"…`)
    try {
      const localAsUtcMs = await fetchLocalTimeFromTimapiIo(resolvedTimezone)
      // timeapi.io returns LOCAL wall-clock time; subtract UTC offset to get true UTC
      serverUtcMs = localAsUtcMs - resolvedUtcOffset
      source      = 'timeapi.io + ipapi.co'
      log.info(
        `timeapi.io local=${new Date(localAsUtcMs).toISOString()} ` +
        `− offset ${resolvedUtcOffset}ms → serverUTC=${new Date(serverUtcMs).toISOString()}`
      )
    } catch (timapioErr) {
      log.warn(`timeapi.io failed: ${(timapioErr as Error).message} — falling back to google.com`)
      if (googleResult.status === 'fulfilled') {
        serverUtcMs = googleResult.value
        source      = 'google.com + ipapi.co'
        log.info(`UTC from google fallback: ${new Date(serverUtcMs).toISOString()}`)
      } else {
        const msg =
          `All time sources failed — ` +
          `timeapi.io: ${(timapioErr as Error).message}; ` +
          `google.com: ${(googleResult.reason as Error).message}`
        log.error(msg)
        throw new Error(msg)
      }
    }
  } else {
    // ipapi failed — no timezone. Use google for time (no timezone anti-spoof protection).
    if (googleResult.status === 'fulfilled') {
      serverUtcMs = googleResult.value
      source      = 'google.com (no IP timezone)'
      log.warn(`Using google fallback without IP timezone — timezone manipulation bypass not prevented`)
    } else {
      const msg =
        `All sources failed — ` +
        `ipapi.co: ${(ipapiResult.reason as Error).message}; ` +
        `google.com: ${(googleResult.reason as Error).message}`
      log.error(msg)
      throw new Error(msg)
    }
  }

  const newOffset    = serverUtcMs - localMs
  const driftChanged = Math.abs(newOffset - cachedOffsetMs) > 500

  cachedOffsetMs = newOffset
  cachedTimezone = resolvedTimezone
  lastSyncedAt   = new Date()

  log.info(
    `Sync complete via ${source} — ` +
    `tz="${resolvedTimezone}" ` +
    `clockDrift=${newOffset >= 0 ? '+' : ''}${newOffset}ms ` +
    `serverUTC=${new Date(serverUtcMs).toISOString()} ` +
    `local=${new Date(localMs).toISOString()}` +
    (driftChanged ? ' ← drift changed' : '')
  )

  return {
    serverTime: new Date(serverUtcMs).toISOString(),
    localTime:  new Date(localMs).toISOString(),
    offsetMs:   newOffset,
    timezone:   resolvedTimezone,
    source
  }
}

// ── Periodic sync ─────────────────────────────────────────────────────────────

export function startPeriodicSync(): void {
  if (syncIntervalRef) {
    log.debug('startPeriodicSync — already running, skipping duplicate')
    return
  }
  log.info('startPeriodicSync — scheduling re-sync every 30 min')
  syncIntervalRef = setInterval(async () => {
    log.debug('Periodic re-sync firing')
    try {
      const r = await fetchAndCacheOffset()
      log.info(`Periodic re-sync OK — drift=${r.offsetMs}ms tz="${r.timezone}" via ${r.source}`)
    } catch (e) {
      log.warn(
        `Periodic re-sync failed: ${(e as Error).message} — ` +
        `continuing with cached drift=${cachedOffsetMs}ms tz="${cachedTimezone}"`
      )
    }
  }, 30 * 60 * 1000)
}

export function stopPeriodicSync(): void {
  if (syncIntervalRef) {
    clearInterval(syncIntervalRef)
    syncIntervalRef = null
    const prev = cachedOffsetMs
    cachedOffsetMs = 0
    lastSyncedAt   = null
    log.info(`stopPeriodicSync — cleared, drift reset from ${prev}ms → 0`)
  } else {
    log.debug('stopPeriodicSync — nothing to stop')
  }
}
