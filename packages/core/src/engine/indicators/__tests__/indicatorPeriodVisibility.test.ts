// 指标周期可见性契约的单测：解析、区间判定与渲染层拦截。
import { describe, expect, it } from 'vitest'
import { createIndicatorLayer } from '@/engine/renderers/Indicator/factory.js'
import type { RenderContext } from '@/foundation/plugin/index.js'
import type { Layer } from '@/rendering/scene/types.js'
import type { IndicatorMetadata } from '../indicatorMetadata.js'
import { isIndicatorVisibleOnPeriod, parseIndicatorPeriod } from '../indicatorPeriodVisibility.js'

describe('parseIndicatorPeriod', () => {
  it('识别分钟、小时与日线以上周期', () => {
    expect(parseIndicatorPeriod('15min')).toEqual({ unit: 'minute', value: 15 })
    expect(parseIndicatorPeriod('4h')).toEqual({ unit: 'hour', value: 4 })
    expect(parseIndicatorPeriod('daily')).toEqual({ unit: 'day', value: 1 })
    expect(parseIndicatorPeriod('weekly')).toEqual({ unit: 'week', value: 1 })
  })

  it('未知周期返回 undefined', () => {
    expect(parseIndicatorPeriod('bogus')).toBeUndefined()
  })
})

describe('isIndicatorVisibleOnPeriod', () => {
  it('未声明范围时所有周期可见', () => {
    expect(isIndicatorVisibleOnPeriod('daily', undefined)).toBe(true)
    expect(isIndicatorVisibleOnPeriod('daily', [])).toBe(true)
  })

  it('按单位匹配，跨单位不可见', () => {
    const ranges = [{ unit: 'minute' as const }, { unit: 'hour' as const }]
    expect(isIndicatorVisibleOnPeriod('5min', ranges)).toBe(true)
    expect(isIndicatorVisibleOnPeriod('4h', ranges)).toBe(true)
    expect(isIndicatorVisibleOnPeriod('daily', ranges)).toBe(false)
  })

  it('同单位内按 min/max 夹区间', () => {
    const ranges = [{ unit: 'minute' as const, min: 5, max: 30 }]
    expect(isIndicatorVisibleOnPeriod('1min', ranges)).toBe(false)
    expect(isIndicatorVisibleOnPeriod('15min', ranges)).toBe(true)
    expect(isIndicatorVisibleOnPeriod('60min', ranges)).toBe(false)
  })
})

/** 构造只用于可见性断言的假 Layer，paint 记录调用次数。 */
function fakeLayer(calls: { count: number }): Layer<RenderContext> {
  return {
    id: 'fake_layer',
    pane: 'main',
    role: 'primary',
    z: 1,
    visible: true,
    paint: () => {
      calls.count += 1
    },
    dispose: () => {},
  } as unknown as Layer<RenderContext>
}

/** 构造只声明可见范围的最小指标定义。 */
function fakeDefinition(visiblePeriods: IndicatorMetadata['visiblePeriods']): IndicatorMetadata {
  return {
    name: 'fake',
    displayName: 'FAKE',
    kind: 'indicator',
    category: 'main',
    defaultPaneId: 'main',
    visiblePeriods,
    rendererFactory: () => callsLayer,
  } as unknown as IndicatorMetadata
}

let callsLayer: Layer<RenderContext>

describe('createIndicatorLayer 周期拦截', () => {
  it('周期不在范围内时不调用原始 paint', () => {
    const calls = { count: 0 }
    callsLayer = fakeLayer(calls)
    const layer = createIndicatorLayer({
      definition: fakeDefinition([{ unit: 'minute' }]),
      paneId: 'main',
      indicatorId: 'fake',
      instanceId: 'fake_main',
    })
    layer.paint({ period: 'daily' } as unknown as Parameters<Layer<RenderContext>['paint']>[0])
    expect(calls.count).toBe(0)
    layer.paint({ period: '5min' } as unknown as Parameters<Layer<RenderContext>['paint']>[0])
    expect(calls.count).toBe(1)
  })

  it('未声明范围时原样复用 Layer', () => {
    const calls = { count: 0 }
    callsLayer = fakeLayer(calls)
    const layer = createIndicatorLayer({
      definition: fakeDefinition(undefined),
      paneId: 'main',
      indicatorId: 'fake',
      instanceId: 'fake_main',
    })
    expect(layer).toBe(callsLayer)
  })
})
