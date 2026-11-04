/**
 * 窗口相关 IPC：渲染进程把当前有效主题同步给主进程，由主进程更新原生标题栏配色。
 */
import { createMainFrameGuard, type TrustedIpcEvent } from './ipc-guard'
import { applyTitleBarTheme, type TitleBarTarget } from './titlebar-theme'
import { WINDOW_CHANNELS } from './window-bridge'

/** 窗口 IPC 的事件形状，与其它主进程通道共用同一套来源门禁。 */
export type WindowIpcEvent = TrustedIpcEvent

/** `ipcMain` 中本模块用到的部分，便于单测替换。 */
export interface IpcMainLike {
  handle(channel: string, listener: (event: WindowIpcEvent, ...args: unknown[]) => unknown): void
}

/**
 * 注册窗口 handler。
 *
 * @param options.ipcMain 主进程 IPC 注册入口
 * @param options.getWindow 返回当前主窗口；尚未创建或已销毁时为 null
 * @param options.isTrustedSender 判断事件来源是否为主窗口
 * @param options.platform 宿主平台，默认取 `process.platform`
 */
export function registerWindowIpc(options: {
  ipcMain: IpcMainLike
  getWindow: () => TitleBarTarget | null
  isTrustedSender: (event: WindowIpcEvent) => boolean
  platform?: NodeJS.Platform
}): void {
  const assertTrustedMainFrame = createMainFrameGuard(options.isTrustedSender)
  const platform = options.platform ?? process.platform

  options.ipcMain.handle(WINDOW_CHANNELS.setTitleBarTheme, async (event, theme) => {
    assertTrustedMainFrame(event)
    if (theme !== 'light' && theme !== 'dark') {
      throw new TypeError('The window theme must be light or dark.')
    }
    const window = options.getWindow()
    if (!window) throw new Error('The main window is not available.')
    applyTitleBarTheme(window, theme, platform)
    return null
  })
}
