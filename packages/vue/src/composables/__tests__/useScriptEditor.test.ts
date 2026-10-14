/** 编辑器通过正式脚本服务打开、保存，并拒绝覆盖另一会话的新版本。 */
import 'fake-indexeddb/auto'

import source from '@363045841yyt/klinechart-script/scripts/sma.js?raw'
import { createScriptService } from '@363045841yyt/klinechart-script-chart'
import { describe, expect, it } from 'vitest'
import { useScriptEditor } from '../chart/useScriptEditor.js'

describe('useScriptEditor', () => {
  it('内置脚本只读，副本生成独立用户身份并沿同一入口保存', async () => {
    const builtinSource = source.replace("name: 'SMA'", "name: 'Builtin SMA'")
    const scripts = await createScriptService([], { builtinSources: [builtinSource] })
    const editor = useScriptEditor(scripts)
    editor.openFor('Builtin SMA')
    expect(editor.identity.value).toBe('builtin')
    await editor.save()
    expect(editor.error.value).toContain('内置脚本只读')
    await editor.createCopy()
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
    await scripts.remove(created.id, created.revision)
  })
  it('完整源码可见，保存更新版本，错误及过期草稿保留已提交文档', async () => {
    const scripts = await createScriptService()
    const initial = await scripts.create(source)
    const editor = useScriptEditor(scripts)
    const stale = useScriptEditor(scripts)
    editor.openFor(initial.id)
    stale.openFor(initial.id)
    expect(editor.source.value).toBe(source)
    editor.source.value = source.replace('input(20', 'input(5')
    await editor.save()
    expect(editor.error.value).toBeNull()
    expect(editor.saved.value).toBe(true)
    expect(scripts.read(initial.id)?.revision).toBe(2)
    await stale.save()
    expect(stale.error.value).toContain('重新打开')
    // 再次编辑即回到未保存，失败保存也保持未保存。
    editor.source.value = 'defineIndicator('
    expect(editor.saved.value).toBe(false)
    await editor.save()
    expect(editor.error.value).not.toBeNull()
    expect(editor.saved.value).toBe(false)
    expect(scripts.read(initial.id)?.revision).toBe(2)
    editor.close()
    expect(editor.definitionId.value).toBeNull()
    await scripts.remove(initial.id, 2)
  })

  it('没有服务时保存明确失败，不静默成功', async () => {
    const editor = useScriptEditor(undefined)
    editor.openFor('Missing')
    await editor.save()
    expect(editor.error.value).toContain('没有可编辑')
  })
})
