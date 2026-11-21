/**
 * 脚本工具契约测试：参考查询、按需读取、写动作分发与未接线失败。
 *
 * 领域行为由端口替身记录；这里只断言 schema、字段校验和工具对端口的调用形状。
 */
import { Check } from 'typebox/value'
import { describe, expect, it } from 'vitest'

import type { ChartAgentScripts } from '../../types.js'
import { SCRIPT_REFERENCE_TOPICS } from '../../types.js'
import {
  createScriptReferenceQueryTool,
  createScriptsReadTool,
  createScriptsWriteTool,
  createUnwiredScripts,
} from '../impl/scripts.js'

/** 工具执行上下文；脚本工具不使用取消与进度。 */
const context = () => ({ signal: new AbortController().signal, progress: () => {} })

/** 端口替身；用例只覆盖需要观察或改变的方法。 */
function createScripts(overrides: Partial<ChartAgentScripts> = {}): ChartAgentScripts {
  return {
    listReferenceTopics: () => [{ id: 'guide', title: '写作指南', summary: '骨架与规则' }],
    readReference: (topic) => `# ${topic}`,
    list: async () => [{ id: 'script_1', name: 'OC Average' }],
    listFolders: async () => [{ path: '策略' }],
    read: async (scriptId) => ({ id: scriptId, name: 'OC Average', source: 'defineIndicator({})' }),
    create: async () => ({ id: 'script_2', name: 'New Script' }),
    update: async (scriptId) => ({ id: scriptId, name: 'OC Average' }),
    remove: async (scriptId) => ({ id: scriptId, name: 'OC Average' }),
    ...overrides,
  }
}

describe('script_reference_query', () => {
  it('按契约枚举主题并把可用主题拼进描述', () => {
    const tool = createScriptReferenceQueryTool(createScripts())
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
    expect(tool.description).toContain('guide (写作指南)')
    expect(tool.summarizeInput?.({ topic: 'guide' })).toBe('guide')
  })

  it('返回主题正文与摘要', async () => {
    await expect(
      createScriptReferenceQueryTool(createScripts()).execute({ topic: 'plot' }, context()),
    ).resolves.toEqual({ content: '# plot', summary: 'Script reference: plot' })
  })
})

describe('scripts_read', () => {
  it('不传 id 时返回脚本身份与可写目录', async () => {
    const tool = createScriptsReadTool(createScripts())
    expect(tool.effect).toBe('read')
    const result = await tool.execute({}, context())
    expect(JSON.parse(result.content)).toEqual({
      scripts: [{ id: 'script_1', name: 'OC Average' }],
      folders: [{ path: '策略' }],
    })
    expect(result.summary).toBe('Returned 1 scripts and 1 folders.')
  })

  it('传 id 时只返回该脚本的完整源码', async () => {
    const result = await createScriptsReadTool(createScripts()).execute(
      { scriptId: 'script_1' },
      context(),
    )
    expect(JSON.parse(result.content)).toEqual({
      script: { id: 'script_1', name: 'OC Average', source: 'defineIndicator({})' },
    })
    expect(result.summary).toBe('Read script OC Average.')
  })
})

describe('scripts_write', () => {
  it('create 只传源码与目录，返回值不含持久化字段', async () => {
    let received: { source: string; folder?: string } | undefined
    const tool = createScriptsWriteTool(
      createScripts({
        create: async (input) => {
          received = input
          return { id: 'script_2', name: 'New Script' }
        },
      }),
    )
    expect(tool.effect).toBe('write')
    const result = await tool.execute(
      { action: 'create', source: 'defineIndicator({})', folder: '策略' },
      context(),
    )
    expect(received).toEqual({ source: 'defineIndicator({})', folder: '策略' })
    expect(JSON.parse(result.content)).toEqual({
      script: { id: 'script_2', name: 'New Script' },
    })
    expect(result.summary).toContain('indicators_write')
  })

  it('update 与 delete 只按 id 寻址', async () => {
    const calls: string[] = []
    const tool = createScriptsWriteTool(
      createScripts({
        update: async (scriptId, source) => {
          calls.push(`update:${scriptId}:${source}`)
          return { id: scriptId, name: 'OC Average' }
        },
        remove: async (scriptId) => {
          calls.push(`delete:${scriptId}`)
          return { id: scriptId, name: 'OC Average' }
        },
      }),
    )
    await tool.execute(
      { action: 'update', scriptId: 'script_1', source: 'defineIndicator({})' },
      context(),
    )
    const removed = await tool.execute({ action: 'delete', scriptId: 'script_1' }, context())
    expect(calls).toEqual(['update:script_1:defineIndicator({})', 'delete:script_1'])
    expect(removed.summary).toContain('removed its chart instances')
  })

  it.each([
    ['create 多余 scriptId', { action: 'create', scriptId: 's', source: 'x' }, 'does not accept'],
    ['create 缺 source', { action: 'create', folder: '策略' }, 'requires source'],
    ['update 缺 source', { action: 'update', scriptId: 's' }, 'requires source'],
    ['update 缺 scriptId 与 source', { action: 'update' }, 'requires scriptId, source'],
    ['delete 多余 source', { action: 'delete', scriptId: 's', source: 'x' }, 'does not accept'],
  ])('%s', async (_label, input, message) => {
    await expect(createScriptsWriteTool(createScripts()).execute(input, context())).rejects.toThrow(
      message,
    )
  })
})

describe('createUnwiredScripts', () => {
  it('工具仍在清单里，但每次读写都明确失败', async () => {
    const scripts = createUnwiredScripts()
    expect(scripts.listReferenceTopics()).toEqual([])
    await expect(
      createScriptReferenceQueryTool(scripts).execute({ topic: 'guide' }, context()),
    ).rejects.toThrow('not wired')
    await expect(createScriptsReadTool(scripts).execute({}, context())).rejects.toThrow('not wired')
    await expect(
      createScriptsWriteTool(scripts).execute(
        { action: 'create', source: 'defineIndicator({})' },
        context(),
      ),
    ).rejects.toThrow('not wired')
  })
})
