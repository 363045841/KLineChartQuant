/** 验证输出面板的文本安全、图标操作和折叠状态。 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ScriptEditorPanels from './ScriptEditorPanels.vue'

describe('脚本输出面板', () => {
  it('用图标清空和折叠，展开后保留原有输出，文本不作为 HTML 执行', async () => {
    const wrapper = mount(ScriptEditorPanels, {
      props: {
        logs: [
          { kind: 'log', level: 'error', time: 1, barIndex: 2, message: '<script>danger</script>' },
        ],
      },
      global: { stubs: { BaseTooltip: { inheritAttrs: false, template: '<slot />' } } },
    })
    expect(wrapper.find('[role="tab"][aria-selected="true"]').text()).toContain('输出')
    expect(wrapper.find('.script-output__message').text()).toBe('<script>danger</script>')
    expect(wrapper.find('script').exists()).toBe(false)
    const clear = wrapper.get('button[aria-label="清空输出"]')
    expect(clear.find('svg').exists()).toBe(true)
    expect(clear.text()).toBe('')
    await clear.trigger('click')
    expect(wrapper.emitted('clear')).toHaveLength(1)
    await wrapper.get('button[aria-label="折叠面板"]').trigger('click')
    expect(wrapper.get('button[aria-label="展开面板"]').attributes('aria-expanded')).toBe('false')
    expect(wrapper.get<HTMLElement>('[role="tabpanel"]').element.style.display).toBe('none')
    await wrapper.get('button[aria-label="展开面板"]').trigger('click')
    expect(wrapper.get<HTMLElement>('[role="tabpanel"]').element.style.display).toBe('')
    wrapper.unmount()
  })

  it('切换问题 Tab，显示诊断数量和位置，点击问题发出跳转请求', async () => {
    const problem = {
      severity: 'error',
      message: 'Cannot find name missing',
      source: 'ts',
      location: { from: 2, to: 9, line: 1, column: 3 },
    } satisfies import('@vue-src/composables/chart/scriptEditor/types.js').ScriptEditorProblem
    const wrapper = mount(ScriptEditorPanels, {
      props: { logs: [], problems: [problem] },
      global: { stubs: { BaseTooltip: { inheritAttrs: false, template: '<slot />' } } },
    })
    const tab = wrapper.get('[data-panel="problems"]')
    expect(tab.text()).toContain('问题 (1)')
    await tab.trigger('click')
    expect(tab.attributes('aria-selected')).toBe('true')
    expect(wrapper.get('.script-problems__location').text()).toContain('[1:3]')
    expect(wrapper.find('button[aria-label="清空输出"]').exists()).toBe(false)
    await wrapper.get('.script-problems__item').trigger('click')
    expect(wrapper.emitted('reveal-problem')).toEqual([[problem]])
    await tab.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.get('[data-panel="output"]').attributes('aria-selected')).toBe('true')
    wrapper.unmount()
  })
})
