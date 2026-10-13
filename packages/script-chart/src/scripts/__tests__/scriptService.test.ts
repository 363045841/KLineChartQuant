/** 完整脚本生命周期：提交快照、版本冲突、失败隔离及删除。 */
import {
  getIndicatorDescriptor,
  getRegisteredIndicatorDefinition,
} from '@363045841yyt/klinechart-core'
import { describe, expect, it } from 'vitest'
import { createScriptService } from '../impl/createScriptService.js'

const source = `defineIndicator({ name: 'ServiceAverage', pane: 'sub', inputs: { n: input(2) },
  onBar() { plot((open[0] + close[0]) / params.n, PlotKind.Line, { id: 'average' }) } })`

describe('ScriptService', () => {
  it('单个快照完成 CRUD，更新不新增身份，过期版本或错误源码不覆盖', async () => {
    const scripts = await createScriptService()
    const initial = scripts.create(source)
    expect(initial.revision).toBe(1)
    expect(scripts.read(initial.id)).toEqual(initial)
    expect(() => scripts.create(source)).toThrow()
    const next = scripts.update(initial.id, source.replace('input(2)', 'input(4)'), 1)
    expect(next.revision).toBe(2)
    expect(getIndicatorDescriptor(initial.id)?.defaultParams).toEqual({ n: 4 })
    expect(getRegisteredIndicatorDefinition(initial.id)?.document?.source).toBe(next.source)
    expect(() => scripts.update(initial.id, source, 1)).toThrow('重新打开')
    expect(() => scripts.update(initial.id, 'defineIndicator(', 2)).toThrow()
    expect(scripts.read(initial.id)).toEqual(next)
    const bars = [{ timestamp: 1, open: 10, high: 20, low: 10, close: 20 }]
    expect(
      getRegisteredIndicatorDefinition(initial.id)?.runtime?.compute(bars, { n: 4 }),
    ).toMatchObject({
      plots: [{ id: 'average', data: [{ value: 7.5 }] }],
    })
    expect(scripts.list().map((document) => document.id)).toContain(initial.id)
    scripts.remove(initial.id, 2)
    expect(scripts.read(initial.id)).toBeUndefined()
    expect(getIndicatorDescriptor(initial.id)).toBeUndefined()
  })
})
