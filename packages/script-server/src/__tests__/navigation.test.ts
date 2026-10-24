/** 真实语言会话验证语义跳转和重命名的原文位置，覆盖序列转换后的偏移。 */
import { describe, expect, it } from 'vitest'
import { createScriptLanguageWorker } from '../languageWorker.js'
import { SCRIPT_EDITOR_FILE } from '../types.js'

/** 初始化实际 Worker 契约；查询自行接收当前草稿。 */
async function session() {
  const worker = createScriptLanguageWorker()
  await worker.initialize()
  return worker
}

describe('脚本语义操作', () => {
  it.each(['definition', 'declaration'] as const)('%s 返回转换前的源码位置', async (kind) => {
    const worker = await session()
    const source = 'const price = close + 1\nconst value = price\n'
    const targets = worker.getNavigation(SCRIPT_EDITOR_FILE, source, source.lastIndexOf('price'), kind)
    expect(targets).toEqual([expect.objectContaining({ current: true, source, from: source.indexOf('price'), to: source.indexOf('price') + 5 })])
  })

  it('查询类型定义和实现', async () => {
    const worker = await session()
    const source = 'interface Shape { size: number }\nclass Box implements Shape { size = 1 }\nconst box: Shape = new Box()\n'
    const types = worker.getNavigation(SCRIPT_EDITOR_FILE, source, source.indexOf('box:'), 'typeDefinition')
    expect(types.some((target) => target.from === source.indexOf('Shape'))).toBe(true)
    const implementations = worker.getNavigation(SCRIPT_EDITOR_FILE, source, source.indexOf('Shape'), 'implementation')
    expect(implementations.some((target) => target.from === source.indexOf('Box'))).toBe(true)
  })

  it('重命名映射所有原文引用并保留对象简写属性名', async () => {
    const worker = await session()
    const source = 'const price = close + 1\nconst result = { price }\nconsole.log(price)\n'
    const edits = worker.renameSymbol(SCRIPT_EDITOR_FILE, source, source.indexOf('price'), 'nextPrice')
    let result = source
    for (const edit of [...edits].reverse()) result = result.slice(0, edit.span.start) + edit.newText + result.slice(edit.span.start + edit.span.length)
    expect(result).toBe('const nextPrice = close + 1\nconst result = { price: nextPrice }\nconsole.log(nextPrice)\n')
  })

  it('外部声明返回可读原文和有效目标范围', async () => {
    const worker = await session()
    const source = 'const price = close + 1\n'
    const targets = worker.getNavigation(SCRIPT_EDITOR_FILE, source, source.indexOf('close'), 'definition')
    expect(targets.length).toBeGreaterThan(0)
    for (const target of targets) {
      expect(target.current).toBe(false)
      expect(target.source.slice(target.from, target.to)).toBe('close')
    }
  })

  it('拒绝重命名只读全局符号', async () => {
    const worker = await session()
    const source = 'const price = close + 1\n'
    expect(() => worker.renameSymbol(SCRIPT_EDITOR_FILE, source, source.indexOf('close'), 'nextClose')).toThrow()
  })
})
