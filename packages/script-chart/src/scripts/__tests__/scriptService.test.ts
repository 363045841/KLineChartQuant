/** 完整脚本生命周期：提交快照、版本冲突、失败隔离及删除。 */
import 'fake-indexeddb/auto'
import {
  getIndicatorDescriptor,
  getRegisteredIndicatorDefinition,
  removeScriptIndicatorDefinition,
} from '@363045841yyt/klinechart-core'
import { describe, expect, it } from 'vitest'
import { createScriptService } from '../impl/createScriptService.js'
import { createScriptPersistence } from '../impl/scriptPersistence.js'

const source = `defineIndicator({ name: 'ServiceAverage', pane: 'sub', inputs: { n: input(2) },
  onBar() { plot(PlotKind.Line, (open[0] + close[0]) / params.n, { id: 'average' }) } })`

describe('ScriptService', () => {
  it('用户源码和版本从 IndexedDB 恢复，删除后不再恢复', async () => {
    const scripts = await createScriptService()
    await expect(scripts.create(source.replace('ServiceAverage', '!!!'))).rejects.toThrow(
      '脚本名称',
    )
    const initial = await scripts.create(source.replace('ServiceAverage', 'PersistedAverage'))
    const next = await scripts.update(initial.id, initial.source.replace('input(2)', 'input(6)'), 1)
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
      failed.update(initial.id, initial.source.replace('input(2)', 'input(8)'), 1),
    ).rejects.toThrow('磁盘写入失败')
    expect(scripts.read(initial.id)).toEqual(initial)
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
