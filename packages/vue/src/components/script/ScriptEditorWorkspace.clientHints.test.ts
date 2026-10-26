/** 验证 UA-CH 结算前编辑器不会按同步估计提前启动语言服务。 */
import type { Extension } from '@codemirror/state'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ScriptEditorWorkspace from './ScriptEditorWorkspace.vue'
import { createEditorTabState } from '../../composables/chart/scriptEditor/__tests__/helpers/editorTabState.js'

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

/** 安装延迟结算的 Client Hints，保留对结算时机的控制。 */
function setPendingClientHints(): (formFactors: readonly string[]) => void {
  let resolveHints: (value: { formFactors: readonly string[] }) => void = () => {}
  Object.defineProperty(window.navigator, 'userAgentData', {
    configurable: true,
    value: {
      mobile: false,
      getHighEntropyValues: () =>
        new Promise<{ formFactors: readonly string[] }>((resolve) => {
          resolveHints = resolve
        }),
    },
  })
  return (formFactors) => resolveHints({ formFactors })
}

/** 设置桌面 UA；同步估计为 desktop，异步结果才能把它改为 tablet。 */
function setDesktopDevice(): void {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
    'Mozilla/5.0 (Windows NT 10.0)',
  )
  Object.defineProperty(window.navigator, 'maxTouchPoints', { configurable: true, value: 0 })
  window.dispatchEvent(new Event('resize'))
}

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(window.navigator, 'userAgentData')
  Reflect.deleteProperty(window.navigator, 'maxTouchPoints')
})

describe('Script 编辑器的 Client Hints 门控', () => {
  it('formFactors 结算为平板前不启动语言服务，结算后也不启动', async () => {
    const resolveHints = setPendingClientHints()
    setDesktopDevice()
    language.initialize.mockResolvedValue([])
    const wrapper = mount(ScriptEditorWorkspace, {
      props: { ...createEditorTabState(), source: 'const value = 1', identity: 'user', trusted: false, theme: 'dark' },
      attachTo: document.body,
    })
    try {
      await flushPromises()
      expect(wrapper.find('.cm-content').attributes('contenteditable')).toBe('true')
      expect(language.create).not.toHaveBeenCalled()

      resolveHints(['Tablet'])
      await flushPromises()
      expect(language.create).not.toHaveBeenCalled()
    } finally {
      wrapper.unmount()
    }
  })
})
