/**
 * 桌面应用主进程：单实例锁、本地行情后端托管、窗口生命周期与 IPC 装配。
 *
 * 后端在打包态与开发态都会托管，区别只是二进制所在目录；开发态没跑过 `build:backends`
 * 时该目录不存在，托管器记为 missing，不影响其余功能。
 */
import { join } from 'node:path'

import { app, BrowserWindow, ipcMain, safeStorage } from 'electron'

import { type ManagedBackendHost, startManagedBackends } from './backends'
import { EncryptedCredentialStore, registerCredentialIpc } from './credential-ipc'
import { createMainWindow } from './main-window'
import { registerWindowIpc } from './window-ipc'

let mainWindow: BrowserWindow | null = null
let backends: ManagedBackendHost | undefined
let quitting = false

/** 只信任主窗口的 webContents；其它窗口与子 frame 一律拒绝。 */
function isMainWindowSender(event: { readonly sender: unknown }): boolean {
  return event.sender === mainWindow?.webContents
}

/** 启动应用：先拉起随包分发的行情后端，再注册 IPC 并建窗口。 */
async function startApplication(): Promise<void> {
  // 打包后二进制在 process.resourcesPath/backends；开发态从包目录的 resources/backends 找。
  backends = startManagedBackends({
    resourceRoot: app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources'),
    dataRoot: app.getPath('userData'),
  })
  await backends.ready

  registerCredentialIpc({
    ipcMain,
    store: new EncryptedCredentialStore({
      safeStorage,
      userDataPath: app.getPath('userData'),
    }),
    isTrustedSender: isMainWindowSender,
  })
  registerWindowIpc({
    ipcMain,
    getWindow: () => mainWindow,
    isTrustedSender: isMainWindowSender,
    platform: process.platform,
  })

  mainWindow = createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
    }
  })
}

// 两个实例会抢同一组后端端口，因此第二个实例直接把焦点交回已有窗口后退出。
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(startApplication)

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  // 退出前先回收后端子进程；`quitting` 防住 app.quit() 再次进入本钩子。
  app.on('before-quit', (event) => {
    if (quitting || !backends) return
    event.preventDefault()
    quitting = true
    void backends.dispose().finally(() => app.quit())
  })
}
