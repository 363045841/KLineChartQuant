/** 编辑器身份直接约束 CodeMirror，内置展示与用户草稿切换不另建编辑器。 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import ScriptEditorWorkspace from './ScriptEditorWorkspace.vue'

describe('ScriptEditorWorkspace', () => {
  it('内置脚本只读并提供副本入口，切换用户身份后允许编辑', async () => {
    const wrapper = mount(ScriptEditorWorkspace, {
      props: { source: '// builtin', identity: 'builtin' },
      attachTo: document.body,
    })
    try {
      await nextTick()
      expect(wrapper.find('.script-workspace__readonly').text()).toContain('内置脚本只读')
      expect(wrapper.find('.cm-content').attributes('contenteditable')).toBe('false')
      const copyButton = wrapper.findAll('button').find((button) => button.text() === '创建副本')!
      await copyButton.trigger('click')
      expect(wrapper.emitted('create-copy')).toHaveLength(1)
      await wrapper.setProps({ identity: 'user', source: '// user' })
      expect(wrapper.find('.script-workspace__readonly').exists()).toBe(false)
      expect(wrapper.find('.cm-content').attributes('contenteditable')).toBe('true')
      await wrapper.setProps({ saving: true })
      expect(wrapper.find('.cm-content').attributes('contenteditable')).toBe('false')
    } finally {
      wrapper.unmount()
    }
  })
})
