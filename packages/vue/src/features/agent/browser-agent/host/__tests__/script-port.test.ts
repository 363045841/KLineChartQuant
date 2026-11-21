/**
 * 脚本端口适配测试：只暴露用户指标脚本，领域错误翻译成可重试的工具错误。
 */
import { ToolInputValidationError } from '@363045841yyt/klinechart-core/agent-tools'
import type { ScriptDocument, ScriptFolder } from '@363045841yyt/klinechart-script-chart'
import { describe, expect, it } from 'vitest'

import { createScriptsPort, type ScriptsServicePort } from '../impl/script-port.js'

/** 指标文档替身；只声明适配层会读取的字段。 */
function indicatorDocument(
  overrides: {
    id?: string
    name?: string
    identity?: 'builtin' | 'user'
    revision?: number
    folder?: string
    source?: string
  } = {},
): ScriptDocument {
  return {
    kind: 'indicator',
    id: overrides.id ?? 'script_1',
    identity: overrides.identity ?? 'user',
    revision: overrides.revision ?? 1,
    source: overrides.source ?? "defineIndicator({ version: 2, name: 'OC Average' })",
    trusted: false,
    folder: overrides.folder ?? '',
    definition: { name: overrides.name ?? 'OC Average', inputs: {} },
  }
}

/** 库文档替身；Agent 不可寻址。 */
function libraryDocument(): ScriptDocument {
  return {
    kind: 'library',
    id: 'lib_1',
    identity: 'user',
    revision: 1,
    source: "defineLibrary('stats', {})",
    trusted: true,
    folder: '',
    definition: { name: 'stats' },
  }
}

/** 脚本服务替身；用例只覆盖需要观察的方法。 */
function createService(overrides: Partial<ScriptsServicePort> = {}): ScriptsServicePort {
  const user = indicatorDocument()
  const builtin = indicatorDocument({ id: 'builtin', identity: 'builtin', name: 'MA' })
  const library = libraryDocument()
  const documents = new Map<string, ScriptDocument>([
    [user.id, user],
    [builtin.id, builtin],
    [library.id, library],
  ])
  return {
    list: () => [user, builtin, library],
    listFolders: (): readonly ScriptFolder[] => [
      { kind: 'indicator', path: '策略' },
      { kind: 'library', path: '共享' },
    ],
    read: (id) => documents.get(id),
    createIndicator: async (source, folder) =>
      indicatorDocument({ id: 'script_2', name: 'New Script', source, folder }),
    update: async (id, source) =>
      indicatorDocument({ id, source, revision: 2, name: 'OC Average' }),
    remove: async () => undefined,
    ...overrides,
  }
}

describe('scripts port', () => {
  it('列表与目录只返回用户指标脚本', async () => {
    const scripts = createScriptsPort(async () => createService())
    await expect(scripts.list()).resolves.toEqual([{ id: 'script_1', name: 'OC Average' }])
    await expect(scripts.listFolders()).resolves.toEqual([{ path: '策略' }])
  })

  it('按 id 读取完整源码，未知、内置与库脚本都拒绝', async () => {
    const scripts = createScriptsPort(async () => createService())
    await expect(scripts.read('script_1')).resolves.toEqual({
      id: 'script_1',
      name: 'OC Average',
      source: "defineIndicator({ version: 2, name: 'OC Average' })",
    })
    await expect(scripts.read('missing')).rejects.toThrow('Unknown script')
    await expect(scripts.read('builtin')).rejects.toThrow('built in')
    await expect(scripts.read('lib_1')).rejects.toThrow('library')
  })

  it('create 传源码与目录，返回值只含 id 与名称', async () => {
    let received: { source: string; folder?: string } | undefined
    const scripts = createScriptsPort(async () =>
      createService({
        createIndicator: async (source, folder) => {
          received = { source, folder }
          return indicatorDocument({ id: 'script_2', name: 'New Script' })
        },
      }),
    )
    await expect(
      scripts.create({ source: 'defineIndicator({})', folder: '策略' }),
    ).resolves.toEqual({ id: 'script_2', name: 'New Script' })
    expect(received).toEqual({ source: 'defineIndicator({})', folder: '策略' })
  })

  it('create 把领域错误翻译成可重试的工具错误', async () => {
    const scripts = createScriptsPort(async () =>
      createService({
        createIndicator: async () => {
          throw new Error('该入口只接受指标脚本')
        },
      }),
    )
    await expect(scripts.create({ source: 'defineLibrary(...)' })).rejects.toBeInstanceOf(
      ToolInputValidationError,
    )
  })

  it('update 与 remove 读取当前 revision 后再提交', async () => {
    const revisions: number[] = []
    const scripts = createScriptsPort(async () =>
      createService({
        update: async (id, source, revision) => {
          revisions.push(revision)
          return indicatorDocument({ id, source, revision: revision + 1 })
        },
        remove: async (_id, revision) => {
          revisions.push(revision)
        },
      }),
    )
    await scripts.update('script_1', 'defineIndicator({ version: 2 })')
    await scripts.remove('script_1')
    expect(revisions).toEqual([1, 1])
  })

  it('参考内容来自生成物', () => {
    const scripts = createScriptsPort(async () => createService())
    expect(scripts.listReferenceTopics().map((entry) => entry.id)).toContain('guide')
    expect(scripts.readReference('guide')).toContain('defineIndicator')
  })
})
