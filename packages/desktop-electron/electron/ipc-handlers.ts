import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFile, readFile } from 'node:fs/promises'
import Store from 'electron-store'

const store = new Store()

function getFocusedWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow()
}

export function registerIpcHandlers(): void {
  // ── Store (替代 localStorage) ──
  ipcMain.on('store:get', (event, key: string) => {
    event.returnValue = store.get(key)
  })

  ipcMain.on('store:set', (_event, key: string, value: unknown) => {
    store.set(key, value)
  })

  // ── File dialogs ──
  ipcMain.handle('file:save-dialog', async (_event, options: { defaultName?: string; filters?: Array<{ name: string; extensions: string[] }> }) => {
    const win = getFocusedWindow()
    if (!win) return null
    const result = await dialog.showSaveDialog(win, {
      defaultPath: options.defaultName,
      filters: options.filters ?? [{ name: 'All Files', extensions: ['*'] }],
    })
    return result.canceled ? null : result.filePath
  })

  ipcMain.handle('file:save', async (_event, filePath: string, content: string) => {
    try {
      await writeFile(filePath, content, 'utf-8')
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('file:open-dialog', async (_event, options: { filters?: Array<{ name: string; extensions: string[] }>; multiSelections?: boolean }) => {
    const win = getFocusedWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: options.multiSelections ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: options.filters ?? [{ name: 'All Files', extensions: ['*'] }],
    })
    return result.canceled ? null : result.filePaths
  })

  ipcMain.handle('file:read', async (_event, filePath: string) => {
    return await readFile(filePath, 'utf-8')
  })

  // ── Window management ──
  ipcMain.on('window:minimize', () => {
    getFocusedWindow()?.minimize()
  })

  ipcMain.on('window:maximize', () => {
    const win = getFocusedWindow()
    if (!win) return
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  })

  ipcMain.on('window:close', () => {
    getFocusedWindow()?.close()
  })

  ipcMain.handle('window:is-maximized', () => {
    return getFocusedWindow()?.isMaximized() ?? false
  })

  // ── App info ──
  ipcMain.on('app:get-version', (event) => {
    event.returnValue = app.getVersion()
  })

  // ── Window maximize state broadcast ──
  const broadcastMaximize = (win: BrowserWindow): void => {
    win.webContents.send('window:maximize-change', win.isMaximized())
  }

  app.on('browser-window-created', (_event, win) => {
    win.on('maximize', () => broadcastMaximize(win))
    win.on('unmaximize', () => broadcastMaximize(win))
  })
}
