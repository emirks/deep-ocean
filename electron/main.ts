import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'node:path'
import { v4 as uuidv4 } from 'uuid'
import type { Rule, RuleStatus, GatewayDef, AppSettings } from '../types'
import { store } from './store'
import { startPeriodicSync, stopPeriodicSync, fetchAndCacheOffset, getCachedOffsetMs, getLastSyncedAt, getSystemTimezone } from './timeSync'
import { BlockerEngine } from './blockers/BlockerEngine'
import { initScheduler, reloadScheduler, isWithinSchedule } from './scheduler'
import { startProcessMonitor } from './processMonitor'
import { createTray } from './tray'
import { notify } from './notifications'
import { createLogger } from './logger'
import { enableAutoLaunch, disableAutoLaunch } from './autoLaunch'

const log = createLogger('Main')

let mainWin: BrowserWindow | null = null

function getMainWin(): BrowserWindow | null {
  return mainWin && !mainWin.isDestroyed() ? mainWin : null
}

function sendStatus(id: string, status: RuleStatus): void {
  log.debug(`sendStatus — id=${id} status=${status}`)
  getMainWin()?.webContents.send('rules:status-update', { id, status })
}

function updateStoreStatus(id: string, status: RuleStatus): void {
  const rules = store.get('rules')
  store.set('rules', rules.map(r => r.id === id ? { ...r, status } : r))
}

function migrateRules(): void {
  const raw = store.get('rules') as any[]
  if (!raw.length) return
  log.info(`Migrating ${raw.length} rule(s) — ensuring enabled/gatewayIds fields`)

  // Migrate inline rule.gateways[] → global GatewayDef entries + rule.gatewayIds[]
  const globalGateways: GatewayDef[] = (store.get('gateways') as GatewayDef[]) ?? []
  let gatewaysDirty = false

  const migrated = raw.map((r: any) => {
    const result: any = {
      ...r,
      enabled:    r.enabled    !== undefined ? r.enabled    : true,
      gatewayIds: r.gatewayIds !== undefined ? r.gatewayIds : []
    }

    // Promote legacy inline gateways → global (only if gatewayIds not yet set)
    if (!r.gatewayIds && Array.isArray(r.gateways) && r.gateways.length > 0) {
      for (const gw of r.gateways) {
        if (gw?.type === 'phrase' && gw.phrase) {
          let existing = globalGateways.find((g: GatewayDef) => g.phrase === gw.phrase)
          if (!existing) {
            existing = {
              id: uuidv4(),
              name: `${r.label} gateway`,
              phrase: gw.phrase,
              createdAt: new Date().toISOString()
            }
            globalGateways.push(existing)
            gatewaysDirty = true
          }
          if (!result.gatewayIds.includes(existing.id)) {
            result.gatewayIds.push(existing.id)
          }
        }
      }
      log.info(`  Promoted ${result.gatewayIds.length} inline gateway(s) for rule "${r.label}"`)
    }

    // Remove legacy inline field
    delete result.gateways
    return result
  })

  store.set('rules', migrated as Rule[])
  if (gatewaysDirty) {
    store.set('gateways', globalGateways)
    log.info(`Migrated ${globalGateways.length} global gateway(s)`)
  }

  // Ensure new settings fields exist
  const settings = store.get('settings') as any
  const settingsPatch: Record<string, unknown> = {}
  if (settings.settingsGatewayId === undefined) settingsPatch.settingsGatewayId = null
  if (settings.useServerTime     === undefined) settingsPatch.useServerTime     = false
  if (Object.keys(settingsPatch).length > 0) {
    store.set('settings', { ...settings, ...settingsPatch })
    log.info(`Migrated settings — added fields: ${Object.keys(settingsPatch).join(', ')}`)
  }
}

/**
 * Checks each rule's real OS state and syncs the store + renderer.
 * Only updates `status` (OS lock state) — never touches `enabled`.
 */
