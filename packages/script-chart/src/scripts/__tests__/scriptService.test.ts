/** 完整脚本生命周期：提交快照、版本冲突、失败隔离及删除。 */
import 'fake-indexeddb/auto'
import {
  getIndicatorDescriptor,
  getRegisteredIndicatorDefinition,
  removeScriptIndicatorDefinition,
} from '@363045841yyt/klinechart-core'
import {
  builtinScriptSources,
  readQuickJSScriptDefinitionSync,
} from '@363045841yyt/klinechart-script'
import { describe, expect, it } from 'vitest'
import { createScriptService } from '../impl/createScriptService.js'
import { createScriptPersistence } from '../impl/scriptPersistence.js'

const source = `defineIndicator({ name: 'ServiceAverage', pane: 'sub', inputs: { n: input(2) },
  onBar() { plot.Line((open + close) / params.n, { id: 'average' }) } })`

describe('ScriptService', () => {
  it('自动发现的完整内置目录通过同一服务注册到指标仓库', async () => {
    const persistence = createScriptPersistence()
    const saved = await persistence.load()
    const scripts = await createScriptService([], {
      builtinSources: builtinScriptSources,
      persistence,
    })
    for (const source of builtinScriptSources) {
      const definition = readQuickJSScriptDefinitionSync(source)
      expect(getRegisteredIndicatorDefinition(definition.name)?.document).toMatchObject({
        identity: 'builtin',
        source,
      })
      expect(scripts.read(definition.name)?.identity).toBe('builtin')
      const metadata = getRegisteredIndicatorDefinition(definition.name)
      expect(metadata?.indicatorType).toBe(definition.indicatorType ?? 'other')
      const data = Array.from({ length: 50 }, (_, timestamp) => ({
        timestamp,
        open: 100 + timestamp,
        high: 102 + timestamp,
        low: 98 + timestamp,
        close: 101 + timestamp,
        volume: 100,
      }))
      const output = metadata?.runtime?.compute(data, metadata.runtime.defaultParams)
      expect(output).toMatchObject({ plots: expect.any(Array), fills: expect.any(Array) })
    }
    expect(scripts.read('Char Demo')).toBeDefined()
    expect(scripts.read('Arrow Demo')).toBeDefined()
    expect(await persistence.load()).toEqual(saved)
  })

  it('用户源码和版本从 IndexedDB 恢复，删除后不再恢复', async () => {
    const scripts = await createScriptService()
    await expect(scripts.create(source.replace('ServiceAverage', '!!!'))).rejects.toThrow(
      '脚本名称',
    )
    const initial = await scripts.create(source.replace('ServiceAverage', 'PersistedAverage'))
    const next = await scripts.update(
      initial.id,
      initial.source
        .replace('PersistedAverage', 'RenamedPersistedAverage')
        .replace('input(2)', 'input(6)'),
      1,
    )
    expect(next.id).toBe(initial.id)
    const reusedName = await scripts.create(initial.source)
    expect(reusedName.id).not.toBe(initial.id)
    await scripts.remove(reusedName.id, reusedName.revision)
    // 清除运行定义模拟页面刷新，保留真实 IndexedDB 数据。
    removeScriptIndicatorDefinition(next.id)
    const restored = await createScriptService()
    expect(restored.read(next.id)).toEqual(next)
    await restored.remove(next.id, next.revision)
    expect((await createScriptService()).read(next.id)).toBeUndefined()
  })

  it('保存失败不发布源码，排队的过期提交不能覆盖成功提交', async () => {
    const persistence = createScriptPersistence()
    const scripts = await createScriptService([], { persistence })
    const initial = await scripts.create(source.replace('ServiceAverage', 'FailedSaveAverage'))
    const failed = await createScriptService([], {
      persistence: {
        load: async () => [],
        save: async () => {
          throw new Error('磁盘写入失败')
        },
      },
    })
    await expect(
      failed.update(initial.id, initial.source.replace('FailedSaveAverage', 'FailedRename'), 1),
    ).rejects.toThrow('磁盘写入失败')
    expect(scripts.read(initial.id)).toEqual(initial)
    expect(getIndicatorDescriptor('FailedRename')).toBeUndefined()
    expect(await persistence.load()).toContainEqual({
      id: initial.id,
      source: initial.source,
      revision: initial.revision,
    })
    const results = await Promise.allSettled([
      scripts.update(initial.id, initial.source.replace('input(2)', 'input(4)'), 1),
      scripts.update(initial.id, initial.source.replace('input(2)', 'input(9)'), 1),
    ])
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected'])
    await scripts.remove(initial.id, 2)
  })

  it('内置脚本只读且不写入用户存储', async () => {
    const persistence = createScriptPersistence()
    const scripts = await createScriptService([], {
      builtinSources: [source.replace('ServiceAverage', 'BuiltinAverage')],
      persistence,
    })
    const builtin = scripts.read('BuiltinAverage')!
    expect(builtin.identity).toBe('builtin')
    await expect(scripts.update(builtin.id, builtin.source, 1)).rejects.toThrow('内置脚本只读')
    await expect(scripts.remove(builtin.id, 1)).rejects.toThrow('内置脚本只读')
    expect(() => removeScriptIndicatorDefinition(builtin.id)).toThrow()
    expect(await persistence.load()).toEqual([])
  })

  it('单个快照完成 CRUD，更新不新增身份，过期版本或错误源码不覆盖', async () => {
    const scripts = await createScriptService()
    const initial = await scripts.create(source)
    expect(initial.revision).toBe(1)
    expect(scripts.read(initial.id)).toEqual(initial)
    await expect(scripts.create(source)).rejects.toThrow()
    const occupied = await scripts.create(source.replace('ServiceAverage', 'OccupiedAverage'))
    await expect(scripts.update(initial.id, occupied.source, initial.revision)).rejects.toThrow(
      '脚本名称已存在',
    )
    expect(scripts.read(initial.id)).toEqual(initial)
    await scripts.remove(occupied.id, occupied.revision)
    const next = await scripts.update(initial.id, source.replace('input(2)', 'input(4)'), 1)
    expect(next.revision).toBe(2)
    expect(getIndicatorDescriptor(initial.id)?.defaultParams).toEqual({ n: 4 })
    expect(getRegisteredIndicatorDefinition(initial.id)?.document?.source).toBe(next.source)
    await expect(scripts.update(initial.id, source, 1)).rejects.toThrow('重新打开')
    await expect(scripts.update(initial.id, 'defineIndicator(', 2)).rejects.toThrow()
    expect(scripts.read(initial.id)).toEqual(next)
    const bars = [{ timestamp: 1, open: 10, high: 20, low: 10, close: 20 }]
    expect(
      getRegisteredIndicatorDefinition(initial.id)?.runtime?.compute(bars, { n: 4 }),
    ).toMatchObject({
      plots: [{ id: 'average', data: [{ value: 7.5 }] }],
    })
    expect(scripts.list().map((document) => document.id)).toContain(initial.id)
    await scripts.remove(initial.id, 2)
    expect(scripts.read(initial.id)).toBeUndefined()
    expect(getIndicatorDescriptor(initial.id)).toBeUndefined()
  })
})
