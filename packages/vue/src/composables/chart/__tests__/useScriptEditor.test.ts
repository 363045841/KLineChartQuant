/** 编辑器通过正式脚本服务打开、保存，并拒绝覆盖另一会话的新版本。 */
import 'fake-indexeddb/auto'

import source from '@363045841yyt/klinechart-script/scripts/sma.ts?raw'
import { createScriptService, type ScriptWorkspace } from '@363045841yyt/klinechart-script-chart'
import { describe, expect, it, vi } from 'vitest'
import { effectScope, shallowRef } from 'vue'
import { NodeScriptWorker } from '../../../../../script/src/worker/__tests__/nodeWorker.js'
import { createMockChartController } from '../../../__tests__/_mockController.js'
import { useScriptEditor } from '../useScriptEditor.js'

vi.stubGlobal('Worker', NodeScriptWorker)

describe('useScriptEditor', () => {
  it('草稿直接运行产生输出，添加才保存并启用，重复添加不增加实例', async () => {
    const scripts = await createScriptService([], {
      persistence: { load: async () => null, save: async () => true },
    })
    const chart = createMockChartController()
    vi.spyOn(chart, 'withIndicatorData').mockImplementation((compute) =>
      compute([{ time: 1, open: 10, high: 10, low: 10, close: 10, volume: 0 }], {
        symbol: 'TEST',
        loadBars: async () => {
          throw new Error('此用例不请求跨周期行情')
        },
      }),
    )
    const add = vi.spyOn(chart, 'addIndicator').mockReturnValue('debug-instance')
    const scope = effectScope()
    const editor = scope.run(() => useScriptEditor(scripts, shallowRef(chart)))!
    try {
      editor.openBlank()
      editor.source.value = `defineIndicator({ name: 'EditorDebug', position: Position.Sub, onBar() { console.log(close[0]) } })`
      await editor.run()
      expect(editor.error.value).toBeNull()
      expect(editor.executionError.value).toBeNull()
      expect(editor.logs.value.map((event) => event.message)).toEqual(['10'])
      expect(editor.definitionId.value).toBeNull()
      expect(add).not.toHaveBeenCalled()
      await editor.addToChart()
      const id = editor.definitionId.value!
      expect(editor.error.value).toBeNull()
      expect(scripts.read(id)?.revision).toBe(1)
      expect(add).toHaveBeenCalledExactlyOnceWith(id)
      vi.spyOn(chart.indicators, 'peek').mockReturnValue([
        {
          id: 'debug-instance',
          definitionId: id,
          label: 'EditorDebug',
          name: 'EditorDebug',
          role: 'sub',
          ordinal: 0,
          params: {},
        },
      ])
      await editor.addToChart()
      expect(add).toHaveBeenCalledTimes(1)
      expect(scripts.read(id)?.revision).toBe(1)
      await scripts.remove(id, 1)
    } finally {
      scope.stop()
      scripts.dispose()
    }
  })

  it('调试失败只写执行通道，编辑源码后旧结论作废', async () => {
    const scripts = await createScriptService([], {
      persistence: { load: async () => null, save: async () => true },
    })
    const chart = createMockChartController()
    const scope = effectScope()
    const editor = scope.run(() => useScriptEditor(scripts, shallowRef(chart)))!
    try {
      vi.spyOn(chart, 'withIndicatorData').mockRejectedValue(new Error('脚本运行失败'))
      editor.openBlank()
      await editor.run()
      expect(editor.executionError.value).toBe('脚本运行失败')
      // 执行失败不进入保存/目录操作通道，避免底部面板把 IO 错误当代码问题。
      expect(editor.error.value).toBeNull()
      expect(editor.treeError.value).toBeNull()
      editor.source.value = '// 修改后旧结论作废'
      expect(editor.executionError.value).toBeNull()
    } finally {
      scope.stop()
      scripts.dispose()
    }
  })

  it('移动标签保留当前草稿身份、内容和脏状态', () => {
    const scope = effectScope()
    try {
      const editor = scope.run(() => useScriptEditor(undefined))!
      editor.openBlank()
      const first = editor.activeTabId.value!
      editor.source.value = '// first'
      editor.openBlank()
      const second = editor.activeTabId.value!
      editor.source.value = '// second'
      editor.moveTab(second, first)
      expect(editor.tabs.value.map((tab) => tab.id)).toEqual([second, first])
      expect(editor.activeTabId.value).toBe(second)
      expect(editor.source.value).toBe('// second')
      editor.selectTab(first)
      expect(editor.source.value).toBe('// first')
      expect(editor.tabs.value.every((tab) => tab.dirty)).toBe(true)
    } finally {
      scope.stop()
    }
  })

  it('文件夹与文件操作走同一脚本服务，复制保留目录、删除关闭标签', async () => {
    let saved: ScriptWorkspace | null = null
    const scripts = await createScriptService([], {
      persistence: {
        load: async () => saved,
        save: async (workspace) => {
          saved = workspace
          return true
        },
      },
    })
    const scope = effectScope()
    const editor = scope.run(() => useScriptEditor(scripts))!
    try {
      await editor.applyTreeAction({ type: 'create-folder', kind: 'indicator', path: '策略' })
      expect(editor.folders.value).toEqual([{ kind: 'indicator', path: '策略' }])
      editor.openBlank('indicator', '策略')
      editor.source.value = `defineIndicator({ name: 'FolderScript', position: Position.Sub, onBar() {} })`
      await editor.save()
      expect(scripts.read('FolderScript')?.folder).toBe('策略')
      await editor.applyTreeAction({ type: 'copy-file', id: 'FolderScript' })
      const copy = scripts.read('FolderScript 副本')!
      expect(copy.folder).toBe('策略')
      await editor.applyTreeAction({ type: 'delete-file', id: copy.id })
      expect(scripts.read(copy.id)).toBeUndefined()
      expect(editor.tabs.value.some((tab) => tab.definitionId === copy.id)).toBe(false)
      await editor.applyTreeAction({ type: 'create-folder', kind: 'indicator', path: '策略' })
      expect(editor.treeError.value).toContain('已存在')
      await editor.applyTreeAction({
        type: 'create-folder',
        kind: 'indicator',
        path: '策略/子目录',
      })
      expect(editor.folders.value).toHaveLength(2)
      editor.openBlank('indicator', '策略/子目录')
      const childDraft = editor.activeTabId.value!
      editor.openBlank('library')
      const outsideDraft = editor.activeTabId.value!
      await editor.applyTreeAction({ type: 'remove-folder', kind: 'indicator', path: '策略' })
      expect(editor.folders.value).toEqual([])
      expect(scripts.read('FolderScript')).toBeUndefined()
      expect(editor.tabs.value.map((tab) => tab.id)).toEqual([outsideDraft])
      expect(editor.tabs.value.some((tab) => tab.id === childDraft)).toBe(false)
      expect(editor.activeTabId.value).toBe(outsideDraft)
    } finally {
      scope.stop()
      scripts.dispose()
    }
  })

  it('删除提交失败保留标签和未保存源码，错误由统一动作入口反馈', async () => {
    let writable = true
    const scripts = await createScriptService([], {
      persistence: {
        load: async () => null,
        save: async () => writable,
      },
    })
    const scope = effectScope()
    const editor = scope.run(() => useScriptEditor(scripts))!
    try {
      editor.openBlank('library')
      editor.source.value = `defineLibrary('deleteFailureLibrary', { value(): number { return 1 } })`
      await editor.save()
      const id = editor.definitionId.value!
      const tab = editor.activeTabId.value
      editor.source.value += '\n// unsaved'
      const draft = editor.source.value
      writable = false
      await editor.applyTreeAction({ type: 'delete-file', id })
      expect(editor.treeError.value).toContain('保存失败')
      expect(editor.activeTabId.value).toBe(tab)
      expect(editor.source.value).toBe(draft)
      expect(editor.tabs.value[0]?.dirty).toBe(true)
      expect(scripts.read(id)).toBeDefined()
      writable = true
      await editor.applyTreeAction({ type: 'delete-file', id })
      expect(editor.treeError.value).toBeNull()
      expect(editor.tabs.value).toEqual([])
      expect(scripts.read(id)).toBeUndefined()
    } finally {
      scope.stop()
      scripts.dispose()
    }
  })

  it('信任随草稿保存并恢复，源码变化、新建和副本不会继承信任', async () => {
    const scripts = await createScriptService()
    const editor = useScriptEditor(scripts)
    editor.openBlank()
    expect(editor.trusted.value).toBe(false)
    editor.source.value = source.replace("name: 'SMA'", "name: 'Trusted Editor'")
    editor.trusted.value = true
    await editor.save()
    expect(editor.saved.value).toBe(true)
    const created = scripts.read('Trusted Editor')!
    expect(created.trusted).toBe(true)
    editor.close()
    editor.openFor(created.id)
    expect(editor.trusted.value).toBe(true)
    editor.trusted.value = false
    expect(editor.saved.value).toBe(false)
    await editor.save()
    expect(scripts.read(created.id)?.trusted).toBe(false)
    editor.trusted.value = true
    editor.source.value += '\n// 编辑后需重新信任'
    expect(editor.trusted.value).toBe(false)
    expect(editor.saved.value).toBe(false)
    expect(scripts.read(created.id)?.source).toBe(created.source)
    editor.trusted.value = true
    editor.openBlank()
    expect(editor.trusted.value).toBe(false)
    await scripts.remove(created.id, 2)
  })

  it('内置脚本只读，副本生成独立用户身份并沿同一入口保存', async () => {
    const builtinSource = source.replace("name: 'SMA'", "name: 'Builtin SMA'")
    const scripts = await createScriptService([], { builtinSources: [builtinSource] })
    const editor = useScriptEditor(scripts)
    editor.openFor('Builtin SMA')
    expect(editor.identity.value).toBe('builtin')
    // 内置脚本只读但默认受信任。
    expect(editor.trusted.value).toBe(true)
    await editor.save()
    expect(editor.error.value).toContain('内置脚本只读')
    await editor.createCopy()
    // 副本是可编辑的用户源码，默认不受信任。
    expect(editor.trusted.value).toBe(false)
    expect(editor.identity.value).toBe('user')
    expect(editor.definitionId.value).toBeNull()
    expect(editor.source.value).toContain('Builtin SMA 副本')
    await editor.save()
    expect(editor.saved.value).toBe(true)
    const copy = scripts.read('Builtin SMA 副本')!
    expect(copy.identity).toBe('user')
    expect(scripts.read('Builtin SMA')?.source).toBe(builtinSource)
    await scripts.remove(copy.id, copy.revision)
  })

  it('工具栏新建的是可直接保存的用户脚本', async () => {
    const scripts = await createScriptService()
    const editor = useScriptEditor(scripts)
    editor.openBlank()
    expect(editor.identity.value).toBe('user')
    expect(editor.source.value).toContain('defineIndicator')
    await editor.save()
    expect(editor.saved.value).toBe(true)
    const created = scripts.read('我的脚本')!
    const indicatorTab = editor.activeTabId.value!
    editor.source.value += '\n// 指标未保存的修改'
    editor.trusted.value = true
    editor.openBlank('library')
    expect(editor.kind.value).toBe('library')
    expect(editor.source.value).toContain('defineLibrary')
    await editor.save()
    expect(editor.saved.value).toBe(true)
    const library = scripts.read('myLibrary')!
    const libraryTab = editor.activeTabId.value!
    expect(editor.documents.value.some((item) => item.id === library.id)).toBe(true)
    editor.openFor(library.id)
    expect(editor.kind.value).toBe('library')
    expect(editor.source.value).toBe(library.source)
    editor.openFor(created.id)
    expect(editor.tabs.value).toHaveLength(2)
    expect(editor.activeTabId.value).toBe(indicatorTab)
    expect(editor.source.value).toContain('指标未保存的修改')
    expect(editor.trusted.value).toBe(true)
    expect(editor.saved.value).toBe(false)
    await editor.save()
    expect(editor.tabs.value.find((tab) => tab.id === indicatorTab)?.dirty).toBe(false)
    editor.closeTab(indicatorTab)
    expect(editor.activeTabId.value).toBe(libraryTab)
    await scripts.remove(library.id, library.revision)
    await scripts.remove(created.id, created.revision + 1)
  })
  it('重命名后可连续保存和重新打开，错误及过期草稿不覆盖已提交文档', async () => {
    const scripts = await createScriptService()
    const initial = await scripts.create(source)
    const editor = useScriptEditor(scripts)
    const stale = useScriptEditor(scripts)
    editor.openFor(initial.id)
    stale.openFor(initial.id)
    expect(editor.source.value).toBe(source)
    editor.source.value = source.replace("name: 'SMA'", "name: 'Editor Renamed'")
    await editor.save()
    expect(editor.error.value).toBeNull()
    expect(editor.saved.value).toBe(true)
    expect(editor.definitionId.value).toBe(initial.id)
    expect(editor.name.value).toBe('Editor Renamed')
    expect(scripts.read(initial.id)?.revision).toBe(2)
    await stale.save()
    expect(stale.error.value).toContain('重新打开')
    editor.source.value = editor.source.value.replace('input.int(20', 'input.int(5')
    await editor.save()
    expect(editor.saved.value).toBe(true)
    // 再次编辑即回到未保存，失败保存也保持未保存。
    editor.source.value = 'defineIndicator('
    expect(editor.saved.value).toBe(false)
    await editor.save()
    expect(editor.error.value).not.toBeNull()
    expect(editor.saved.value).toBe(false)
    expect(scripts.read(initial.id)?.revision).toBe(3)
    editor.close()
    expect(editor.definitionId.value).toBeNull()
    editor.openFor(initial.id)
    // 关闭编辑器保留标签草稿；显式关闭标签后才重新读取仓库版本。
    expect(editor.source.value).toBe('defineIndicator(')
    editor.closeTab(editor.activeTabId.value!)
    editor.openFor(initial.id)
    expect(editor.source.value).toContain('Editor Renamed')
    await scripts.remove(initial.id, 3)
  })

  it('没有服务时保存明确失败，不静默成功', async () => {
    const editor = useScriptEditor(undefined)
    editor.openFor('Missing')
    await editor.save()
    expect(editor.error.value).toContain('没有可编辑')
  })
})
