/**
 * 渲染侧窗口桥的回归测试：只接受形状完整的 preload 注入对象。
 */
import { describe, expect, it, vi } from 'vitest'

import { WINDOW_BRIDGE_KEY } from '../../electron/window-bridge'

import { readWindowShell } from './window-shell'

/** preload 会注入的窗口桥。 */
function createBridge() {
  return {
    platform: 'win32',
    titleBarHeight: 36,
    setTitleBarTheme: vi.fn(async () => {}),
  }
}

describe('readWindowShell', () => {
  it('accepts the preload bridge', () => {
    const bridge = createBridge()

    expect(readWindowShell({ [WINDOW_BRIDGE_KEY]: bridge })).toBe(bridge)
  })

  const invalidBridges: ReadonlyArray<readonly [string, unknown]> = [
    ['the bridge is absent', undefined],
    ['the bridge is not an object', 'win32'],
    ['the platform is missing', { titleBarHeight: 36, setTitleBarTheme: async () => {} }],
    ['the title bar height is not positive', { ...createBridge(), titleBarHeight: 0 }],
    ['the theme setter is missing', { platform: 'win32', titleBarHeight: 36 }],
  ]

  it.each(invalidBridges)('returns undefined when %s', (_label, bridge) => {
    expect(readWindowShell({ [WINDOW_BRIDGE_KEY]: bridge })).toBeUndefined()
  })
})
