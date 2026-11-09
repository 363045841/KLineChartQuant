/** 从组件真实 drop 入口验证外部文本载荷，不仅测试解析器本身。 */
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import TabBar from '../WorkspaceTabBar.vue'

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

/** Web 特意传入桌面能力参数，确认能力开关仍以宿主模式为准。 */
function mountWebBar() {
  return mount(TabBar, {
    props: {
      workspaceId: 'web',
      tabs: [
        { id: 'a', spec: null },
        { id: 'b', spec: null },
      ],
      activeTabId: 'a',
      accent: 'currentColor',
      platform: 'win32',
      canDetach: true,
    },
  })
}

it('Web 展示页面标签操作，不展示窗口按钮', async () => {
  const wrapper = mountWebBar()
  try {
    expect(wrapper.find('.tab-bar__controls').exists()).toBe(false)
    expect(wrapper.find('.tab-bar__title').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('[object HTMLSpanElement]')
    await wrapper.get('[aria-label="新建标签页"]').trigger('click')
    await wrapper.get('[data-tab-id="b"]').trigger('click')
    await wrapper.get('[data-tab-id="b"]').trigger('auxclick', { button: 1 })
    expect(wrapper.emitted('create')).toEqual([[]])
    expect(wrapper.emitted('activate')).toEqual([['b']])
    expect(wrapper.emitted('close')).toEqual([['b']])
  } finally {
    wrapper.unmount()
  }
})

it('桌面标题显示传入的文字，而不是模板 DOM 引用', () => {
  const wrapper = mount(TabBar, {
    props: {
      desktop: true,
      title: 'KCQ Desktop',
      workspaceId: 'desktop',
      tabs: [{ id: 'a', spec: null }],
      activeTabId: 'a',
      accent: 'currentColor',
    },
  })
  try {
    expect(wrapper.get('.tab-bar__title').text()).toBe('KCQ Desktop')
  } finally {
    wrapper.unmount()
  }
})

it('Web 支持本地排序，拖出标签栏也不请求新窗口', async () => {
  const wrapper = mountWebBar()
  let payload = ''
  const dataTransfer = {
    types: ['text/plain'],
    effectAllowed: 'none',
    dropEffect: 'none',
    setData: (_type: string, value: string) => {
      payload = value
    },
    getData: () => payload,
  }
  try {
    const tab = wrapper.get('[data-tab-id="b"]')
    await tab.trigger('dragstart', { dataTransfer })
    await wrapper.get('.tab-bar__list').trigger('dragover', { dataTransfer, clientX: -1 })
    await wrapper.get('header').trigger('drop', { dataTransfer })
    await tab.trigger('dragend', { dataTransfer, clientX: 9999, clientY: 9999 })
    expect(wrapper.emitted('reorder')).toEqual([['b', 'a', 'before']])
    await tab.trigger('dragstart', { dataTransfer })
    window.dispatchEvent(new Event('drop', { cancelable: true }))
    await tab.trigger('dragend', { dataTransfer, clientX: 9999, clientY: 9999 })
    expect(wrapper.emitted('detach')).toBeUndefined()
    expect(wrapper.emitted('adopt')).toBeUndefined()
  } finally {
    wrapper.unmount()
  }
})

it('Web 忽略其他页面拖入的标签，即使它们使用相同工作区身份', async () => {
  const wrapper = mountWebBar()
  try {
    for (const fromWorkspaceId of ['other-page', 'web']) {
      await wrapper.get('header').trigger('drop', {
        dataTransfer: { getData: () => JSON.stringify({ fromWorkspaceId, tabId: 'b' }) },
      })
    }
    expect(wrapper.emitted('adopt')).toBeUndefined()
    expect(wrapper.emitted('reorder')).toBeUndefined()
  } finally {
    wrapper.unmount()
  }
})

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
      desktop: true,
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
