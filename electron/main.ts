import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'node:path'
import { v4 as uuidv4 } from 'uuid'
import type { Rule, RuleStatus } from '../types'
import { store } from './store'
import { BlockerEngine } from './blockers/BlockerEngine'
import { initScheduler, reloadScheduler, isWithinSchedule } from './scheduler'
import { startProcessMonitor } from './processMonitor'
import { createTray } from './tray'
import { notify } from './notifications'

let mainWin: BrowserWindow | null = null

function getMainWin(): BrowserWindow | null {
  return mainWin && !mainWin.isDestroyed() ? mainWin : null
}

function sendStatus(id: string, status: RuleStatus): void {
  getMainWin()?.webContents.send('rules:status-update', { id, status })
}

function updateStoreStatus(id: string, status: RuleStatus): void {
  const rules = store.get('rules')
  store.set('rules', rules.map(r => r.id === id ? { ...r, status } : r))
}

function migrateRules(): void {
  const raw = store.get('rules') as any[]
  if (!raw.length) return
  const migrated = raw.map((r: any) => ({
    ...r,
    enabled:  r.enabled  !== undefined ? r.enabled  : true,
    gateways: r.gateways !== undefined ? r.gateways : []
  }))
  store.set('rules', migrated as Rule[])
}

/**
 * Checks each rule's real OS state and syncs the store + renderer.
 * Only updates `status` (OS lock state) — never touches `enabled`.
 */
async function syncAllStatuses(): Promise<Rule[]> {
  const rules = store.get('rules')
  const updated = await Promise.all(
    rules.map(async (rule): Promise<Rule> => {
      if (rule.status === 'locking' || rule.status === 'unlocking') return rule
      try {
        const actual = await BlockerEngine.getStatus(rule)
        if (actual !== rule.status) {
          sendStatus(rule.id, actual)
          return { ...rule, status: actual }
        }
      } catch { /* leave as-is on error */ }
      return rule
    })
  )
  store.set('rules', updated)
  return updated
}

function createWindow(): BrowserWindow {
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
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  win.on('close', (e) => {
    e.preventDefault()
    win.hide()
  })

  win.on('show', () => {
    syncAllStatuses().catch(e => console.error('[sync] show error', e))
  })

  return win
}

