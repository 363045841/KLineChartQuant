import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  AgentApplicationService,
  createUnavailableRuntimeSupport,
  type RuntimeSupport,
} from '@363045841yyt/klinechart-agent-runtime'
import {
  createNodeRuntimeSessions,
  type NodeRuntimeSessions,
} from '@363045841yyt/klinechart-agent-runtime/node'
import { app, BrowserWindow, shell } from 'electron'

import { registerAgentIpc, type RegisteredAgentIpc } from './agent-ipc'
import { registerIpcHandlers } from './ipc-handlers'

let mainWindow: BrowserWindow | null = null
let nodeRuntime: NodeRuntimeSessions | undefined
let agentIpc: RegisteredAgentIpc | undefined
let shutdownStarted = false
const currentDirectory = dirname(fileURLToPath(import.meta.url))

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 720,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: join(currentDirectory, '../preload/preload.cjs'),
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

app.whenReady().then(async () => {
  registerIpcHandlers()
  const userData = app.getPath('userData')
  nodeRuntime = createNodeRuntimeSessions({
    databasePath: join(userData, 'agent-sessions.sqlite'),
    cwd: userData,
  })
  const support: RuntimeSupport =
    import.meta.env.MODE === 'e2e'
      ? (await import('@363045841yyt/klinechart-agent-runtime/testing')).createFauxRuntimeSupport()
      : createUnavailableRuntimeSupport()
  const application = new AgentApplicationService({
    sessions: nodeRuntime.sessions,
    createPlan: support.createPlan,
    provider: support.provider,
  })
  await application.initialize()
  agentIpc = registerAgentIpc(application)
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

app.on('before-quit', (event) => {
  if (shutdownStarted) return
  event.preventDefault()
  shutdownStarted = true
  void (async () => {
    await agentIpc?.close()
    await nodeRuntime?.close()
    app.quit()
  })()
})
