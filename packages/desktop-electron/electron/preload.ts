import { contextBridge, ipcRenderer } from 'electron'

const api = {
  store: {
    get(key: string): unknown {
      return ipcRenderer.sendSync('store:get', key)
    },
    set(key: string, value: unknown): void {
      ipcRenderer.send('store:set', key, value)
    },
  },
  file: {
    saveDialog(options: { defaultName?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null> {
      return ipcRenderer.invoke('file:save-dialog', options)
    },
    saveFile(filePath: string, content: string): Promise<boolean> {
      return ipcRenderer.invoke('file:save', filePath, content)
    },
    openDialog(options: { filters?: Array<{ name: string; extensions: string[] }>; multiSelections?: boolean }): Promise<string[] | null> {
      return ipcRenderer.invoke('file:open-dialog', options)
    },
    readFile(filePath: string): Promise<string> {
      return ipcRenderer.invoke('file:read', filePath)
    },
  },
  window: {
    minimize(): void {
      ipcRenderer.send('window:minimize')
    },
    maximize(): void {
      ipcRenderer.send('window:maximize')
    },
    close(): void {
      ipcRenderer.send('window:close')
    },
    isMaximized(): Promise<boolean> {
      return ipcRenderer.invoke('window:is-maximized')
    },
    onMaximizeChange(callback: (maximized: boolean) => void): () => void {
      const handler = (_event: Electron.IpcRendererEvent, maximized: boolean): void => {
        callback(maximized)
      }
      ipcRenderer.on('window:maximize-change', handler)
      return () => {
        ipcRenderer.removeListener('window:maximize-change', handler)
      }
    },
  },
  app: {
    getVersion(): string {
      return ipcRenderer.sendSync('app:get-version')
    },
  },
}

contextBridge.exposeInMainWorld('desktopAPI', api)
