import { contextBridge, ipcRenderer } from 'electron'
import type { Rule, AppSettings } from '../types'

const api = {
  // Rules
  getRules:        ():                                      Promise<Rule[]>    => ipcRenderer.invoke('rules:get-all'),
  addRule:         (rule: Omit<Rule,'id'|'status'|'createdAt'>): Promise<Rule> => ipcRenderer.invoke('rules:add', rule),
  updateRule:      (data: { id: string } & Partial<Rule>): Promise<Rule>      => ipcRenderer.invoke('rules:update', data),
  removeRule:      (id: string):                            Promise<void>      => ipcRenderer.invoke('rules:remove', { id }),
  blockNow:        (id: string):                            Promise<void>      => ipcRenderer.invoke('rules:block-now', { id }),
  unblockNow:      (id: string, duration?: number):        Promise<void>      => ipcRenderer.invoke('rules:unblock-now', { id, duration }),
  pauseAll:        (duration: number):                      Promise<void>      => ipcRenderer.invoke('app:pause-all', { duration }),

  // Blockers
  getBlockerTypes: (): Promise<{ type: string; label: string }[]>             => ipcRenderer.invoke('blockers:types'),

  // Dialogs
  pickFolder:      ():  Promise<string | null>                                 => ipcRenderer.invoke('dialog:folder'),
  pickExe:         ():  Promise<string | null>                                 => ipcRenderer.invoke('dialog:exe'),

  // Settings
  getSettings:     ():                                      Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  updateSettings:  (patch: Partial<AppSettings>):          Promise<void>        => ipcRenderer.invoke('settings:update', patch),

  // Event listeners
  onStatusUpdate:  (cb: (data: unknown) => void) => {
    ipcRenderer.on('rules:status-update', (_event, data) => cb(data))
  },
  onThemeChanged:  (cb: (theme: string) => void) => {
    ipcRenderer.on('settings:theme-changed', (_event, theme) => cb(theme))
  },

  // Utilities
  openPath:        (p: string): Promise<void> => ipcRenderer.invoke('shell:open-path', p)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
