/** 脚本参考查询工具：schema、正文透传与未接入时的失败语义。 */
import { Check } from 'typebox/value'
import { describe, expect, it } from 'vitest'

import { SCRIPT_REFERENCE_TOPICS } from '../../types.js'
import { createScriptReferenceQueryTool, createUnwiredScriptReference } from '../impl/scripts.js'

/** 读取工具结果正文的最小依赖替身。 */
function createReference(content = '# guide\n\n骨架') {
  return {
    list: () => [{ id: 'guide' as const, title: '写法指南', summary: '骨架与规则' }],
    read: (): string => content,
  }
}

describe('script_reference_query', () => {
  it('主题枚举来自契约常量，覆盖全部参考页', () => {
    const tool = createScriptReferenceQueryTool(createReference())
    expect(tool.name).toBe('script_reference_query')
    expect(tool.effect).toBe('read')
    const parameters = tool.parameters as {
      properties: { topic: { anyOf: ReadonlyArray<{ const: string }> } }
    }
    expect(parameters.properties.topic.anyOf.map((item) => item.const)).toEqual([
      ...SCRIPT_REFERENCE_TOPICS,
    ])
    for (const topic of SCRIPT_REFERENCE_TOPICS) {
      expect(Check(tool.parameters, { topic })).toBe(true)
    }
    expect(Check(tool.parameters, { topic: 'missing' })).toBe(false)
    expect(Check(tool.parameters, { topic: 'guide', extra: true })).toBe(false)
  })

  it('描述带上可用主题，模型不需要猜', () => {
    const tool = createScriptReferenceQueryTool(createReference())
    expect(tool.description).toContain('guide (写法指南)')
    expect(tool.summarizeInput?.({ topic: 'guide' })).toBe('guide')
  })

  it('返回主题正文与摘要', async () => {
    const tool = createScriptReferenceQueryTool(createReference('# plot\n\n选项表'))
    await expect(
      tool.execute({ topic: 'plot' }, { signal: new AbortController().signal, progress: () => {} }),
    ).resolves.toEqual({ content: '# plot\n\n选项表', summary: 'Script reference: plot' })
  })

  it('未接入内容时调用直接失败，不返回空文档', async () => {
    const tool = createScriptReferenceQueryTool(createUnwiredScriptReference())
    expect(tool.description).not.toContain('Available topics')
    await expect(
      tool.execute(
        { topic: 'guide' },
        { signal: new AbortController().signal, progress: () => {} },
      ),
    ).rejects.toThrow('not wired')
  })
})
