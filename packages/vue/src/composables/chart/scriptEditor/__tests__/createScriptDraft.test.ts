/** 副本草稿只改写指标身份，保留注释、其他同名属性与计算代码。 */
import { describe, expect, it } from 'vitest'
import { createBlankSource, createCopySource, uniqueScriptName } from '../impl/createScriptDraft.js'
import type { ScriptSourceStore } from '../types.js'

const source = `// 顶部注释
defineIndicator({
  name: 'Average',
  inputs: { period: input.int(20) },
  onBar() {
    // 计算代码里的同名属性不属于指标身份
    const options = { name: 'keep-me' }
    plot.Line(close, 'average')
  },
})`

/** 只实现 read 的最小仓库；create/update 在本用例中不会被调用。 */
function storeWith(names: readonly string[]): ScriptSourceStore {
  return {
    read: (id) =>
      names.includes(id)
        ? { id, definition: { name: id }, source: '', revision: 1, identity: 'user', trusted: false }
        : undefined,
    create: () => Promise.reject(new Error('unused')),
    update: () => Promise.reject(new Error('unused')),
    remove: () => Promise.reject(new Error('unused')),
  }
}

describe('createScriptDraft', () => {
  it('改写 name，注释、计算代码与其他同名属性保持原样', async () => {
    const copy = await createCopySource(source, 'Average 副本')
    expect(copy).toContain('name: "Average 副本"')
    expect(copy).toContain("name: 'keep-me'")
    expect(copy).toContain('// 顶部注释')
    expect(copy).toContain('// 计算代码里的同名属性不属于指标身份')
    expect(copy).not.toContain('displayName')
  })

  it('声明不是对象或缺少 name 时明确失败', async () => {
    await expect(createCopySource('defineIndicator(42)', 'X')).rejects.toThrow('必须是对象')
    await expect(createCopySource('const value = 1', 'X')).rejects.toThrow('未找到指标名称声明')
  })

  it('名称占用时递增后缀，新建草稿是可保存的完整声明', () => {
    expect(uniqueScriptName(storeWith([]), '我的脚本')).toBe('我的脚本')
    expect(uniqueScriptName(storeWith(['我的脚本']), '我的脚本')).toBe('我的脚本 2')
    expect(uniqueScriptName(storeWith(['我的脚本', '我的脚本 2']), '我的脚本')).toBe('我的脚本 3')
    expect(createBlankSource('新脚本')).toContain('name: "新脚本"')
    expect(createBlankSource('新脚本')).toContain('defineIndicator({')
  })
})
