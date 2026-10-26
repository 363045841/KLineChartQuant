/** 完整脚本生命周期：提交快照、版本冲突、失败隔离及删除。 */
import 'fake-indexeddb/auto'
import {
  getIndicatorDescriptor,
  getRegisteredIndicatorDefinition,
  removeScriptIndicatorDefinition,
} from '@363045841yyt/klinechart-core'
import { builtinScriptSources } from '@363045841yyt/klinechart-script'
import { describe, expect, it, vi } from 'vitest'
import { NodeScriptWorker } from '../../../../script/src/worker/__tests__/nodeWorker.js'
import { createScriptService } from '../impl/createScriptService.js'
import { createScriptPersistence } from '../impl/scriptPersistence.js'

const source = `defineIndicator({ name: 'ServiceAverage', position: 'sub',
  onBar() { const n = input.int(2); plot.Line((open + close) / n, 'average') } })`

vi.stubGlobal('Worker', NodeScriptWorker)

describe('ScriptService', () => {
  it('库依赖按顺序恢复、隔离私有变量，更新刷新指标并保留失败前的版本', async () => {
    const persistence = createScriptPersistence()
    const scripts = await createScriptService([], { persistence })
    const base = await scripts.create(`const helper = 2; defineLibrary('serviceBase', { scale(source: Series): Series { return ta.sma(source, helper) } })`)
    const library = await scripts.create(`const helper = importLibrary('serviceBase'); defineLibrary('serviceStats', { smooth(source: Series): Series { return helper.scale(source) } })`)
    const indicator = await scripts.create(`const stats = importLibrary('serviceStats'); defineIndicator({ name: 'LibraryConsumer', position: Position.Sub, onBar() { plot.Line(stats.smooth(close) + 1, 'smooth') } })`, true)
    const bars = [2, 4, 8].map((close, timestamp) => ({ timestamp, open: close, high: close, low: close, close }))
    /** 通过图表正式计算入口检查依赖快照与序列当前值转换。 */
    async function values() {
      return getRegisteredIndicatorDefinition(indicator.id)!.runtime!.compute(bars, {})
    }
    expect(base.kind).toBe('library')
    expect(getIndicatorDescriptor(base.id)).toBeUndefined()
    expect(await values()).toMatchObject({ plots: [{ data: [undefined, { value: 4 }, { value: 7 }] }] })
    await expect(scripts.remove(base.id, 1)).rejects.toThrow('仍被引用')
    await expect(scripts.update(base.id, `const stats = importLibrary('serviceStats'); defineLibrary('serviceBase', { scale: stats.smooth })`, 1)).rejects.toThrow('循环依赖')
    await expect(scripts.update(base.id, `throw new Error('库初始化失败'); defineLibrary('serviceBase', {})`, 1)).rejects.toThrow('库初始化失败')
    await expect(scripts.update(base.id, `defineLibrary('serviceBase', { other() { return 1 } })`, 1)).rejects.toThrow('scale')
    expect(scripts.read(base.id)?.revision).toBe(1)
    const next = await scripts.update(base.id, base.source.replace('helper = 2', 'helper = 1'), 1)
    expect(await values()).toMatchObject({ plots: [{ data: [{ value: 3 }, { value: 5 }, { value: 9 }] }] })
    removeScriptIndicatorDefinition(indicator.id)
    scripts.dispose()
    const restored = await createScriptService([], { persistence })
    try {
      expect(restored.read(base.id)).toEqual(next)
      expect(await values()).toMatchObject({ plots: [{ data: [{ value: 3 }, { value: 5 }, { value: 9 }] }] })
      expect(restored.read(indicator.id)?.revision).toBe(indicator.revision + 1)
      await restored.remove(indicator.id, indicator.revision + 1)
      await restored.remove(library.id, library.revision)
      await restored.remove(base.id, next.revision)
    } finally {
      restored.dispose()
    }
  })
  it('内置脚本使用原生引擎，用户保存信任选择后切换实际执行后端', async () => {
    const engineSource = `defineIndicator({ name: 'ServiceEngine', position: 'main', onBar() { plot.Line(typeof WebAssembly === 'object' ? 1 : 0, 'native') } })`
    const scripts = await createScriptService([], { builtinSources: [engineSource] })
    const bars = [{ timestamp: 1, open: 1, high: 1, low: 1, close: 1 }]
    /** 从正式注册入口计算，验证注册属性传到了 Worker。 */
    async function compute(id: string) {
      return getRegisteredIndicatorDefinition(id)!.runtime!.compute(bars, {})
    }
    try {
      expect(await compute('ServiceEngine')).toMatchObject({ plots: [{ data: [{ value: 1 }] }] })
      const created = await scripts.create(engineSource.replace('ServiceEngine', 'UserEngine'))
      expect(await compute(created.id)).toMatchObject({ plots: [{ data: [{ value: 0 }] }] })
      const trusted = await scripts.update(created.id, created.source, created.revision, true)
      expect(await compute(created.id)).toMatchObject({ plots: [{ data: [{ value: 1 }] }] })
      const revoked = await scripts.update(trusted.id, trusted.source, trusted.revision, false)
      expect(await compute(created.id)).toMatchObject({ plots: [{ data: [{ value: 0 }] }] })
      await scripts.remove(revoked.id, revoked.revision)
      const library = await scripts.create(`defineLibrary('engineLibrary', { value(): number { return 1 } })`)
      const consumer = await scripts.create(`const library = importLibrary('engineLibrary'); defineIndicator({ name: 'LibraryEngine', position: Position.Main, onBar() { plot.Line(typeof globalThis === 'object' && 'WebAssembly' in globalThis ? library.value() : 0, 'native') } })`, true)
      expect(await compute(consumer.id)).toMatchObject({ plots: [{ data: [{ value: 0 }] }] })
      const trustedLibrary = await scripts.update(library.id, library.source, library.revision, true)
      expect(await compute(consumer.id)).toMatchObject({ plots: [{ data: [{ value: 1 }] }] })
      const changedLibrary = await scripts.update(library.id, library.source.replace('return 1', 'return 2'), trustedLibrary.revision)
      expect(await compute(consumer.id)).toMatchObject({ plots: [{ data: [{ value: 0 }] }] })
      await scripts.remove(consumer.id, scripts.read(consumer.id)!.revision)
      await scripts.remove(library.id, changedLibrary.revision)
    } finally {
      scripts.dispose()
    }
  })

  it('注册计算端口实际返回 Worker Promise，销毁后计算明确失败', async () => {
    const scripts = await createScriptService()
    const document = await scripts.create(source.replace('ServiceAverage', 'WorkerAverage'))
    const runtime = getRegisteredIndicatorDefinition(document.id)!.runtime!
    const result = runtime.compute([{ timestamp: 1, open: 10, high: 20, low: 10, close: 20 }], {
      n: 2,
    })
    expect(result).toBeInstanceOf(Promise)
    await expect(result).resolves.toMatchObject({
      plots: [{ id: 'average', data: [{ value: 15 }] }],
    })
    await scripts.remove(document.id, document.revision)
    scripts.dispose()
    scripts.dispose()
    await expect(runtime.compute([], { n: 2 })).rejects.toThrow('已销毁')
  })

  it('信任标记随注册快照持久化，恢复后仍可显式撤销', async () => {
    const persistence = createScriptPersistence()
    const scripts = await createScriptService([], { persistence })
    const initial = await scripts.create(source.replace('ServiceAverage', 'TrustedAverage'), true)
    expect(initial.trusted).toBe(true)
    expect(getRegisteredIndicatorDefinition(initial.id)?.document?.trusted).toBe(true)
    expect(await persistence.load()).toContainEqual({
      id: initial.id,
      source: initial.source,
      revision: 1,
      trusted: true,
    })
    removeScriptIndicatorDefinition(initial.id)
    const restored = await createScriptService([], { persistence })
    expect(restored.read(initial.id)).toEqual(initial)
    const revoked = await restored.update(initial.id, initial.source, 1, false)
    expect(revoked.trusted).toBe(false)
    expect(getRegisteredIndicatorDefinition(initial.id)?.document?.trusted).toBe(false)
    expect(await persistence.load()).toContainEqual({
      id: initial.id,
      source: initial.source,
      revision: 2,
      trusted: false,
    })
    await expect(restored.update(initial.id, initial.source, 1, true)).rejects.toThrow('重新打开')
    expect(restored.read(initial.id)?.trusted).toBe(false)
    await restored.remove(initial.id, 2)
  })

  it('自动发现的完整内置目录通过同一服务注册到指标仓库', async () => {
    const persistence = createScriptPersistence()
    const saved = await persistence.load()
    const scripts = await createScriptService([], {
      builtinSources: builtinScriptSources,
      persistence,
    })
    for (const source of builtinScriptSources) {
      const definition = scripts.list().find((document) => document.source === source)!.definition
      expect(getRegisteredIndicatorDefinition(definition.name)?.document).toMatchObject({
        identity: 'builtin',
        source,
      })
      expect(scripts.read(definition.name)?.identity).toBe('builtin')
      // 内置脚本随包发布，默认受信任。
      expect(scripts.read(definition.name)?.trusted).toBe(true)
      const metadata = getRegisteredIndicatorDefinition(definition.name)
      const data = Array.from({ length: 50 }, (_, timestamp) => ({
        timestamp,
        open: 100 + timestamp,
        high: 102 + timestamp,
        low: 98 + timestamp,
        close: 101 + timestamp,
        volume: 100,
      }))
      const output = await metadata?.runtime?.compute(data, metadata.runtime.defaultParams)
      expect(output).toMatchObject({ plots: expect.any(Array), fills: expect.any(Array) })
    }
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
        .replace('input.int(2)', 'input.int(6)'),
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
    await expect(
      getRegisteredIndicatorDefinition(initial.id)!.runtime!.compute(
        [{ timestamp: 1, open: 10, high: 20, low: 10, close: 20 }],
        { n: 2 },
      ),
    ).resolves.toMatchObject({ plots: [{ id: 'average', data: [{ value: 15 }] }] })
    expect(getIndicatorDescriptor('FailedRename')).toBeUndefined()
    expect(await persistence.load()).toContainEqual({
      id: initial.id,
      source: initial.source,
      revision: initial.revision,
      trusted: false,
    })
    const results = await Promise.allSettled([
      scripts.update(initial.id, initial.source.replace('input.int(2)', 'input.int(4)'), 1),
      scripts.update(initial.id, initial.source.replace('input.int(2)', 'input.int(9)'), 1),
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
    const next = await scripts.update(initial.id, source.replace('input.int(2)', 'input.int(4)'), 1)
    expect(next.revision).toBe(2)
    expect(getIndicatorDescriptor(initial.id)?.defaultParams).toEqual({ n: 4 })
    expect(getRegisteredIndicatorDefinition(initial.id)?.document?.source).toBe(next.source)
    await expect(scripts.update(initial.id, source, 1)).rejects.toThrow('重新打开')
    await expect(scripts.update(initial.id, 'defineIndicator(', 2)).rejects.toThrow()
    expect(scripts.read(initial.id)).toEqual(next)
    const bars = [{ timestamp: 1, open: 10, high: 20, low: 10, close: 20 }]
    expect(
      await getRegisteredIndicatorDefinition(initial.id)?.runtime?.compute(bars, { n: 4 }),
    ).toMatchObject({
      plots: [{ id: 'average', data: [{ value: 7.5 }] }],
    })
    expect(scripts.list().map((document) => document.id)).toContain(initial.id)
    await scripts.remove(initial.id, 2)
    expect(scripts.read(initial.id)).toBeUndefined()
    expect(getIndicatorDescriptor(initial.id)).toBeUndefined()
  })
})
