/** 编辑器身份直接约束 CodeMirror，内置展示与用户草稿切换不另建编辑器。 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { EditorView } from '@codemirror/view'
import { undo } from '@codemirror/commands'
import { useScriptEditor, type ScriptEditorSession } from '../../composables/chart/useScriptEditor.js'
import ScriptEditorWorkspace from './ScriptEditorWorkspace.vue'
import { createEditorTabState } from '../../composables/chart/scriptEditor/__tests__/helpers/editorTabState.js'

describe('ScriptEditorWorkspace', () => {
  it('目录搜索折叠、标签切换保留独立撤销历史，关闭脏标签先确认', async () => {
    let session!: ScriptEditorSession
    const wrapper = mount(defineComponent({
      setup() {
        session = useScriptEditor(undefined)
        session.openBlank()
        session.source.value = 'const indicator = 1'
        session.openBlank('library')
        session.source.value = 'const library = 2'
        return () => h(ScriptEditorWorkspace, {
          tabs: session.tabs.value, activeTabId: session.activeTabId.value, documents: session.documents.value,
          source: session.source.value, kind: session.kind.value, identity: session.identity.value,
          trusted: session.trusted.value, theme: 'dark',
          'onUpdate:source': (text: string) => { session.source.value = text },
          onSelectTab: session.selectTab, onCloseTab: session.closeTab,
        })
      },
    }), { attachTo: document.body })
    try {
      await nextTick()
      expect(wrapper.findAll('.script-files__folder-toggle')).toHaveLength(2)
      await wrapper.get('input[aria-label="搜索指标和库"]').setValue('MYLIBRARY')
      expect(wrapper.findAll('.script-files__file')).toHaveLength(1)
      expect(wrapper.get('.script-files__file').text()).toContain('myLibrary.ts')
      await wrapper.get('input[aria-label="搜索指标和库"]').setValue('.ts')
      expect(wrapper.findAll('.script-files__file')).toHaveLength(2)
      await wrapper.get('input[aria-label="搜索指标和库"]').setValue('不存在')
      expect(wrapper.get('.script-files__empty').text()).toContain('未找到匹配文件')
      await wrapper.get('input[aria-label="搜索指标和库"]').setValue('')
      // 新建入口在目录行右侧，按目录类型创建。
      await wrapper.get('button[aria-label="新建库"]').trigger('click')
      expect(wrapper.findComponent(ScriptEditorWorkspace).emitted('create-script')).toEqual([['library']])
      await wrapper.get('button[aria-label="收起文件目录"]').trigger('click')
      expect(wrapper.get('nav[aria-label="脚本文件目录"]').classes()).toContain('is-collapsed')
      await wrapper.get('button[aria-label="展开文件目录"]').trigger('click')
      expect(wrapper.get('nav[aria-label="脚本文件目录"]').classes()).not.toContain('is-collapsed')
      await wrapper.findAll('.script-files__folder-toggle')[1]!.trigger('click')
      expect(wrapper.findAll('.script-files__list')[1]!.isVisible()).toBe(false)
      const view = EditorView.findFromDOM(wrapper.get<HTMLElement>('.cm-editor').element)
      if (!view) throw new Error('CodeMirror 未挂载')
      view.dispatch({ changes: { from: view.state.doc.length, insert: '\n// library edit' } })
      await nextTick()
      await wrapper.findAll('.script-tabs [role="tab"]')[0]!.trigger('click')
      expect(view.state.doc.toString()).toBe('const indicator = 1')
      view.dispatch({ changes: { from: view.state.doc.length, insert: '\n// indicator edit' } })
      await nextTick()
      await wrapper.findAll('.script-tabs [role="tab"]')[1]!.trigger('click')
      expect(view.state.doc.toString()).toContain('library edit')
      expect(undo(view)).toBe(true)
      await nextTick()
      expect(session.source.value).toBe('const library = 2')
      await wrapper.findAll('.script-tabs [role="tab"]')[0]!.trigger('click')
      expect(view.state.doc.toString()).toContain('indicator edit')
      await wrapper.get('button[aria-label="关闭 我的脚本"]').trigger('click')
      expect(wrapper.findAll('.script-tabs [role="tab"]')).toHaveLength(2)
      expect(wrapper.get('.script-tabs__confirmation').text()).toContain('尚未保存')
      await wrapper.get('.script-tabs__confirmation button:last-child').trigger('click')
      expect(wrapper.findAll('.script-tabs [role="tab"]')).toHaveLength(1)
      expect(session.kind.value).toBe('library')
      // 中键关闭与关闭按钮共用确认流程，最后一个脏标签也能收起。
      await wrapper.get('.script-tabs__item').trigger('auxclick', { button: 1 })
      expect(wrapper.findAll('.script-tabs [role="tab"]')).toHaveLength(1)
      expect(wrapper.get('.script-tabs__confirmation').text()).toContain('myLibrary')
      await wrapper.get('.script-tabs__confirmation button:last-child').trigger('click')
      expect(wrapper.findAll('.script-tabs [role="tab"]')).toHaveLength(0)
      expect(wrapper.find('.script-workspace__empty').exists()).toBe(true)
    } finally { wrapper.unmount() }
  })
  it('内置脚本只读并提供副本入口，切换用户身份后允许编辑', async () => {
    const wrapper = mount(ScriptEditorWorkspace, {
      props: { ...createEditorTabState(), source: '// builtin', identity: 'builtin', trusted: false, theme: 'dark' },
      attachTo: document.body,
    })
    try {
      await nextTick()
      expect(wrapper.find('.script-workspace__readonly').text()).toContain('内置脚本只读')
      expect(wrapper.find('.cm-content').attributes('contenteditable')).toBe('false')
      // 信任是操作栏里的盾牌按钮，内置只读时禁用。
      const trustButton = wrapper.get<HTMLButtonElement>('button[aria-label="信任脚本"]')
      expect(trustButton.element.disabled).toBe(true)
      expect(wrapper.find('.script-workspace__trust-check').exists()).toBe(false)
      const copyButton = wrapper.findAll('button').find((button) => button.text() === '创建副本')!
      await copyButton.trigger('click')
      expect(wrapper.emitted('create-copy')).toHaveLength(1)
      await wrapper.setProps({ identity: 'user', source: '// user' })
      expect(wrapper.find('.script-workspace__readonly').exists()).toBe(false)
      expect(wrapper.find('.cm-content').attributes('contenteditable')).toBe('true')
      trustButton.element.click()
      await nextTick()
      expect(wrapper.emitted('update:trusted')).toEqual([[true]])
      // 已信任时盾牌右下角出现勾，并切换为取消信任语义。
      await wrapper.setProps({ trusted: true })
      expect(wrapper.get('button[aria-label="取消信任脚本"]').attributes('aria-pressed')).toBe('true')
      expect(wrapper.find('.script-workspace__trust-check').exists()).toBe(true)
      await wrapper.setProps({ saving: true })
      await nextTick()
      expect(wrapper.find('.cm-content').attributes('contenteditable')).toBe('false')
    } finally {
      wrapper.unmount()
    }
  })

  it('保存入口在操作栏，Ctrl+S 与按钮共用同一提交事件', async () => {
    const wrapper = mount(ScriptEditorWorkspace, {
      props: { ...createEditorTabState(), source: '// user', identity: 'user', trusted: false, theme: 'dark' },
      attachTo: document.body,
    })
    try {
      await nextTick()
      await wrapper.get('button[aria-label="保存"]').trigger('click')
      expect(wrapper.emitted('save')).toHaveLength(1)
      await wrapper.get('.script-workspace').trigger('keydown', { key: 's', ctrlKey: true })
      expect(wrapper.emitted('save')).toHaveLength(2)
      await wrapper.setProps({ saved: true })
      expect(wrapper.find('button[aria-label="已保存"]').exists()).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })

  it('独立窗口启用返回入口并回传事件', async () => {
    const wrapper = mount(ScriptEditorWorkspace, {
      props: { ...createEditorTabState(), source: '', identity: 'user', trusted: false, theme: 'dark', returnable: true },
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
