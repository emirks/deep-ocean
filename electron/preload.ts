import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Rule, AppSettings, TargetStatus } from '../types'

const api = {
  // Rules
  getRules:          ():                                           Promise<Rule[]>                    => ipcRenderer.invoke('rules:get-all'),
  syncRules:         ():                                           Promise<Rule[]>                    => ipcRenderer.invoke('rules:sync'),
  getTargetStatuses: ():                                           Promise<Record<string, TargetStatus[]>> => ipcRenderer.invoke('rules:get-target-statuses'),
  addRule:           (rule: Omit<Rule,'id'|'status'|'createdAt'>): Promise<Rule>                    => ipcRenderer.invoke('rules:add', rule),
  updateRule:        (data: { id: string } & Partial<Rule>):       Promise<Rule>                    => ipcRenderer.invoke('rules:update', data),
  removeRule:        (id: string):                                  Promise<void>                    => ipcRenderer.invoke('rules:remove', { id }),
  /** Arms the rule. Locks immediately if within a schedule window. */
  enableRule:        (id: string):                                  Promise<void>                    => ipcRenderer.invoke('rules:enable', { id }),
  /** Disarms the rule and removes the OS lock. Gateway check done in renderer. */
  disableRule:       (id: string):                                  Promise<void>                    => ipcRenderer.invoke('rules:disable', { id }),

  // Blockers
  getBlockerTypes:   (): Promise<{ type: string; label: string }[]>                                => ipcRenderer.invoke('blockers:types'),

  // Dialogs
  pickFolder:        ():  Promise<string | null>                                                    => ipcRenderer.invoke('dialog:folder'),
  pickExe:           ():  Promise<string | null>                                                    => ipcRenderer.invoke('dialog:exe'),

  // Settings
  getSettings:       ():                             Promise<AppSettings>                          => ipcRenderer.invoke('settings:get'),
  updateSettings:    (patch: Partial<AppSettings>):  Promise<void>                                 => ipcRenderer.invoke('settings:update', patch),

  // Event listeners — return cleanup functions to prevent listener accumulation
  onStatusUpdate: (cb: (data: unknown) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, data: unknown) => cb(data)
    ipcRenderer.on('rules:status-update', listener)
    return () => ipcRenderer.removeListener('rules:status-update', listener)
  },
  onThemeChanged: (cb: (theme: string) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, theme: string) => cb(theme)
    ipcRenderer.on('settings:theme-changed', listener)
    return () => ipcRenderer.removeListener('settings:theme-changed', listener)
  },

  // Utilities
  openPath: (p: string): Promise<void> => ipcRenderer.invoke('shell:open-path', p)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