async function syncAllStatuses(): Promise<Rule[]> {
  const rules = store.get('rules')
  log.info(`syncAllStatuses — checking ${rules.length} rule(s)`)
  const updated = await Promise.all(
    rules.map(async (rule): Promise<Rule> => {
      if (rule.status === 'locking' || rule.status === 'unlocking') {
        log.debug(`  "${rule.label}" skipped — in-transit (${rule.status})`)
        return rule
      }
      try {
        const actual = await BlockerEngine.getStatus(rule)
        if (actual !== rule.status) {
          log.info(`  "${rule.label}" status drift — stored=${rule.status} actual=${actual} → syncing`)
          sendStatus(rule.id, actual)
          return { ...rule, status: actual }
        }
        log.debug(`  "${rule.label}" status OK (${actual})`)
      } catch (e) {
        log.error(`  "${rule.label}" getStatus threw:`, e)
      }
      return rule
    })
  )
  store.set('rules', updated)
  return updated
}

function createWindow(): BrowserWindow {
  log.info('Creating main window')
  const win = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 760,
    minHeight: 560,
    title: 'DeepOcean',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    frame: true,
    autoHideMenuBar: true
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    log.debug(`Renderer loading from dev server: ${process.env['ELECTRON_RENDERER_URL']}`)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
    log.debug('Renderer loading from built file')
  }

  win.on('close', (e) => {
    e.preventDefault()
    win.hide()
    log.info('Window close intercepted — minimised to tray')
  })

  win.on('show', () => {
    log.info('Window shown — syncing all statuses')
    syncAllStatuses().catch(e => log.error('syncAllStatuses on show failed:', e))
  })

  win.webContents.on('did-finish-load', () => {
    log.info('Renderer did-finish-load')
  })

  return win
}

// ─── App lifecycle ──────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  log.info('App ready — starting DeepOcean')
  migrateRules()
  mainWin = createWindow()
  createTray(mainWin)

  const settings = store.get('settings')
  log.info(
    `Settings loaded — launchAtStartup=${settings.launchAtStartup} ` +
    `notifications=${settings.notifications} ` +
    `preNotificationMinutes=${settings.preNotificationMinutes} ` +
    `theme=${settings.theme} useServerTime=${settings.useServerTime}`
  )

  if (settings.launchAtStartup) {
    try { enableAutoLaunch() } catch (e) {
      log.warn(`Could not register auto-launch task: ${(e as Error).message}`)
    }
  }

  // ── Server time sync BEFORE scheduler ─────────────────────────────────────
  // Must complete before initScheduler so startup reconciliation (isWithinSchedule)
  // uses the correct adjusted time. If sync fails we fall back silently to local time.
  if (settings.useServerTime) {
    log.info('useServerTime=true — syncing clock before scheduler start…')
    try {
      const syncResult = await fetchAndCacheOffset()
      log.info(
        `Pre-scheduler sync complete — offset=${syncResult.offsetMs}ms ` +
        `via ${syncResult.source} — schedules will use server time`
      )
    } catch (e) {
      log.warn(`Pre-scheduler sync failed: ${(e as Error).message} — falling back to local time for startup reconciliation`)
    }
  } else {
    log.info('useServerTime=false — using local time for schedules (offset=0)')
  }

  initScheduler()
  startProcessMonitor()

  // Start background 30-min re-sync interval (initial sync already done above)
  if (settings.useServerTime) {
    startPeriodicSync()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      log.info('Activate event — recreating window')
      mainWin = createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  log.info('All windows closed')
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  log.info('App quitting — active OS blocks will persist until next enable cycle')
})

// ─── IPC: Rules ────────────────────────────────────────────────────────────────

ipcMain.handle('rules:get-all', () => {
  log.debug('IPC rules:get-all')
  return store.get('rules')
})

