import { Tray, Menu, app, nativeImage, BrowserWindow } from 'electron'
import path from 'node:path'
import { createLogger } from './logger'

const log = createLogger('Tray')

let tray: Tray | null = null

export function createTray(mainWindow: BrowserWindow): void {
  const iconPath = path.join(app.getAppPath(), 'resources', 'icon.png')
  log.info(`Creating tray — icon: "${iconPath}"`)

  let icon: Electron.NativeImage
  try {
    icon = nativeImage.createFromPath(iconPath)
    log.debug('Tray icon loaded from file')
  } catch {
    icon = nativeImage.createEmpty()
    log.warn('Tray icon not found — using empty icon')
  }

  tray = new Tray(icon)
  tray.setToolTip('DeepOcean')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open DeepOcean',
      click: () => {
        log.info('Tray → Open DeepOcean clicked')
        mainWindow.show()
        mainWindow.focus()
      }
    },
    { type: 'separator' },
    {
      label: 'Quit DeepOcean',
      click: () => {
        log.info('Tray → Quit DeepOcean clicked — active OS blocks will persist')
        mainWindow.removeAllListeners('close')
        app.exit(0)
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    log.info('Tray double-clicked — showing window')
    mainWindow.show()
    mainWindow.focus()
  })

  log.info('Tray created')
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
    log.info('Tray destroyed')
  }
}
