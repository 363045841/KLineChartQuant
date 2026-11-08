/**
 * 桌面应用主进程：单实例锁、本地行情后端托管、多窗口生命周期与 IPC 装配。
 *
 * 后端按进程托管一次并被所有窗口共享；窗口数量与工作区身份由 `windows.ts` 记录，
 * 标签内容由渲染进程按工作区身份自行持久化。
 */
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import { app, BrowserWindow, ipcMain, safeStorage } from 'electron'
import { APPLICATION_ICON } from './app-icon'
import { installApplicationMenu } from './app-menu'
import { type ManagedBackendHost, startManagedBackends } from './backends'
import { EncryptedCredentialStore, registerCredentialIpc } from './credential-ipc'
import { createMainWindow } from './main-window'
import { WINDOW_CHANNELS } from './window-bridge'
import { registerWindowIpc } from './window-ipc'
import { createWorkspaceSessionStore } from './window-store'
import { createWindowSet, type WindowSet } from './windows'

let backends: ManagedBackendHost | undefined
let quitting = false

/** 通知所有窗口重新读取标签页集合；主进程不持有标签数据。 */
function notifyWorkspaceChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(WINDOW_CHANNELS.workspaceChanged)
  }
}

/** 启动应用：先拉起随包分发的行情后端，再注册 IPC、菜单并恢复窗口。 */
async function startApplication(
  activeWindows: WindowSet,
  session: ReturnType<typeof createWorkspaceSessionStore>,
): Promise<void> {
  const userDataPath = app.getPath('userData')

  // 开发态也显示平台标识；安装后的 macOS 应用直接使用包内 ICNS。
  if (process.platform === 'darwin' && !app.isPackaged) {
    app.dock?.setIcon(APPLICATION_ICON)
  }

  // 打包后二进制在 process.resourcesPath/backends；开发态从包目录的 resources/backends 找。
  backends = startManagedBackends({
    resourceRoot: app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources'),
    dataRoot: userDataPath,
  })
  await backends.ready

  registerCredentialIpc({
    ipcMain,
    store: new EncryptedCredentialStore({ safeStorage, userDataPath }),
    isTrustedSender: (event) => activeWindows.isTrustedSender(event.sender),
  })
  registerWindowIpc({
    ipcMain,
    getWindow: (event) => activeWindows.windowOf(event.sender),
    isTrustedSender: (event) => activeWindows.isTrustedSender(event.sender),
    createWindow: (tabs) => {
      activeWindows.open(randomUUID(), tabs ?? null)
    },
    closeWorkspace: (workspaceId) => activeWindows.close(workspaceId),
    takeInitialTabs: (event) => activeWindows.takeInitialTabs(event.sender),
    notifyWorkspaceChanged,
  })
  installApplicationMenu({
    platform: process.platform,
    openWindow: () => {
      activeWindows.open(randomUUID())
    },
  })

  const restored = await session.load()
  for (const workspaceId of restored.length > 0 ? restored : [randomUUID()]) {
    activeWindows.open(workspaceId)
  }

  app.on('activate', () => {
    if (activeWindows.size === 0) activeWindows.open(randomUUID())
  })
}

// 两个实例会抢同一组后端端口，因此第二个实例直接把焦点交回已有窗口后退出。
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  const userDataPath = app.getPath('userData')
  const session = createWorkspaceSessionStore(userDataPath)
  const activeWindows = createWindowSet((workspaceIds) => {
    void session
      .save(workspaceIds)
      .catch((error: unknown) => console.error('Window session save failed', error))
  }, createMainWindow)

  app.on('second-instance', () => activeWindows.focusAny())

  app.whenReady().then(() => startApplication(activeWindows, session))

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  // 退出前先回收后端子进程；`quitting` 防住 app.quit() 再次进入本钩子。
  app.on('before-quit', (event) => {
    if (quitting) return
    event.preventDefault()
    quitting = true
    activeWindows.preserveSession()
    void Promise.all([session.flush(), backends?.dispose()])
      .catch((error: unknown) => console.error('Desktop shutdown failed', error))
      .finally(() => app.quit())
  })
}
