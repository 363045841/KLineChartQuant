/** 编辑器通过正式脚本服务打开、保存，并拒绝覆盖另一会话的新版本。 */

import source from '@363045841yyt/klinechart-script/scripts/sma.js?raw'
import { createScriptService } from '@363045841yyt/klinechart-script-chart'
import { describe, expect, it } from 'vitest'
import { useScriptEditor } from '../chart/useScriptEditor.js'

describe('useScriptEditor', () => {
  it('完整源码可见，保存更新版本，错误及过期草稿保留已提交文档', async () => {
    const scripts = await createScriptService()
    const initial = scripts.create(source)
    const editor = useScriptEditor(scripts)
    const stale = useScriptEditor(scripts)
    editor.openFor(initial.id)
    stale.openFor(initial.id)
    expect(editor.source.value).toBe(source)
    editor.source.value = source.replace('input(20', 'input(5')
    editor.save()
    expect(editor.error.value).toBeNull()
    expect(editor.saved.value).toBe(true)
    expect(scripts.read(initial.id)?.revision).toBe(2)
    stale.save()
    expect(stale.error.value).toContain('重新打开')
    // 再次编辑即回到未保存，失败保存也保持未保存。
    editor.source.value = 'defineIndicator('
    expect(editor.saved.value).toBe(false)
    editor.save()
    expect(editor.error.value).not.toBeNull()
    expect(editor.saved.value).toBe(false)
    expect(scripts.read(initial.id)?.revision).toBe(2)
    editor.close()
    expect(editor.definitionId.value).toBeNull()
    scripts.remove(initial.id, 2)
  })

  it('没有服务时保存明确失败，不静默成功', () => {
    const editor = useScriptEditor(undefined)
    editor.openFor('Missing')
    editor.save()
    expect(editor.error.value).toContain('没有可编辑')
  })
})