ipcMain.handle('rules:add', async (_e, ruleData: Omit<Rule, 'id' | 'status' | 'createdAt'>) => {
  const newRule: Rule = {
    ...ruleData,
    id: uuidv4(),
    enabled:    ruleData.enabled    ?? true,
    gatewayIds: ruleData.gatewayIds ?? [],
    status: 'unblocked',
    createdAt: new Date().toISOString()
  }
  log.info(`IPC rules:add — label="${newRule.label}" type=${newRule.type} enabled=${newRule.enabled} schedules=${newRule.schedules.length}`)
  store.set('rules', [...store.get('rules'), newRule])
  reloadScheduler()

  if (newRule.enabled && isWithinSchedule(newRule.schedules)) {
    log.info(`  New rule is within schedule window — locking immediately`)
    updateStoreStatus(newRule.id, 'locking')
    sendStatus(newRule.id, 'locking')
    try {
      await BlockerEngine.block(newRule)
      updateStoreStatus(newRule.id, 'blocked')
      sendStatus(newRule.id, 'blocked')
      log.info(`  Immediate lock complete — "${newRule.label}"`)
    } catch (e) {
      log.error(`  Immediate lock failed — "${newRule.label}":`, e)
    }
  } else {
    log.debug(`  Not within schedule window — no immediate lock`)
  }
  return store.get('rules').find(r => r.id === newRule.id) ?? newRule
})

ipcMain.handle('rules:update', (_e, data: { id: string } & Partial<Rule>) => {
  const { id, ...patch } = data
  const rules = store.get('rules')
  const idx = rules.findIndex(r => r.id === id)
  if (idx === -1) {
    log.error(`IPC rules:update — rule id=${id} not found`)
    throw new Error(`Rule ${id} not found`)
  }
  const before = rules[idx]
  const updated = { ...before, ...patch } as Rule
  rules[idx] = updated
  store.set('rules', rules)
  log.info(`IPC rules:update — "${updated.label}" patch keys: ${Object.keys(patch).join(', ')}`)
  reloadScheduler()
  return updated
})

ipcMain.handle('rules:remove', async (_e, { id }: { id: string }) => {
  const rules = store.get('rules')
  const rule = rules.find(r => r.id === id)
  if (rule) {
    log.info(`IPC rules:remove — "${rule.label}" (${id}) — unblocking before removal`)
    try {
      await BlockerEngine.unblock(rule)
      log.info(`  Unblock complete for removed rule "${rule.label}"`)
    } catch (e) {
      log.warn(`  Unblock failed for removed rule "${rule.label}" (may already be clear):`, e)
    }
  } else {
    log.warn(`IPC rules:remove — id=${id} not found in store`)
  }
  store.set('rules', rules.filter(r => r.id !== id))
  reloadScheduler()
})

ipcMain.handle('rules:enable', async (_e, { id }: { id: string }) => {
  const rules = store.get('rules')
  const rule = rules.find(r => r.id === id)
  if (!rule) {
    log.error(`IPC rules:enable — rule id=${id} not found`)
    throw new Error(`Rule ${id} not found`)
  }
  log.info(`IPC rules:enable — "${rule.label}" (${id})`)
  store.set('rules', rules.map(r => r.id === id ? { ...r, enabled: true } : r))
  reloadScheduler()

  if (isWithinSchedule(rule.schedules)) {
    log.info(`  Within schedule window — locking immediately`)
    updateStoreStatus(id, 'locking')
    sendStatus(id, 'locking')
    try {
      await BlockerEngine.block(rule)
      updateStoreStatus(id, 'blocked')
      sendStatus(id, 'blocked')
      log.info(`  Lock applied — "${rule.label}"`)
      notify('DeepOcean — Rule enabled & locked', rule.label)
    } catch (e) {
      log.error(`  Lock failed — "${rule.label}":`, e)
      updateStoreStatus(id, 'error')
      sendStatus(id, 'error')
    }
  } else {
    log.info(`  Not within schedule window — rule armed, will lock per schedule`)
    notify('DeepOcean — Rule enabled', `${rule.label} — will lock per schedule`)
  }
})

