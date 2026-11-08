/**
 * 桌面端最小 preload。
 *
 * 只经 `contextBridge` 暴露凭据与窗口两组函数对象，**不暴露 `ipcRenderer` 本身**，
 * 渲染进程因此无法向任意 channel 发消息。这里刻意不复用也不扩展仓库里那套
 * 已废弃的 agent IPC。
 */
import { contextBridge, ipcRenderer } from 'electron'

// 只从共享契约导入：这些文件不含 node 内置模块，sandbox preload 才不会引入无法加载的 require。
import {
  CREDENTIAL_BRIDGE_KEY,
  CREDENTIAL_CHANNELS,
  type CredentialBridge,
} from './credential-bridge'
import {
  TITLEBAR_HEIGHT,
  WINDOW_BRIDGE_KEY,
  WINDOW_CHANNELS,
  type WindowBridge,
  type WindowTheme,
  type WorkspaceTab,
} from './window-bridge'

const credentialBridge: CredentialBridge = {
  read: () => ipcRenderer.invoke(CREDENTIAL_CHANNELS.read) as Promise<string | null>,
  write: async (apiKey: string) => {
    await ipcRenderer.invoke(CREDENTIAL_CHANNELS.write, apiKey)
  },
  delete: async () => {
    await ipcRenderer.invoke(CREDENTIAL_CHANNELS.delete)
  },
}

const windowBridge: WindowBridge = {
  platform: process.platform,
  titleBarHeight: TITLEBAR_HEIGHT,
  setTitleBarTheme: async (theme: WindowTheme) => {
    await ipcRenderer.invoke(WINDOW_CHANNELS.setTitleBarTheme, theme)
  },
  openWindow: async (tabs?: ReadonlyArray<WorkspaceTab>) => {
    await ipcRenderer.invoke(WINDOW_CHANNELS.openWindow, tabs)
  },
  closeWorkspace: async (workspaceId: string) => {
    await ipcRenderer.invoke(WINDOW_CHANNELS.closeWorkspace, workspaceId)
  },
  consumeInitialTabs: () =>
    ipcRenderer.invoke(
      WINDOW_CHANNELS.consumeInitialTabs,
    ) as Promise<ReadonlyArray<WorkspaceTab> | null>,
  adoptTab: async (request) => {
    await ipcRenderer.invoke(WINDOW_CHANNELS.adoptTab, request)
  },
  onWorkspaceChanged: (listener: () => void) => {
    // 只订阅专用通道，事件参数不透传给渲染层。
    const handler = (): void => listener()
    ipcRenderer.on(WINDOW_CHANNELS.workspaceChanged, handler)
    return () => {
      ipcRenderer.removeListener(WINDOW_CHANNELS.workspaceChanged, handler)
    }
  },
}

contextBridge.exposeInMainWorld(CREDENTIAL_BRIDGE_KEY, credentialBridge)
contextBridge.exposeInMainWorld(WINDOW_BRIDGE_KEY, windowBridge)
