/**
 * 窗口 IPC 的回归测试：来源门禁、主题校验与 WCO 配色下发。
 *
 * 用假窗口记录 `setTitleBarOverlay` 调用，不启动真实 Electron。
 */
import { describe, expect, it, vi } from 'vitest'

import { TITLEBAR_THEMES, type TitleBarTarget } from './titlebar-theme'
import { TITLEBAR_HEIGHT, WINDOW_CHANNELS } from './window-bridge'
import { registerWindowIpc, type WindowIpcEvent } from './window-ipc'

const trustedSender = { id: 1 }
const mainFrame: WindowIpcEvent = { sender: trustedSender, senderFrame: { parent: null } }

/** 收集注册的 handler 与窗口写入记录。 */
function setup(options: { window?: TitleBarTarget | null; platform?: NodeJS.Platform } = {}) {
  const handlers = new Map<string, (event: WindowIpcEvent, ...args: unknown[]) => unknown>()
  const window: TitleBarTarget =
    options.window === undefined
      ? { setTitleBarOverlay: vi.fn() }
      : (options.window as TitleBarTarget)
  registerWindowIpc({
    ipcMain: { handle: (channel, listener) => handlers.set(channel, listener) },
    getWindow: () => window,
    // 与 main.ts 相同：只信任主窗口的 webContents。
    isTrustedSender: (event) => event.sender === trustedSender,
    platform: options.platform ?? 'win32',
  })
  const call = (event: WindowIpcEvent = mainFrame, ...args: unknown[]) =>
    handlers.get(WINDOW_CHANNELS.setTitleBarTheme)!(event, ...args)
  return { window, call }
}

describe('registerWindowIpc', () => {
  it.each(['light', 'dark'] as const)('applies the %s palette to the window', async (theme) => {
    const { window, call } = setup()

    await expect(call(mainFrame, theme)).resolves.toBeNull()

    expect(window.setTitleBarOverlay).toHaveBeenCalledWith({
      ...TITLEBAR_THEMES[theme],
      height: TITLEBAR_HEIGHT,
    })
  })

  it('leaves the native traffic lights alone on macOS', async () => {
    const { window, call } = setup({ platform: 'darwin' })

    await expect(call(mainFrame, 'dark')).resolves.toBeNull()

    expect(window.setTitleBarOverlay).not.toHaveBeenCalled()
  })

  const rejectedSenders: ReadonlyArray<readonly [string, WindowIpcEvent]> = [
    ['a sender other than the main window', { sender: { id: 2 }, senderFrame: { parent: null } }],
    ['a sub frame of the main window', { sender: trustedSender, senderFrame: { parent: {} } }],
  ]

  it.each(rejectedSenders)('rejects %s', async (_label, event) => {
    const { window, call } = setup()

    await expect(call(event, 'dark')).rejects.toThrow(/main application frame/)
    expect(window.setTitleBarOverlay).not.toHaveBeenCalled()
  })

  it('rejects an unknown theme instead of guessing', async () => {
    const { window, call } = setup()

    await expect(call(mainFrame, 'auto')).rejects.toBeInstanceOf(TypeError)
    expect(window.setTitleBarOverlay).not.toHaveBeenCalled()
  })

  it('rejects when the main window is already gone', async () => {
    const { call } = setup({ window: null })

    await expect(call(mainFrame, 'dark')).rejects.toThrow(/not available/)
  })
})