ipcMain.handle('rules:disable', async (_e, { id }: { id: string }) => {
  const rules = store.get('rules')
  const rule = rules.find(r => r.id === id)
  if (!rule) {
    log.error(`IPC rules:disable — rule id=${id} not found`)
    throw new Error(`Rule ${id} not found`)
  }
  log.info(`IPC rules:disable — "${rule.label}" (${id})`)
  store.set('rules', rules.map(r => r.id === id ? { ...r, enabled: false } : r))
  reloadScheduler()

  updateStoreStatus(id, 'unlocking')
  sendStatus(id, 'unlocking')
  try {
    await BlockerEngine.unblock(rule)
    updateStoreStatus(id, 'unblocked')
    sendStatus(id, 'unblocked')
    log.info(`  Unlock applied — "${rule.label}"`)
    notify('DeepOcean — Rule disabled', rule.label)
  } catch (e) {
    log.error(`  Unlock failed — "${rule.label}":`, e)
    updateStoreStatus(id, 'error')
    sendStatus(id, 'error')
  }
})

ipcMain.handle('rules:sync', async () => {
  log.debug('IPC rules:sync')
  return syncAllStatuses()
})

ipcMain.handle('rules:get-target-statuses', async () => {
  const rules = store.get('rules')
  log.debug(`IPC rules:get-target-statuses — ${rules.length} rule(s)`)
  const result: Record<string, import('../types').TargetStatus[]> = {}
  await Promise.all(rules.map(async rule => {
    try {
      result[rule.id] = await BlockerEngine.getTargetStatuses(rule)
      log.debug(`  "${rule.label}": ${result[rule.id].map(t => `${t.label}=${t.status}`).join(', ')}`)
    } catch (e) {
      log.error(`  getTargetStatuses failed for "${rule.label}":`, e)
      result[rule.id] = []
    }
  }))
  return result
})

// ─── IPC: Blockers ─────────────────────────────────────────────────────────────

ipcMain.handle('blockers:types', () => {
  log.debug('IPC blockers:types')
  return BlockerEngine.getTypes()
})

// ─── IPC: Dialogs ──────────────────────────────────────────────────────────────

ipcMain.handle('dialog:folder', async () => {
  log.debug('IPC dialog:folder — opening folder picker')
  const result = await dialog.showOpenDialog(getMainWin()!, { properties: ['openDirectory'] })
  log.info(`dialog:folder — ${result.canceled ? 'cancelled' : `selected: "${result.filePaths[0]}"`}`)
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:exe', async () => {
  log.debug('IPC dialog:exe — opening exe picker')
  const result = await dialog.showOpenDialog(getMainWin()!, {
    properties: ['openFile'],
    filters: [{ name: 'Executables', extensions: ['exe'] }]
  })
  log.info(`dialog:exe — ${result.canceled ? 'cancelled' : `selected: "${result.filePaths[0]}"`}`)
  return result.canceled ? null : result.filePaths[0]
})

// ─── IPC: Settings ─────────────────────────────────────────────────────────────

ipcMain.handle('settings:get', () => {
  log.debug('IPC settings:get')
  return store.get('settings')
})

ipcMain.handle('settings:update', (_e, patch: Partial<AppSettings>) => {
  log.info(`IPC settings:update — keys: ${Object.keys(patch).join(', ')}`, patch)
  const current = store.get('settings')
  const updated = { ...current, ...patch }
  store.set('settings', updated)
  if ('launchAtStartup' in patch) {
    try {
      if (updated.launchAtStartup) enableAutoLaunch()
      else disableAutoLaunch()
    } catch (e) {
      log.warn(`Could not update auto-launch task: ${(e as Error).message}`)
    }
    log.info(`  launchAtStartup → ${updated.launchAtStartup}`)
  }
  if ('theme' in patch) {
    getMainWin()?.webContents.send('settings:theme-changed', updated.theme)
    log.info(`  theme → ${updated.theme}`)
  }
  if ('preNotificationMinutes' in patch) {
    log.info(`  preNotificationMinutes → ${updated.preNotificationMinutes} — reloading scheduler`)
    reloadScheduler()
  }
  if ('useServerTime' in patch) {
    if (updated.useServerTime) {
      log.info('  useServerTime → true — immediate sync + starting 30-min interval')
      // Kick off initial sync asynchronously — don't block the IPC response
      fetchAndCacheOffset()
        .then(r => log.info(`  useServerTime initial sync complete — offset=${r.offsetMs}ms via ${r.source}`))
        .catch(e => log.warn(`  useServerTime initial sync failed: ${(e as Error).message}`))
      startPeriodicSync()
    } else {
      log.info('  useServerTime → false — stopping sync, offset reset to 0')
      stopPeriodicSync()
    }
  }
  if ('settingsGatewayId' in patch) {
    log.info(`  settingsGatewayId → ${updated.settingsGatewayId ?? 'null (no lock)'}`)
  }
})

