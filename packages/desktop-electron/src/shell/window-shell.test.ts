/**
 * 渲染侧窗口桥的回归测试：只接受形状完整的 preload 注入对象，并强制工作区身份。
 */
import { describe, expect, it, vi } from 'vitest'

import { WINDOW_BRIDGE_KEY } from '../../electron/window-bridge'

import { readWindowShell, readWorkspaceId } from './window-shell'

/** preload 会注入的窗口桥。 */
function createBridge() {
  return {
    platform: 'win32',
    titleBarHeight: 40,
    minimize: vi.fn(async () => {}),
    toggleMaximize: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    getWindowState: vi.fn(async () => ({ maximized: false })),
    onMaximizedChanged: vi.fn(() => () => {}),
    openWindow: vi.fn(async () => {}),
    closeWorkspace: vi.fn(async () => {}),
    consumeInitialTabs: vi.fn(async () => null),
    adoptTab: vi.fn(async () => {}),
    onWorkspaceChanged: vi.fn(() => () => {}),
  }
}

describe('readWindowShell', () => {
  it('接受完整的 preload 桥', () => {
    const bridge = createBridge()

    expect(readWindowShell({ [WINDOW_BRIDGE_KEY]: bridge })).toBe(bridge)
  })

  const invalidBridges: ReadonlyArray<readonly [string, unknown]> = [
    ['桥不存在', undefined],
    ['桥不是对象', 'win32'],
    ['缺少平台', { ...createBridge(), platform: undefined }],
    ['标题栏高度不是正数', { ...createBridge(), titleBarHeight: 0 }],
    ['缺少最小化能力', { ...createBridge(), minimize: undefined }],
    ['缺少最大化状态订阅', { ...createBridge(), onMaximizedChanged: undefined }],
    ['缺少新建窗口能力', { ...createBridge(), openWindow: undefined }],
    ['缺少关闭工作区能力', { ...createBridge(), closeWorkspace: undefined }],
    ['缺少工作区订阅能力', { ...createBridge(), onWorkspaceChanged: undefined }],
  ]

  it.each(invalidBridges)('%s时返回 undefined', (_label, bridge) => {
    expect(readWindowShell({ [WINDOW_BRIDGE_KEY]: bridge })).toBeUndefined()
  })
})

describe('readWorkspaceId', () => {
  it('从查询串读取工作区身份', () => {
    expect(readWorkspaceId('?workspace=w-1')).toBe('w-1')
  })

  it('缺少身份时直接失败，不退回到默认工作区', () => {
    expect(() => readWorkspaceId('')).toThrow(/workspace id/)
  })
})
