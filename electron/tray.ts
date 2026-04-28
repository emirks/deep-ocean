import { Tray, Menu, app, nativeImage, BrowserWindow } from 'electron'
import path from 'node:path'

let tray: Tray | null = null

export function createTray(mainWindow: BrowserWindow): void {
  const iconPath = path.join(app.getAppPath(), 'resources', 'icon.png')
  let icon: Electron.NativeImage

  try {
    icon = nativeImage.createFromPath(iconPath)
  } catch {
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip('DeepOcean')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open DeepOcean',
      click: () => {
        mainWindow.show()
        mainWindow.focus()
      }
    },
    { type: 'separator' },
    {
      label: 'Quit DeepOcean',
      click: () => {
        // Remove the close intercept so the window can actually close,
        // then exit. Active blocks are NOT cleared — NTFS ACLs persist.
        mainWindow.removeAllListeners('close')
        app.exit(0)
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    mainWindow.show()
    mainWindow.focus()
  })
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
