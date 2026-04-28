/**
 * Shared logger for the DeepOcean main process.
 *
 * Format:  YYYY-MM-DD HH:MM:SS.mmm  LEVEL  [Module]  message
 * Example: 2026-04-28 14:32:01.045  INFO   [Scheduler]  Startup reconcile — "Mc Rules" shouldBeBlocked=true
 *
 * Levels
 *  INFO  — normal lifecycle events (app start, rule enable/disable, block/unblock)
 *  WARN  — unexpected but recoverable situations
 *  ERROR — failures that affect correctness
 *  DEBUG — high-frequency / very detailed traces (status checks, icacls output)
 */

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'

function ts(): string {
  const n = new Date()
  const pad2 = (v: number) => String(v).padStart(2, '0')
  const pad3 = (v: number) => String(v).padStart(3, '0')
  return (
    `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())} ` +
    `${pad2(n.getHours())}:${pad2(n.getMinutes())}:${pad2(n.getSeconds())}.${pad3(n.getMilliseconds())}`
  )
}

// Right-pad level to 5 chars so columns stay aligned
const PADDED: Record<LogLevel, string> = {
  INFO:  'INFO ',
  WARN:  'WARN ',
  ERROR: 'ERROR',
  DEBUG: 'DEBUG',
}

export interface Logger {
  info:  (...args: unknown[]) => void
  warn:  (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  /** High-frequency / verbose detail — polls, icacls lines, etc. */
  debug: (...args: unknown[]) => void
}

export function createLogger(module: string): Logger {
  const fmt = (level: LogLevel) => `${ts()}  ${PADDED[level]}  [${module}]`
  return {
    info:  (...a) => console.log  (fmt('INFO'),  ...a),
    warn:  (...a) => console.warn (fmt('WARN'),  ...a),
    error: (...a) => console.error(fmt('ERROR'), ...a),
    debug: (...a) => console.log  (fmt('DEBUG'), ...a),
  }
}
