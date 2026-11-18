// 首屏面板选择：显式配置优先，旧开关作为回落。
import { describe, expect, it } from 'vitest'
import { resolveInitialPanel } from '../resolveInitialPanel.js'

describe('resolveInitialPanel', () => {
  it.each([
    { name: '显式面板优先于旧开关', initialPanel: 'orderflow' as const, open: true, expected: 'orderflow' },
    { name: '显式面板在旧开关关闭时仍生效', initialPanel: 'options' as const, open: false, expected: 'options' },
    { name: '省略时按旧开关展开 Agent', initialPanel: undefined, open: true, expected: 'agent' },
    { name: '两者都没有时不展开', initialPanel: undefined, open: false, expected: null },
  ])('$name', ({ initialPanel, open, expected }) => {
    expect(resolveInitialPanel({ initialPanel, initialAgentPanelOpen: open })).toBe(expected)
  })
})
