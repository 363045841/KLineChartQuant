/** 编辑器身份直接约束 CodeMirror，内置展示与用户草稿切换不另建编辑器。 */

import { undo } from '@codemirror/commands'
import { EditorView } from '@codemirror/view'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { createEditorTabState } from '../../composables/chart/scriptEditor/__tests__/helpers/editorTabState.js'
import {
  type ScriptEditorSession,
  useScriptEditor,
} from '../../composables/chart/useScriptEditor.js'
import ScriptEditorWorkspace from './ScriptEditorWorkspace.vue'

describe('ScriptEditorWorkspace', () => {
  it('拖动标签发出统一移动命令，未保存圆点在标签左侧、目录右侧且无文件图标', async () => {
    const state = createEditorTabState()
    const first = state.tabs[0]!
    const tabs = [
      { ...first, dirty: true },
      { ...first, id: 'second', title: 'Second', definitionId: null, dirty: true },
    ]
    const wrapper = mount(ScriptEditorWorkspace, {
      props: {
        ...state,
        tabs,
        source: '// draft',
        identity: 'user',
        trusted: false,
        theme: 'dark',
      },
    })
    try {
      const items = wrapper.findAll('.script-tabs__item')
      await items[0]!.trigger('dragstart')
      await items[1]!.trigger('dragover')
      expect(items[1]!.classes()).toContain('is-drop-target')
      await items[1]!.trigger('drop')
      expect(wrapper.emitted('move-tab')).toEqual([[first.id, 'second']])
      const tab = wrapper.get('.script-tabs__select')
      expect(tab.element.firstElementChild?.classList.contains('script-dirty-indicator')).toBe(true)
      expect(tab.find('svg').exists()).toBe(false)
      const file = wrapper.get('.script-files__file')
      expect(file.element.lastElementChild?.classList.contains('script-dirty-indicator')).toBe(true)
      expect(file.find('svg').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('目录错误只留在目录区域，当前文档失败才展开问题页', async () => {
    const wrapper = mount(ScriptEditorWorkspace, {
      props: {
        ...createEditorTabState(),
        source: '// draft',
        identity: 'user',
        trusted: false,
        theme: 'dark',
      },
    })
    try {
      const problemsTab = () => wrapper.get('[data-panel="problems"]').attributes('aria-selected')
      expect(problemsTab()).toBe('false')

      await wrapper.setProps({ treeError: '文件夹仍被引用：均线' })
      expect(wrapper.get('.script-files__error').text()).toContain('文件夹仍被引用')
      // 目录操作失败不冒充代码问题，也不抢走底部面板。
      expect(problemsTab()).toBe('false')

      await wrapper.setProps({ executionError: '脚本运行失败' })
      expect(problemsTab()).toBe('true')
    } finally {
      wrapper.unmount()
    }
  })

  it('右侧快捷操作只展示图标，运行和添加独立发出命令，库与执行中禁用', async () => {
    const wrapper = mount(ScriptEditorWorkspace, {
      props: {
        ...createEditorTabState(),
        source: '// draft',
        identity: 'user',
        trusted: false,
        theme: 'dark',
      },
    })
    try {
      const actions = wrapper.get('.script-quick-actions')
      expect(actions.text()).toBe('')
      expect(actions.element.parentElement?.querySelector('.script-tabs')).not.toBeNull()
      await wrapper.get('button[aria-label="运行代码"]').trigger('click')
      await wrapper.get('button[aria-label="添加到图表"]').trigger('click')
      expect(wrapper.emitted('run')).toEqual([[]])
      expect(wrapper.emitted('add-to-chart')).toEqual([[]])
      await wrapper.setProps({ executing: 'run' })
      expect(wrapper.get<HTMLButtonElement>('button[aria-label="运行代码"]').element.disabled).toBe(
        true,
      )
      expect(
        wrapper.get<HTMLButtonElement>('button[aria-label="添加到图表"]').element.disabled,
      ).toBe(true)
      await wrapper.setProps({ executing: null, kind: 'library' })
      expect(wrapper.get<HTMLButtonElement>('button[aria-label="运行代码"]').element.disabled).toBe(
        true,
      )
      expect(
        wrapper.get<HTMLButtonElement>('button[aria-label="添加到图表"]').element.disabled,
      ).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })

  it('目录搜索折叠、标签切换保留独立撤销历史，关闭脏标签先确认', async () => {
    let session!: ScriptEditorSession
    const wrapper = mount(
      defineComponent({
        setup() {
          session = useScriptEditor(undefined)
          session.openBlank()
          session.source.value = 'const indicator = 1'
          session.openBlank('library')
          session.source.value = 'const library = 2'
          return () =>
            h(ScriptEditorWorkspace, {
              tabs: session.tabs.value,
              activeTabId: session.activeTabId.value,
              documents: session.documents.value,
              source: session.source.value,
              kind: session.kind.value,
              identity: session.identity.value,
              trusted: session.trusted.value,
              theme: 'dark',
              'onUpdate:source': (text: string) => {
                session.source.value = text
              },
              onSelectTab: session.selectTab,
              onCloseTab: session.closeTab,
            })
        },
      }),
      { attachTo: document.body },
    )
    try {
      await nextTick()
      expect(wrapper.findAll('.script-files__dir')).toHaveLength(2)
      await wrapper.get('input[aria-label="搜索指标和库"]').setValue('MYLIBRARY')
      expect(wrapper.findAll('.script-files__file')).toHaveLength(1)
      expect(wrapper.get('.script-files__file').text()).toContain('myLibrary.ts')
      await wrapper.get('input[aria-label="搜索指标和库"]').setValue('.ts')
      expect(wrapper.findAll('.script-files__file')).toHaveLength(2)
      await wrapper.get('input[aria-label="搜索指标和库"]').setValue('不存在')
      expect(wrapper.get('.script-files__empty').text()).toContain('未找到匹配文件')
      await wrapper.get('input[aria-label="搜索指标和库"]').setValue('')
      // 根目录也是文件夹行，新建入口在行右侧。
      await wrapper.get('button[aria-label="在库中新建文件"]').trigger('click')
      expect(wrapper.findComponent(ScriptEditorWorkspace).emitted('tree-action')).toEqual([
        [{ type: 'create-file', kind: 'library', folder: '' }],
      ])
      await wrapper.get('button[aria-label="收起文件目录"]').trigger('click')
      expect(wrapper.get('nav[aria-label="脚本文件目录"]').classes()).toContain('is-collapsed')
      await wrapper.get('button[aria-label="展开文件目录"]').trigger('click')
      expect(wrapper.get('nav[aria-label="脚本文件目录"]').classes()).not.toContain('is-collapsed')
      const libraryRoot = wrapper
        .findAll('.script-files__dir')
        .find((dir) => dir.text().includes('库'))!
      await libraryRoot.trigger('click')
      expect(wrapper.get('.script-files').text()).not.toContain('myLibrary.ts')
      await libraryRoot.trigger('click')
      expect(wrapper.get('.script-files').text()).toContain('myLibrary.ts')
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
    } finally {
      wrapper.unmount()
    }
  })
  it('文件目录右键复用编辑器菜单，提供新建、复制与删除', async () => {
    const state = createEditorTabState()
    const documents = [
      {
        kind: 'indicator' as const,
        trusted: false,
        id: 'test-file',
        definition: { name: '测试指标' },
        source: '// a',
        revision: 1,
        identity: 'builtin' as const,
        folder: '策略',
      },
      {
        kind: 'indicator' as const,
        trusted: false,
        id: 'root-file',
        definition: { name: '根指标' },
        source: '// b',
        revision: 1,
        identity: 'user' as const,
        folder: '',
      },
    ]
    const wrapper = mount(ScriptEditorWorkspace, {
      props: {
        ...state,
        documents,
        folders: [{ kind: 'indicator', path: '策略' }],
        source: '// a',
        identity: 'builtin',
        trusted: false,
        theme: 'dark',
      },
      attachTo: document.body,
    })
    const buttons = () =>
      Array.from(document.querySelectorAll<HTMLButtonElement>('.klc-script-menu button'))
    const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
    try {
      await nextTick()
      expect(wrapper.findAll('.script-files__dir').map((dir) => dir.text())).toEqual(
        expect.arrayContaining([expect.stringContaining('策略')]),
      )
      const file = wrapper
        .findAll('.script-files__file')
        .find((item) => item.text().includes('测试指标'))!
      await file.trigger('contextmenu', { clientX: 40, clientY: 40 })
      expect(buttons().map((button) => button.textContent)).toEqual([
        '新建文件',
        '新建文件夹',
        '复制文件',
        '删除文件',
      ])
      // 内置脚本不允许从目录删除，菜单给出禁用原因。
      expect(buttons()[3]!.disabled).toBe(true)
      buttons()[0]!.click()
      await flush()
      expect(wrapper.emitted('tree-action')).toEqual([
        [{ type: 'create-file', kind: 'indicator', folder: '策略' }],
      ])
      expect(buttons()).toHaveLength(0)
      // 新建文件夹在菜单内命名，提交后把完整路径交给会话。
      await file.trigger('contextmenu', { clientX: 40, clientY: 40 })
      buttons()[1]!.click()
      await nextTick()
      const input = document.querySelector<HTMLInputElement>('.klc-script-input')!
      input.value = '新目录'
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await flush()
      expect(wrapper.emitted('tree-action')?.at(-1)).toEqual([
        { type: 'create-folder', kind: 'indicator', path: '策略/新目录' },
      ])
    } finally {
      wrapper.unmount()
    }
  })
  it('文件目录按层级缩进，文件夹内文件比父文件夹再进一级', async () => {
    const state = createEditorTabState()
    const documents = [
      {
        kind: 'indicator' as const,
        trusted: false,
        id: 'root-file',
        definition: { name: '根指标' },
        source: '// b',
        revision: 1,
        identity: 'user' as const,
        folder: '',
      },
      {
        kind: 'indicator' as const,
        trusted: false,
        id: 'l1-file',
        definition: { name: '一级指标' },
        source: '// c',
        revision: 1,
        identity: 'user' as const,
        folder: '一级',
      },
      {
        kind: 'indicator' as const,
        trusted: false,
        id: 'l2-file',
        definition: { name: '二级指标' },
        source: '// d',
        revision: 1,
        identity: 'user' as const,
        folder: '一级/二级',
      },
    ]
    const wrapper = mount(ScriptEditorWorkspace, {
      props: {
        ...state,
        documents,
        folders: [
          { kind: 'indicator', path: '一级' },
          { kind: 'indicator', path: '一级/二级' },
        ],
        source: '// a',
        identity: 'user',
        trusted: false,
        theme: 'dark',
      },
      attachTo: document.body,
    })
    /** 行只暴露层级变量，像素换算在 CSS；这里校验层级是否正确传递。 */
    const depthOf = (element: Element) =>
      (element as HTMLElement).style.getPropertyValue('--script-tree-depth')
    try {
      await nextTick()
      const dirs = wrapper.findAll('.script-files__dir')
      // 根目录是第 0 层，一级、二级依次递减缩进。
      expect(dirs.map((dir) => depthOf(dir.element))).toEqual(['0', '1', '2', '0'])
      const files = Object.fromEntries(
        wrapper
          .findAll('.script-files__file')
          .map((file) => [
            (file.element as HTMLElement).textContent?.replace('.ts', '') ?? '',
            depthOf(file.element),
          ]),
      )
      expect(files).toEqual({ 根指标: '1', 一级指标: '2', 二级指标: '3' })
    } finally {
      wrapper.unmount()
    }
  })

  it('未保存草稿仍是文件菜单，复制和删除禁用并说明原因', async () => {
    const draft = {
      id: 'draft-tab',
      definitionId: null,
      title: '新脚本',
      kind: 'indicator' as const,
      dirty: true,
      folder: '',
    }
    const wrapper = mount(ScriptEditorWorkspace, {
      props: {
        tabs: [draft],
        activeTabId: draft.id,
        source: '// draft',
        identity: 'user',
        trusted: false,
        theme: 'dark',
      },
      attachTo: document.body,
    })
    const buttons = () =>
      Array.from(document.querySelectorAll<HTMLButtonElement>('.klc-script-menu button'))
    try {
      await nextTick()
      const file = wrapper.get('.script-files__file')
      expect(file.text()).toContain('新脚本')
      // 草稿行点击切换标签，而不是走文档打开链路。
      await file.trigger('click')
      expect(wrapper.emitted('select-tab')).toEqual([[draft.id]])
      await file.trigger('contextmenu', { clientX: 20, clientY: 20 })
      expect(buttons().map((button) => button.textContent)).toEqual([
        '新建文件',
        '新建文件夹',
        '复制文件',
        '删除文件',
      ])
      expect(buttons()[2]!.disabled).toBe(true)
      expect(buttons()[2]!.title).toBe('未保存的草稿，请先保存')
      expect(buttons()[3]!.disabled).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })

  it('文件夹右键可删除，分组根没有删除入口，删除前二次确认', async () => {
    const state = createEditorTabState()
    const wrapper = mount(ScriptEditorWorkspace, {
      props: {
        ...state,
        folders: [{ kind: 'indicator', path: '策略' }],
        source: '// a',
        identity: 'user',
        trusted: false,
        theme: 'dark',
      },
      attachTo: document.body,
    })
    const buttons = () =>
      Array.from(document.querySelectorAll<HTMLButtonElement>('.klc-script-menu button'))
    const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
    try {
      await nextTick()
      // 根目录与普通文件夹共用同一份菜单，只是删除被禁用。
      const root = wrapper.findAll('.script-files__dir').find((dir) => dir.text().includes('指标'))!
      await root.trigger('contextmenu', { clientX: 10, clientY: 10 })
      expect(buttons().map((button) => button.textContent)).toEqual([
        '新建文件',
        '新建文件夹',
        '删除文件夹',
      ])
      expect(buttons()[2]!.disabled).toBe(true)
      expect(buttons()[2]!.title).toBe('分组根目录不能删除')
      const folder = wrapper
        .findAll('.script-files__dir')
        .find((dir) => dir.text().includes('策略'))!
      await folder.trigger('contextmenu', { clientX: 10, clientY: 10 })
      expect(buttons().map((button) => button.textContent)).toEqual([
        '新建文件',
        '新建文件夹',
        '删除文件夹',
      ])
      expect(buttons()[2]!.disabled).toBe(false)
      buttons()[2]!.click()
      await nextTick()
      // 删除先进入菜单内确认，不给误点直接删除的机会。
      expect(buttons().map((button) => button.textContent)).toEqual(['取消', '删除文件夹'])
      buttons()[1]!.click()
      await flush()
      expect(wrapper.emitted('tree-action')).toEqual([
        [{ type: 'remove-folder', kind: 'indicator', path: '策略' }],
      ])
    } finally {
      wrapper.unmount()
    }
  })

  it('内置脚本只读并提供副本入口，切换用户身份后允许编辑', async () => {
    const wrapper = mount(ScriptEditorWorkspace, {
      props: {
        ...createEditorTabState(),
        source: '// builtin',
        identity: 'builtin',
        trusted: false,
        theme: 'dark',
      },
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
      expect(wrapper.get('button[aria-label="取消信任脚本"]').attributes('aria-pressed')).toBe(
        'true',
      )
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
      props: {
        ...createEditorTabState(),
        source: '// user',
        identity: 'user',
        trusted: false,
        theme: 'dark',
      },
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
      props: {
        ...createEditorTabState(),
        source: '',
        identity: 'user',
        trusted: false,
        theme: 'dark',
        returnable: true,
      },
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
