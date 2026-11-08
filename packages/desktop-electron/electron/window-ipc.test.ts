/**
 * 窗口 IPC 的回归测试：来源门禁、主题下发、标签移交与跨窗口接管广播。
 *
 * 用假窗口记录 `setTitleBarOverlay` 调用，不启动真实 Electron。
 */
import { describe, expect, it, vi } from 'vitest'

import { TITLEBAR_THEMES, type TitleBarTarget } from './titlebar-theme'
import { TITLEBAR_HEIGHT, WINDOW_CHANNELS, type WorkspaceTab } from './window-bridge'
import { registerWindowIpc, type WindowIpcEvent } from './window-ipc'

const trustedSender = { id: 1 }
const mainFrame: WindowIpcEvent = { sender: trustedSender, senderFrame: { parent: null } }
const transferredTab: WorkspaceTab = {
  id: 'tab-1',
  label: 'SOLUSDT',
  spec: { symbol: 'SOLUSDT', market: 'binance' },
}

/** 收集注册的 handler 与两侧替身。 */
function setup(options: { platform?: NodeJS.Platform } = {}) {
  const handlers = new Map<string, (event: WindowIpcEvent, ...args: unknown[]) => unknown>()
  const window: TitleBarTarget = { setTitleBarOverlay: vi.fn() }
  const createWindow = vi.fn()
  const closeWorkspace = vi.fn()
  const takeInitialTabs = vi.fn(() => [transferredTab])
  const notifyWorkspaceChanged = vi.fn()
  registerWindowIpc({
    ipcMain: { handle: (channel, listener) => handlers.set(channel, listener) },
    getWindow: (event) => (event.sender === trustedSender ? window : null),
    isTrustedSender: (event) => event.sender === trustedSender,
    createWindow,
    closeWorkspace,
    takeInitialTabs,
    notifyWorkspaceChanged,
    platform: options.platform ?? 'win32',
  })
  const call = (channel: string, event: WindowIpcEvent = mainFrame, ...args: unknown[]) =>
    handlers.get(channel)!(event, ...args)
  return { window, createWindow, closeWorkspace, takeInitialTabs, notifyWorkspaceChanged, call }
}

describe('registerWindowIpc — 来源门禁', () => {
  // 三个通道共用同一套门禁：逐个通道确认被拒绝，而不是只测其中一个。
  const channels: ReadonlyArray<readonly [string, ReadonlyArray<unknown>]> = [
    [WINDOW_CHANNELS.setTitleBarTheme, ['dark']],
    [WINDOW_CHANNELS.openWindow, [undefined]],
    [WINDOW_CHANNELS.closeWorkspace, ['w-1']],
    [WINDOW_CHANNELS.consumeInitialTabs, []],
  ]

  const rejected: ReadonlyArray<readonly [string, WindowIpcEvent]> = [
    ['其它窗口', { sender: { id: 2 }, senderFrame: { parent: null } }],
    ['子 frame', { sender: trustedSender, senderFrame: { parent: {} } }],
  ]

  it.each(
    channels.flatMap(([channel, args]) =>
      rejected.map(([label, event]) => [channel, label, event, args] as const),
    ),
  )('%s 拒绝%s', async (channel, _label, event, args) => {
    const { call, createWindow, takeInitialTabs } = setup()

    await expect(call(channel, event, ...args)).rejects.toThrow(/main application frame/)
    expect(createWindow).not.toHaveBeenCalled()
    expect(takeInitialTabs).not.toHaveBeenCalled()
  })
})

