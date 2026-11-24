/** 验证完整实例集合的计划提交边界与独立展示版本。 */
import { describe, expect, it } from 'vitest'
import { createIndicatorInstancePipeline } from '../instances/assembly/indicatorInstancePipeline.js'
import { createTestInstance } from './helpers/instanceTestKit.js'

describe('IndicatorInstancePipeline', () => {
  it('publishes the whole instance set in a single plan revision', () => {
    const pipeline = createIndicatorInstancePipeline()
    const main = createTestInstance({ instanceId: 'main-ema', definitionId: 'EMA' })
    const sub = createTestInstance({ instanceId: 'sub-ema', definitionId: 'EMA', paneId: 'sub' })
    const other = createTestInstance({ instanceId: 'macd', definitionId: 'MACD', paneId: 'sub' })

    expect(pipeline.publish([main, sub, other])).toBe(true)
    const initial = pipeline.calculationPlan()
    expect(initial.calculationRevision).toBe(1)
    expect(initial.tasks.map(({ instanceIds }) => instanceIds)).toEqual([
      ['main-ema', 'sub-ema'],
      ['macd'],
    ])

    const newInput = createTestInstance({
      instanceId: main.instanceId,
      definitionId: main.definitionId,
      inputs: { length: 20 },
    })
    expect(pipeline.publish([newInput, other])).toBe(true)
    const next = pipeline.calculationPlan()
    expect(next.calculationRevision).toBe(2)
    expect(next.tasks.map(({ instanceIds }) => instanceIds)).toEqual([['main-ema'], ['macd']])
    expect(next.tasks.map(({ inputs }) => inputs)).toEqual([{ length: 20 }, {}])
  })

  it('keeps the plan when a pane or visual settings change', () => {
    const pipeline = createIndicatorInstancePipeline()
    const instance = createTestInstance({ instanceId: 'ema', definitionId: 'EMA' })
    pipeline.publish([instance])
    const initialPlan = pipeline.calculationPlan()
    const updated = { ...instance, paneId: 'sub', presentation: { width: 2 } }

    expect(pipeline.publish([updated])).toBe(false)
    expect(pipeline.calculationPlan()).toBe(initialPlan)
    const snapshot = pipeline.snapshot()
    expect(snapshot.instances.get(instance.instanceId)).toEqual(updated)
    expect(pipeline.publish([updated])).toBe(false)
    expect(pipeline.snapshot()).toBe(snapshot)
  })
})