app.whenReady().then(() => {
  migrateRules()
  mainWin = createWindow()
  createTray(mainWin)
  initScheduler()
  startProcessMonitor()

  const settings = store.get('settings')
  if (settings.launchAtStartup) {
    app.setLoginItemSettings({ openAtLogin: true })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWin = createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── IPC: Rules ────────────────────────────────────────────────────────────────

ipcMain.handle('rules:get-all', () => store.get('rules'))

ipcMain.handle('rules:add', async (_e, ruleData: Omit<Rule, 'id' | 'status' | 'createdAt'>) => {
  const newRule: Rule = {
    ...ruleData,
    id: uuidv4(),
    enabled:  ruleData.enabled  ?? true,
    gateways: ruleData.gateways ?? [],
    status: 'unblocked',
    createdAt: new Date().toISOString()
  }
  store.set('rules', [...store.get('rules'), newRule])
  reloadScheduler()

  // If newly added rule is enabled and currently in a schedule window, lock immediately
  if (newRule.enabled && isWithinSchedule(newRule.schedules)) {
    updateStoreStatus(newRule.id, 'locking')
    sendStatus(newRule.id, 'locking')
    try {
      await BlockerEngine.block(newRule)
      updateStoreStatus(newRule.id, 'blocked')
      sendStatus(newRule.id, 'blocked')
    } catch (e) {
      console.error('[rules:add] block error', e)
    }
  }
  return store.get('rules').find(r => r.id === newRule.id) ?? newRule
})

ipcMain.handle('rules:update', (_e, data: { id: string } & Partial<Rule>) => {
  const { id, ...patch } = data
  const rules = store.get('rules')
  const idx = rules.findIndex(r => r.id === id)
  if (idx === -1) throw new Error(`Rule ${id} not found`)
  const updated = { ...rules[idx], ...patch } as Rule
  rules[idx] = updated
  store.set('rules', rules)
  reloadScheduler()
  return updated
})

ipcMain.handle('rules:remove', async (_e, { id }: { id: string }) => {
  const rules = store.get('rules')
  const rule = rules.find(r => r.id === id)
  if (rule) {
    try { await BlockerEngine.unblock(rule) } catch { /* ignore */ }
  }
  store.set('rules', rules.filter(r => r.id !== id))
  reloadScheduler()
})

/**
 * Enable a rule — arms the scheduler. If currently in a schedule window,
 * applies the OS lock immediately.
 */
ipcMain.handle('rules:enable', async (_e, { id }: { id: string }) => {
  const rules = store.get('rules')
  const rule = rules.find(r => r.id === id)
  if (!rule) throw new Error(`Rule ${id} not found`)

  store.set('rules', rules.map(r => r.id === id ? { ...r, enabled: true } : r))
  reloadScheduler()

  if (isWithinSchedule(rule.schedules)) {
    updateStoreStatus(id, 'locking')
    sendStatus(id, 'locking')
    try {
      await BlockerEngine.block(rule)
      updateStoreStatus(id, 'blocked')
      sendStatus(id, 'blocked')
      notify('DeepOcean — Rule enabled & locked', rule.label)
    } catch (e) {
      console.error('[rules:enable] block error', e)
      updateStoreStatus(id, 'error')
      sendStatus(id, 'error')
    }
  } else {
    notify('DeepOcean — Rule enabled', `${rule.label} — will lock per schedule`)
  }
})

/**
 * Disable a rule — disarms the scheduler and removes the OS lock.
 * The gateway check is enforced by the renderer before calling this.
 */
ipcMain.handle('rules:disable', async (_e, { id }: { id: string }) => {
  const rules = store.get('rules')
  const rule = rules.find(r => r.id === id)
  if (!rule) throw new Error(`Rule ${id} not found`)

  store.set('rules', rules.map(r => r.id === id ? { ...r, enabled: false } : r))
  reloadScheduler()

  updateStoreStatus(id, 'unlocking')
  sendStatus(id, 'unlocking')
  try {
    await BlockerEngine.unblock(rule)
    updateStoreStatus(id, 'unblocked')
    sendStatus(id, 'unblocked')
    notify('DeepOcean — Rule disabled', rule.label)
  } catch (e) {
    console.error('[rules:disable] unblock error', e)
    updateStoreStatus(id, 'error')
    sendStatus(id, 'error')
  }
})

/** Reconcile UI with actual OS state — only updates status, never enabled. */
ipcMain.handle('rules:sync', async () => syncAllStatuses())

/** Per-target live OS state for all rules. */
ipcMain.handle('rules:get-target-statuses', async () => {
  const rules = store.get('rules')
  const result: Record<string, import('../types').TargetStatus[]> = {}
  await Promise.all(rules.map(async rule => {
    try {
      result[rule.id] = await BlockerEngine.getTargetStatuses(rule)
    } catch {
      result[rule.id] = []
    }
  }))
  return result
})

// ─── IPC: Blockers ─────────────────────────────────────────────────────────────

ipcMain.handle('blockers:types', () => BlockerEngine.getTypes())

// ─── IPC: Dialogs ──────────────────────────────────────────────────────────────

ipcMain.handle('dialog:folder', async () => {
  const result = await dialog.showOpenDialog(getMainWin()!, { properties: ['openDirectory'] })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:exe', async () => {
  const result = await dialog.showOpenDialog(getMainWin()!, {
    properties: ['openFile'],
    filters: [{ name: 'Executables', extensions: ['exe'] }]
  })
  return result.canceled ? null : result.filePaths[0]
})

// ─── IPC: Settings ─────────────────────────────────────────────────────────────

ipcMain.handle('settings:get', () => store.get('settings'))

ipcMain.handle('settings:update', (_e, patch: Partial<ReturnType<typeof store.get>['settings']>) => {
  const current = store.get('settings')
  const updated = { ...current, ...patch }
  store.set('settings', updated)
  if ('launchAtStartup' in patch) {
    app.setLoginItemSettings({ openAtLogin: updated.launchAtStartup })
  }
  if ('theme' in patch) {
    getMainWin()?.webContents.send('settings:theme-changed', updated.theme)
  }
  if ('preNotificationMinutes' in patch) {
    reloadScheduler()
  }
})

ipcMain.handle('shell:open-path', (_e, filePath: string) => {
  shell.openPath(filePath)
})
