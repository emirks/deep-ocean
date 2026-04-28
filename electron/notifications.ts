import { Notification } from 'electron'
import { store } from './store'
import { createLogger } from './logger'

const log = createLogger('Notifications')

export function notify(title: string, body?: string): void {
  if (!Notification.isSupported()) {
    log.debug(`notify() skipped — not supported on this platform`)
    return
  }
  if (!store.get('settings').notifications) {
    log.debug(`notify() skipped — notifications disabled in settings`)
    return
  }
  log.info(`notify() — title="${title}" body="${body ?? ''}"`)
  new Notification({ title, body: body ?? '' }).show()
}
