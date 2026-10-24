/** 编辑器身份直接约束 CodeMirror，内置展示与用户草稿切换不另建编辑器。 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import BaseTooltip from '../common/BaseTooltip.vue'
import ScriptEditorWorkspace from './ScriptEditorWorkspace.vue'

describe('ScriptEditorWorkspace', () => {
  it('内置脚本只读并提供副本入口，切换用户身份后允许编辑', async () => {
    const wrapper = mount(ScriptEditorWorkspace, {
      props: { source: '// builtin', identity: 'builtin', trusted: false, theme: 'dark' },
      attachTo: document.body,
    })
    try {
      await nextTick()
      expect(wrapper.find('.script-workspace__readonly').text()).toContain('内置脚本只读')
      expect(wrapper.find('.cm-content').attributes('contenteditable')).toBe('false')
      const trustSwitch = wrapper.find('input[aria-label="信任脚本"]')
      expect(trustSwitch.attributes('disabled')).toBeDefined()
      // 提示额外说明内置脚本默认受信任。
      expect(wrapper.findComponent(BaseTooltip).props('content')).toContain('内置脚本默认信任')
      expect(wrapper.findComponent(BaseTooltip).props('content')).toContain(
        '不受 QuickJS 的内存限制和超时中断保护',
      )
      const copyButton = wrapper.findAll('button').find((button) => button.text() === '创建副本')!
      await copyButton.trigger('click')
      expect(wrapper.emitted('create-copy')).toHaveLength(1)
      await wrapper.setProps({ identity: 'user', source: '// user' })
      expect(wrapper.find('.script-workspace__readonly').exists()).toBe(false)
      expect(wrapper.find('.cm-content').attributes('contenteditable')).toBe('true')
      expect(trustSwitch.attributes('disabled')).toBeUndefined()
      await trustSwitch.setValue(true)
      expect(wrapper.emitted('update:trusted')).toEqual([[true]])
      await wrapper.setProps({ saving: true })
      expect(wrapper.find('.cm-content').attributes('contenteditable')).toBe('false')
      expect(trustSwitch.attributes('disabled')).toBeDefined()
    } finally {
      wrapper.unmount()
    }
  })

  it('独立窗口启用返回入口并回传事件', async () => {
    const wrapper = mount(ScriptEditorWorkspace, {
      props: { source: '', identity: 'user', trusted: false, theme: 'dark', returnable: true },
      attachTo: document.body,
    })
    try {
      await nextTick()
      const button = wrapper.get('button[aria-label="返回标签页"]')
      await button.trigger('click')
      expect(wrapper.emitted('return')).toHaveLength(1)
    } finally {
      wrapper.unmount()
    }
  })
})
