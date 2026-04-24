import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'node:path'
import { v4 as uuidv4 } from 'uuid'
import type { Rule } from '../types'
import { store } from './store'
import { BlockerEngine } from './blockers/BlockerEngine'
import { initScheduler, reloadScheduler } from './scheduler'
import { createTray } from './tray'
import { notify } from './notifications'

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

  return win
}

app.whenReady().then(() => {
  const win = createWindow()
  createTray(win)
  initScheduler()

  const settings = store.get('settings')
  if (settings.launchAtStartup) {
    app.setLoginItemSettings({ openAtLogin: true })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// ─── IPC: Rules ────────────────────────────────────────────────────────────────

ipcMain.handle('rules:get-all', () => {
  return store.get('rules')
})

ipcMain.handle('rules:add', (_event, ruleData: Omit<Rule, 'id' | 'status' | 'createdAt'>) => {
  const newRule: Rule = {
    ...ruleData,
    id: uuidv4(),
    status: 'unblocked',
    createdAt: new Date().toISOString()
  }
  const rules = store.get('rules')
  store.set('rules', [...rules, newRule])
  reloadScheduler()
  return newRule
})

ipcMain.handle('rules:update', (_event, data: { id: string } & Partial<Rule>) => {
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

ipcMain.handle('rules:remove', async (_event, { id }: { id: string }) => {
  const rules = store.get('rules')
  const rule = rules.find(r => r.id === id)
  if (rule) {
    try { await BlockerEngine.unblock(rule) } catch { /* ignore */ }
  }
  store.set('rules', rules.filter(r => r.id !== id))
  reloadScheduler()
})

ipcMain.handle('rules:block-now', async (_event, { id }: { id: string }) => {
  const rules = store.get('rules')
  const rule = rules.find(r => r.id === id)
  if (!rule) throw new Error(`Rule ${id} not found`)
  await BlockerEngine.block(rule)
  const updated = rules.map(r => r.id === id ? { ...r, status: 'blocked' as const } : r)
  store.set('rules', updated)
  const win = BrowserWindow.getFocusedWindow()
  win?.webContents.send('rules:status-update', { id, status: 'blocked' })
  notify('DeepOcean — Blocked', rule.label)
})

ipcMain.handle('rules:unblock-now', async (_event, { id, duration }: { id: string; duration?: number }) => {
  const rules = store.get('rules')
  const rule = rules.find(r => r.id === id)
  if (!rule) throw new Error(`Rule ${id} not found`)
  await BlockerEngine.unblock(rule)
  const updated = rules.map(r => r.id === id ? { ...r, status: 'unblocked' as const } : r)
  store.set('rules', updated)
  const win = BrowserWindow.getFocusedWindow()
  win?.webContents.send('rules:status-update', { id, status: 'unblocked' })
  notify('DeepOcean — Unblocked', rule.label)

  if (duration) {
    setTimeout(async () => {
      const currentRules = store.get('rules')
      const currentRule = currentRules.find(r => r.id === id)
      if (currentRule) {
        await BlockerEngine.block(currentRule)
        const re = currentRules.map(r => r.id === id ? { ...r, status: 'blocked' as const } : r)
        store.set('rules', re)
        win?.webContents.send('rules:status-update', { id, status: 'blocked' })
        notify('DeepOcean — Re-blocked', currentRule.label)
      }
    }, duration * 60 * 1000)
  }
})

ipcMain.handle('app:pause-all', async (_event, { duration }: { duration: number }) => {
  const rules = store.get('rules')
  for (const rule of rules) {
    try { await BlockerEngine.unblock(rule) } catch { /* ignore */ }
  }
  const win = BrowserWindow.getFocusedWindow()
  win?.webContents.send('rules:status-update', { pauseAll: true, duration })
  notify('DeepOcean — All paused', `Resumes in ${duration} minutes`)

  setTimeout(async () => {
    const currentRules = store.get('rules')
    for (const rule of currentRules) {
      try { await BlockerEngine.block(rule) } catch { /* ignore */ }
    }
    win?.webContents.send('rules:status-update', { pauseAll: false })
    notify('DeepOcean — Resumed', 'All rules are active again')
  }, duration * 60 * 1000)
})

// ─── IPC: Blockers ─────────────────────────────────────────────────────────────

ipcMain.handle('blockers:types', () => {
  return BlockerEngine.getTypes()
})

// ─── IPC: Dialogs ──────────────────────────────────────────────────────────────

ipcMain.handle('dialog:folder', async () => {
  const win = BrowserWindow.getFocusedWindow()
  const result = await dialog.showOpenDialog(win!, {
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:exe', async () => {
  const win = BrowserWindow.getFocusedWindow()
  const result = await dialog.showOpenDialog(win!, {
    properties: ['openFile'],
    filters: [{ name: 'Executables', extensions: ['exe'] }]
  })
  return result.canceled ? null : result.filePaths[0]
})

// ─── IPC: Settings ─────────────────────────────────────────────────────────────

ipcMain.handle('settings:get', () => {
  return store.get('settings')
})

ipcMain.handle('settings:update', (_event, patch: Partial<ReturnType<typeof store.get>['settings']>) => {
  const current = store.get('settings')
  const updated = { ...current, ...patch }
  store.set('settings', updated)
  if ('launchAtStartup' in patch) {
    app.setLoginItemSettings({ openAtLogin: updated.launchAtStartup })
  }
  if ('theme' in patch) {
    const win = BrowserWindow.getFocusedWindow()
    win?.webContents.send('settings:theme-changed', updated.theme)
  }
})

ipcMain.handle('shell:open-path', (_event, filePath: string) => {
  shell.openPath(filePath)
})
