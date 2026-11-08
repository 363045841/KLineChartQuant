/** 从组件真实 drop 入口验证外部文本载荷，不仅测试解析器本身。 */
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import TabBar from './TabBar.vue'

beforeEach(() =>
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  ),
)
afterEach(() => vi.unstubAllGlobals())

it.each([
  ['not json', false],
  ['null', false],
  ['42', false],
  ['[]', false],
  ['{}', false],
  ['{"fromWorkspaceId":true,"tabId":"t"}', false],
  ['{"fromWorkspaceId":"w","tabId":1}', false],
  ['{"fromWorkspaceId":" ","tabId":"t"}', false],
  ['{"fromWorkspaceId":"w","tabId":""}', false],
  ['{"fromWorkspaceId":"source","tabId":"moved"}', true],
] as const)('拖入文本 %s 时只有合法身份触发接管', async (raw, valid) => {
  const wrapper = mount(TabBar, {
    props: {
      platform: 'win32',
      workspaceId: 'target',
      tabs: [{ id: 'target-tab', spec: null }],
      activeTabId: 'target-tab',
      accent: 'currentColor',
      canDetach: false,
      maximized: false,
    },
  })
  try {
    await wrapper.find('header').trigger('drop', { dataTransfer: { getData: () => raw } })
    const expected = valid
      ? [[{ fromWorkspaceId: 'source', tabId: 'moved', target: null }]]
      : undefined
    expect(wrapper.emitted('adopt')).toEqual(expected)
    expect(wrapper.emitted('reorder')).toBeUndefined()
    expect(wrapper.emitted('detach')).toBeUndefined()
  } finally {
    wrapper.unmount()
  }
})
