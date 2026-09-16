/**
 * 凭据专用的最小 preload。
 *
 * 只经 `contextBridge` 暴露三个函数，**不暴露 `ipcRenderer` 本身**，
 * 渲染进程因此无法向任意 channel 发消息。这里刻意不复用也不扩展仓库里那套
 * 已废弃的 agent IPC。
 */
import { contextBridge, ipcRenderer } from 'electron'

import { CREDENTIAL_BRIDGE_KEY, type CredentialBridge } from './credential-bridge'
import { CREDENTIAL_CHANNELS } from './credential-ipc'

const bridge: CredentialBridge = {
  read: () => ipcRenderer.invoke(CREDENTIAL_CHANNELS.read) as Promise<string | null>,
  write: async (apiKey: string) => {
    await ipcRenderer.invoke(CREDENTIAL_CHANNELS.write, apiKey)
  },
  delete: async () => {
    await ipcRenderer.invoke(CREDENTIAL_CHANNELS.delete)
  },
}

contextBridge.exposeInMainWorld(CREDENTIAL_BRIDGE_KEY, bridge)
