/** 验证真实 CodeMirror 工作区在移动端跳过服务，以及异步初始化期间的设备切换。 */
import type { Extension } from '@codemirror/state'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import ScriptEditorWorkspace from './ScriptEditorWorkspace.vue'

const language = vi.hoisted(() => ({
  create: vi.fn(),
  initialize: vi.fn<(source: () => string) => Promise<Extension>>(),
  dispose: vi.fn(),
  formatDocument: vi.fn(),
}))

vi.mock('@363045841yyt/klinechart-script-server', () => ({
  createScriptLanguageSupport: () => {
    language.create()
    return language
  },
}))

/** 通过浏览器设备信息驱动共享状态，编辑器不接收测试专用开关。 */
function setDevice(userAgent: string): void {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent)
  window.dispatchEvent(new Event('resize'))
}

/** 创建具有真实编辑视图的用户脚本工作区。 */
function mountEditor() {
  return mount(ScriptEditorWorkspace, {
    props: { source: 'const value = 1', identity: 'user', trusted: false },
    attachTo: document.body,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  language.initialize.mockResolvedValue([])
})

afterEach(() => vi.restoreAllMocks())

describe('Script 编辑器设备策略', () => {
  it.each(['Mozilla/5.0 (iPhone) Mobile', 'Mozilla/5.0 (Linux; Android 14)', 'Mozilla/5.0 (iPad)'])(
    '移动设备 %s 保留编辑并跳过语言服务',
    async (ua) => {
      setDevice(ua)
      const wrapper = mountEditor()
      try {
        await flushPromises()
        expect(wrapper.find('.cm-content').attributes('contenteditable')).toBe('true')
        expect(wrapper.find('.cm-content').text()).toBe('const value = 1')
        expect(language.create).not.toHaveBeenCalled()
        expect(wrapper.find('button[aria-label="格式化"]').attributes('disabled')).toBeDefined()
        expect(wrapper.find('.script-workspace__spinner').exists()).toBe(false)
        expect(wrapper.find('[role="alert"]').exists()).toBe(false)
        await wrapper.setProps({ source: 'const value = 2' })
        expect(wrapper.find('.cm-content').text()).toBe('const value = 2')
      } finally {
        wrapper.unmount()
      }
    },
  )

  it('桌面启动服务，切换到手机时释放服务并保留同一个编辑视图', async () => {
    setDevice('Mozilla/5.0 (Windows NT 10.0)')
    const wrapper = mountEditor()
    try {
      await flushPromises()
      expect(language.create).toHaveBeenCalledOnce()
      expect(wrapper.find('button[aria-label="格式化"]').attributes('disabled')).toBeUndefined()
      const content = wrapper.find('.cm-content').element
      await wrapper.setProps({ source: 'const draft = 42' })
      setDevice('Mozilla/5.0 (iPhone) Mobile')
      await nextTick()
      expect(language.dispose).toHaveBeenCalledOnce()
      expect(wrapper.find('.cm-content').element).toBe(content)
      expect(wrapper.find('.cm-content').text()).toBe('const draft = 42')
      expect(wrapper.find('button[aria-label="格式化"]').attributes('disabled')).toBeDefined()
    } finally {
      wrapper.unmount()
    }
    expect(language.dispose).toHaveBeenCalledOnce()
  })

  it('初始化未完成时切到手机，迟到的结果不会重新启用服务', async () => {
    let complete: (extensions: Extension) => void = () => {}
    language.initialize.mockReturnValue(
      new Promise<Extension>((resolve) => {
        complete = resolve
      }),
    )
    setDevice('Mozilla/5.0 (Windows NT 10.0)')
    const wrapper = mountEditor()
    try {
      await flushPromises()
      expect(language.initialize).toHaveBeenCalledOnce()
      setDevice('Mozilla/5.0 (iPhone) Mobile')
      await nextTick()
      expect(language.dispose).toHaveBeenCalledOnce()
      complete([])
      await flushPromises()
      expect(wrapper.find('button[aria-label="格式化"]').attributes('disabled')).toBeDefined()
      expect(wrapper.find('.script-workspace__spinner').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })
})
