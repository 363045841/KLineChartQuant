import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { app, BrowserWindow, shell } from 'electron'

import { createNavigationPolicy } from './external-navigation'

let mainWindow: BrowserWindow | null = null
const currentDirectory = dirname(fileURLToPath(import.meta.url))

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 720,
    minHeight: 600,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      webgl: true,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  const applicationUrl =
    process.env.ELECTRON_RENDERER_URL ??
    pathToFileURL(join(currentDirectory, '../renderer/index.html')).toString()

  // Renderer 内容一律视为不可信：只有显式命中协议/域名白名单的地址才交给系统浏览器，
  // 且主窗口不得被导航离开应用自身来源。
  const navigationPolicy = createNavigationPolicy({
    applicationUrl,
    openExternal: (url) => {
      void shell.openExternal(url)
    },
    onRejected: (url, reason) => {
      console.warn(`[navigation] blocked ${reason}: ${url}`)
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    navigationPolicy.handleWindowOpen(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!navigationPolicy.handleWillNavigate(url)) event.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(currentDirectory, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

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