ipcMain.handle('shell:open-path', (_e, filePath: string) => {
  log.info(`IPC shell:open-path — "${filePath}"`)
  shell.openPath(filePath)
})

// ─── IPC: Gateways ─────────────────────────────────────────────────────────────

ipcMain.handle('gateways:get-all', () => {
  log.debug('IPC gateways:get-all')
  return store.get('gateways')
})

ipcMain.handle('gateways:add', (_e, data: Omit<GatewayDef, 'id' | 'createdAt'>) => {
  const newGw: GatewayDef = {
    ...data,
    id: uuidv4(),
    createdAt: new Date().toISOString()
  }
  log.info(`IPC gateways:add — name="${newGw.name}"`)
  store.set('gateways', [...store.get('gateways'), newGw])
  return newGw
})

ipcMain.handle('gateways:update', (_e, data: { id: string } & Partial<GatewayDef>) => {
  const { id, ...patch } = data
  const gateways = store.get('gateways')
  const idx = gateways.findIndex(g => g.id === id)
  if (idx === -1) throw new Error(`Gateway ${id} not found`)
  const updated = { ...gateways[idx], ...patch } as GatewayDef
  gateways[idx] = updated
  store.set('gateways', gateways)
  log.info(`IPC gateways:update — id=${id} name="${updated.name}"`)
  return updated
})

ipcMain.handle('gateways:remove', (_e, { id }: { id: string }) => {
  const gateways = store.get('gateways')
  const gw = gateways.find(g => g.id === id)
  if (!gw) {
    log.warn(`IPC gateways:remove — id=${id} not found`)
    return
  }
  store.set('gateways', gateways.filter(g => g.id !== id))

  // Unlink from any rules referencing this gateway
  const rules = store.get('rules')
  const updated = rules.map(r => ({
    ...r,
    gatewayIds: r.gatewayIds.filter(gid => gid !== id)
  }))
  store.set('rules', updated)

  // Unlink from settings if it was the settings gateway
  const settings = store.get('settings')
  if (settings.settingsGatewayId === id) {
    store.set('settings', { ...settings, settingsGatewayId: null })
    log.info(`IPC gateways:remove — cleared settingsGatewayId (was "${gw.name}")`)
  }

  log.info(`IPC gateways:remove — "${gw.name}" (${id}) removed`)
})

// ─── IPC: System ───────────────────────────────────────────────────────────────

/** Fetch a fresh time reading, cache the offset, and return results + cached state. */
ipcMain.handle('system:server-time', async () => {
  log.debug('IPC system:server-time — fetching via google.com Date header')
  const result = await fetchAndCacheOffset()
  return result
})

/** Return the currently cached offset without a network round-trip. */
ipcMain.handle('system:time-status', () => {
  const lastSynced = getLastSyncedAt()
  // Only return a timezone if it was server-detected (from IP via fetchAndCacheOffset).
  // Empty string means not yet synced — renderer will show "sync to detect".
  return {
    offsetMs:   getCachedOffsetMs(),
    lastSynced: lastSynced ? lastSynced.toISOString() : null,
    timezone:   getSystemTimezone()   // '' until first successful sync
  }
})