describe('registerWindowIpc — 标题栏主题', () => {
  it.each(['light', 'dark'] as const)('把 %s 配色写入发起调用的窗口', async (theme) => {
    const { window, call } = setup()

    await expect(call(WINDOW_CHANNELS.setTitleBarTheme, mainFrame, theme)).resolves.toBeNull()

    expect(window.setTitleBarOverlay).toHaveBeenCalledWith({
      ...TITLEBAR_THEMES[theme],
      height: TITLEBAR_HEIGHT,
    })
  })

  it('macOS 保留系统红绿灯', async () => {
    const { window, call } = setup({ platform: 'darwin' })

    await expect(call(WINDOW_CHANNELS.setTitleBarTheme, mainFrame, 'dark')).resolves.toBeNull()

    expect(window.setTitleBarOverlay).not.toHaveBeenCalled()
  })

  it('拒绝未知主题而不是猜测', async () => {
    const { window, call } = setup()

    await expect(call(WINDOW_CHANNELS.setTitleBarTheme, mainFrame, 'auto')).rejects.toBeInstanceOf(
      TypeError,
    )
    expect(window.setTitleBarOverlay).not.toHaveBeenCalled()
  })
})

describe('registerWindowIpc — 新建窗口', () => {
  it('不带标签时开一扇空白窗口', async () => {
    const { call, createWindow } = setup()

    await expect(call(WINDOW_CHANNELS.openWindow)).resolves.toBeNull()

    expect(createWindow).toHaveBeenCalledWith(undefined)
  })

  it('带标签时把这些标签交给新窗口', async () => {
    const { call, createWindow } = setup()

    await expect(call(WINDOW_CHANNELS.openWindow, mainFrame, [transferredTab])).resolves.toBeNull()

    expect(createWindow).toHaveBeenCalledWith([transferredTab])
  })

  const malformed: ReadonlyArray<readonly [string, unknown]> = [
    ['空数组', []],
    ['标签缺少 id', [{ label: 'X', spec: null }]],
    ['品种描述不完整', [{ id: 't', label: 'X', spec: { symbol: 'X' } }]],
  ]

  it.each(malformed)('拒绝%s的标签载荷', async (_label, tabs) => {
    const { call, createWindow } = setup()

    await expect(call(WINDOW_CHANNELS.openWindow, mainFrame, tabs)).rejects.toBeInstanceOf(
      TypeError,
    )
    expect(createWindow).not.toHaveBeenCalled()
  })
})

describe('registerWindowIpc — 标签移交与接管', () => {
  it('取走窗口暂存的初始标签', async () => {
    const { call, takeInitialTabs } = setup()

    await expect(call(WINDOW_CHANNELS.consumeInitialTabs)).resolves.toEqual([transferredTab])
    expect(takeInitialTabs).toHaveBeenCalledWith(mainFrame)
  })

  it('关闭被搬空的工作区窗口', async () => {
    const { call, closeWorkspace } = setup()

    await expect(call(WINDOW_CHANNELS.closeWorkspace, mainFrame, 'w-1')).resolves.toBeNull()
    expect(closeWorkspace).toHaveBeenCalledWith('w-1')
  })

  it('拒绝空的工作区身份', async () => {
    const { call, closeWorkspace } = setup()

    await expect(call(WINDOW_CHANNELS.closeWorkspace, mainFrame, '')).rejects.toBeInstanceOf(
      TypeError,
    )
    expect(closeWorkspace).not.toHaveBeenCalled()
  })

  it('接管标签后广播工作区变化', async () => {
    const { call, notifyWorkspaceChanged } = setup()

    await expect(
      call(WINDOW_CHANNELS.adoptTab, mainFrame, { fromWorkspaceId: 'w-1', tabId: 'tab-1' }),
    ).resolves.toBeNull()

    expect(notifyWorkspaceChanged).toHaveBeenCalledTimes(1)
  })

  it('拒绝缺少来源或标签身份的接管请求', async () => {
    const { call, notifyWorkspaceChanged } = setup()

    await expect(
      call(WINDOW_CHANNELS.adoptTab, mainFrame, { tabId: 'tab-1' }),
    ).rejects.toBeInstanceOf(TypeError)
    expect(notifyWorkspaceChanged).not.toHaveBeenCalled()
  })
})
