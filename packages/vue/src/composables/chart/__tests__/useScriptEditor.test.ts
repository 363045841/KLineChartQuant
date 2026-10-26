/** 编辑器通过正式脚本服务打开、保存，并拒绝覆盖另一会话的新版本。 */
import 'fake-indexeddb/auto'

import source from '@363045841yyt/klinechart-script/scripts/sma.ts?raw'
import { createScriptService } from '@363045841yyt/klinechart-script-chart'
import { describe, expect, it, vi } from 'vitest'
import { NodeScriptWorker } from '../../../../../script/src/worker/__tests__/nodeWorker.js'
import { useScriptEditor } from '../useScriptEditor.js'

vi.stubGlobal('Worker', NodeScriptWorker)

describe('useScriptEditor', () => {
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
