/** 草稿命名与模板：唯一名称避免覆盖已有脚本，模板保证新建文档可直接保存。 */
import { describe, expect, it } from 'vitest'
import {
  createBlankSource,
  createLibrarySource,
  uniqueScriptName,
} from '../impl/createScriptDraft.js'
import type { ScriptSourceStore } from '../types.js'

/** 只实现 read 的最小仓库；create/update 在本用例中不会被调用。 */
function storeWith(names: readonly string[]): Pick<ScriptSourceStore, 'read'> {
  return {
    read: (id) =>
      names.includes(id)
        ? {
            kind: 'indicator',
            id,
            definition: { name: id },
            source: '',
            revision: 1,
            identity: 'user',
            trusted: false,
            folder: '',
          }
        : undefined,
  }
}

describe('createScriptDraft', () => {
  it('名称占用时递增后缀', () => {
    expect(uniqueScriptName(storeWith([]), '我的脚本')).toBe('我的脚本')
    expect(uniqueScriptName(storeWith(['我的脚本']), '我的脚本')).toBe('我的脚本 2')
    expect(uniqueScriptName(storeWith(['我的脚本', '我的脚本 2']), '我的脚本')).toBe('我的脚本 3')
  })

  it('新建草稿是可保存的完整声明，库模板不生成指标入口', () => {
    expect(createBlankSource('新脚本')).toContain('name: "新脚本"')
    expect(createBlankSource('新脚本')).toContain('defineIndicator({')
    expect(createLibrarySource('新库')).toContain('defineLibrary("新库"')
    expect(createLibrarySource('新库')).not.toContain('defineIndicator')
  })
})
