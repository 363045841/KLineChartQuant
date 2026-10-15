import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron'

import {
  type CredentialIpcEvent,
  EncryptedCredentialStore,
  registerCredentialIpc,
} from './credential-ipc'

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
      preload: join(currentDirectory, '../preload/preload.cjs'),
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(currentDirectory, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerCredentialIpc({
    ipcMain,
    store: new EncryptedCredentialStore({
      safeStorage,
      userDataPath: app.getPath('userData'),
    }),
    // 只信任主窗口的 webContents；其它窗口 / 子 frame 一律拒绝。
    isTrustedSender: (event) =>
      (event as CredentialIpcEvent & { sender?: unknown }).sender === mainWindow?.webContents,
  })
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
