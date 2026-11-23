/**
 * 桌面应用主进程：单实例锁、本地行情后端托管、Agent 宿主、多窗口生命周期与 IPC 装配。
 *
 * 后端与 Agent 宿主都按进程托管一次并被所有窗口共享；窗口数量与工作区身份由
 * `windows.ts` 记录，标签内容由渲染进程按工作区身份自行持久化。
 */
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import {
  type NodeAgentHost,
  startNodeAgentHost,
} from '@363045841yyt/klinechart-agent-runtime/node-host'
import { app, BrowserWindow, ipcMain, net } from 'electron'
import { registerAgentIpc } from './agent-ipc'
import { APPLICATION_ICON } from './app-icon'
import { installApplicationMenu } from './app-menu'
import { type ManagedBackendHost, startManagedBackends } from './backends'
import { createMainWindow } from './main-window'
import { WINDOW_CHANNELS } from './window-bridge'
import { registerWindowIpc } from './window-ipc'
import { createWorkspaceSessionStore } from './window-store'
import { createWindowSet, type WindowSet } from './windows'

let backends: ManagedBackendHost | undefined
let agent: NodeAgentHost | undefined
let quitting = false

/**
 * Provider 请求的主进程实现。
 *
 * 请求不从页面发出，因此没有 origin、不受 CORS 约束——这是不返回 CORS 头的
 * 第三方网关能在桌面端使用的原因；`net.fetch` 同时保留系统代理与证书配置。
 */
function createProviderFetch(): typeof globalThis.fetch {
  return (input, init) =>
    net.fetch(typeof input === 'string' || input instanceof URL ? input.toString() : input, init)
}

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

  // Agent 宿主随应用启动一次，所有窗口共用；Provider 请求在主进程发出。
  agent = await startNodeAgentHost({ dataDir: userDataPath, fetch: createProviderFetch() })

  registerAgentIpc({
    ipcMain,
    host: agent.host,
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
    void Promise.all([session.flush(), backends?.dispose(), agent?.close()])
      .catch((error: unknown) => console.error('Desktop shutdown failed', error))
      .finally(() => app.quit())
  })
}
