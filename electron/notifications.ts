import { Notification } from 'electron'
import { store } from './store'

export function notify(title: string, body?: string): void {
  if (!Notification.isSupported()) return
  if (!store.get('settings').notifications) return
  new Notification({ title, body: body ?? '' }).show()
}
