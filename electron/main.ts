import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'node:path'
import { v4 as uuidv4 } from 'uuid'
import type { Rule, RuleStatus } from '../types'
import { store } from './store'
import { BlockerEngine } from './blockers/BlockerEngine'
import { initScheduler, reloadScheduler } from './scheduler'
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

/**
 * Checks each rule's real system state and syncs the store + renderer.
 * Called on window show and via IPC from the renderer on mount/focus.
 */
async function syncAllStatuses(): Promise<Rule[]> {
  const rules = store.get('rules')
  const updated = await Promise.all(
    rules.map(async (rule): Promise<Rule> => {
      // Don't overwrite a transitional state mid-operation
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

  // Window close → hide to tray; blocks remain active
  win.on('close', (e) => {
    e.preventDefault()
    win.hide()
  })

  // Sync state every time the user opens the window
  win.on('show', () => {
    syncAllStatuses().catch(e => console.error('[sync] show error', e))
  })

  return win
}

app.whenReady().then(() => {
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

ipcMain.handle('rules:add', (_e, ruleData: Omit<Rule, 'id' | 'status' | 'createdAt'>) => {
  const newRule: Rule = {
    ...ruleData,
    id: uuidv4(),
    status: 'unblocked',
    gateways: ruleData.gateways ?? [],
    createdAt: new Date().toISOString()
  }
  store.set('rules', [...store.get('rules'), newRule])
  reloadScheduler()
  return newRule
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

ipcMain.handle('rules:block-now', async (_e, { id }: { id: string }) => {
  const rules = store.get('rules')
  const rule = rules.find(r => r.id === id)
  if (!rule) throw new Error(`Rule ${id} not found`)

  updateStoreStatus(id, 'locking')
  sendStatus(id, 'locking')

  await BlockerEngine.block(rule)

  updateStoreStatus(id, 'blocked')
  sendStatus(id, 'blocked')
  notify('DeepOcean — Blocked', rule.label)
})

ipcMain.handle('rules:unblock-now', async (_e, { id, duration }: { id: string; duration?: number }) => {
  const rules = store.get('rules')
  const rule = rules.find(r => r.id === id)
  if (!rule) throw new Error(`Rule ${id} not found`)

  updateStoreStatus(id, 'unlocking')
  sendStatus(id, 'unlocking')

  await BlockerEngine.unblock(rule)

  updateStoreStatus(id, 'unblocked')
  sendStatus(id, 'unblocked')
  notify('DeepOcean — Unblocked', rule.label)

  if (duration) {
    setTimeout(async () => {
      const currentRules = store.get('rules')
      const currentRule = currentRules.find(r => r.id === id)
      if (currentRule && currentRule.status === 'unblocked') {
        try {
          updateStoreStatus(id, 'locking')
          sendStatus(id, 'locking')
          await BlockerEngine.block(currentRule)
          updateStoreStatus(id, 'blocked')
          sendStatus(id, 'blocked')
          notify('DeepOcean — Re-blocked', currentRule.label)
        } catch (e) {
          console.error('[unblock-now] re-block error', e)
        }
      }
    }, duration * 60 * 1000)
  }
})

ipcMain.handle('app:pause-all', async (_e, { duration }: { duration: number }) => {
  const rules = store.get('rules')
  for (const rule of rules) {
    try { await BlockerEngine.unblock(rule) } catch { /* ignore */ }
  }
  getMainWin()?.webContents.send('rules:status-update', { pauseAll: true, duration })
  notify('DeepOcean — All paused', `Resumes in ${duration} minutes`)

  setTimeout(async () => {
    const currentRules = store.get('rules')
    for (const rule of currentRules) {
      try { await BlockerEngine.block(rule) } catch { /* ignore */ }
    }
    getMainWin()?.webContents.send('rules:status-update', { pauseAll: false })
    notify('DeepOcean — Resumed', 'All rules are active again')
  }, duration * 60 * 1000)
})

/** Renderer calls this on mount + window focus to reconcile UI with real OS state. */
ipcMain.handle('rules:sync', async () => {
  return syncAllStatuses()
})

/** Returns per-target live OS state for every rule — used by the per-target status dots. */
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
  const result = await dialog.showOpenDialog(getMainWin()!, {
    properties: ['openDirectory']
  })
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
