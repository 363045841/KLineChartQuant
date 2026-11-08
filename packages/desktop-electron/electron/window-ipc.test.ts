/**
 * 窗口 IPC 的回归测试：来源门禁、窗口控制、标签移交与跨窗口接管广播。
 *
 * 用窗口替身记录调用，不启动真实 Electron。
 */
import { describe, expect, it, vi } from 'vitest'

import { type WorkspaceTab, WINDOW_CHANNELS } from './window-bridge'
import { registerWindowIpc, type WindowActions, type WindowIpcEvent } from './window-ipc'

const trustedSender = { id: 1 }
const mainFrame: WindowIpcEvent = { sender: trustedSender, senderFrame: { parent: null } }
const transferredTab: WorkspaceTab = {
  id: 'tab-1',
  spec: { symbol: 'SOLUSDT', market: 'binance' },
}

/** 收集注册的 handler 与两侧替身。 */
function setup() {
  const handlers = new Map<string, (event: WindowIpcEvent, ...args: unknown[]) => unknown>()
  let maximized = false
  const window: WindowActions = {
    minimize: vi.fn(),
    maximize: vi.fn(() => {
      maximized = true
    }),
    unmaximize: vi.fn(() => {
      maximized = false
    }),
    isMaximized: vi.fn(() => maximized),
    close: vi.fn(),
  }
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
  })
  const call = (channel: string, event: WindowIpcEvent = mainFrame, ...args: unknown[]) =>
    handlers.get(channel)!(event, ...args)
  return { window, createWindow, closeWorkspace, takeInitialTabs, notifyWorkspaceChanged, call }
}

describe('registerWindowIpc — 来源门禁', () => {
  // 所有通道共用同一套门禁：逐个通道确认被拒绝，而不是只测其中一个。
  const channels: ReadonlyArray<readonly [string, ReadonlyArray<unknown>]> = [
    [WINDOW_CHANNELS.minimizeWindow, []],
    [WINDOW_CHANNELS.toggleMaximizeWindow, []],
    [WINDOW_CHANNELS.closeWindow, []],
    [WINDOW_CHANNELS.getWindowState, []],
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

describe('registerWindowIpc — 窗口控制', () => {
  it('把最小化与关闭转发给来源窗口', async () => {
    const { call, window } = setup()

    await expect(call(WINDOW_CHANNELS.minimizeWindow)).resolves.toBeNull()
    await expect(call(WINDOW_CHANNELS.closeWindow)).resolves.toBeNull()

    expect(window.minimize).toHaveBeenCalledTimes(1)
    expect(window.close).toHaveBeenCalledTimes(1)
  })

  it('在最大化与还原之间切换', async () => {
    const { call, window } = setup()

    await expect(call(WINDOW_CHANNELS.toggleMaximizeWindow)).resolves.toBeNull()
    expect(window.maximize).toHaveBeenCalledTimes(1)

    await expect(call(WINDOW_CHANNELS.toggleMaximizeWindow)).resolves.toBeNull()
    expect(window.unmaximize).toHaveBeenCalledTimes(1)
  })

  it('回报当前最大化状态', async () => {
    const { call } = setup()

    await expect(call(WINDOW_CHANNELS.getWindowState)).resolves.toEqual({ maximized: false })

    await call(WINDOW_CHANNELS.toggleMaximizeWindow)
    await expect(call(WINDOW_CHANNELS.getWindowState)).resolves.toEqual({ maximized: true })
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
    ['标签缺少 id', [{ spec: null }]],
    ['品种描述不完整', [{ id: 't', spec: { symbol: 'X' } }]],
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

  it.each([
    ['缺少来源工作区', { tabId: 'tab-1' }],
    ['缺少标签身份', { fromWorkspaceId: 'w-1' }],
  ] as const)('拒绝%s的接管请求', async (_label, request) => {
    const { call, notifyWorkspaceChanged } = setup()

    await expect(call(WINDOW_CHANNELS.adoptTab, mainFrame, request)).rejects.toBeInstanceOf(
      TypeError,
    )
    expect(notifyWorkspaceChanged).not.toHaveBeenCalled()
  })
})
