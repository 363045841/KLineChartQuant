// 指标周期可见性契约的单测：解析、区间判定与渲染层拦截。
import { describe, expect, it } from 'vitest'
import {
  createIndicatorLayer,
  isLayerVisibleOnPeriod,
} from '@/engine/renderers/Indicator/factory.js'
import type { RenderContext } from '@/foundation/plugin/index.js'
import type { Layer } from '@/rendering/scene/types.js'
import type { IndicatorMetadata } from '../indicatorMetadata.js'
import { isIndicatorVisibleOnPeriod, parseIndicatorPeriod } from '../indicatorPeriodVisibility.js'

describe('parseIndicatorPeriod', () => {
  it('识别已知周期，未知周期返回 undefined', () => {
    expect(parseIndicatorPeriod('15min')).toEqual({ unit: 'minute', value: 15 })
    expect(parseIndicatorPeriod('4h')).toEqual({ unit: 'hour', value: 4 })
    expect(parseIndicatorPeriod('daily')).toEqual({ unit: 'day', value: 1 })
    expect(parseIndicatorPeriod('weekly')).toEqual({ unit: 'week', value: 1 })
    expect(parseIndicatorPeriod('bogus')).toBeUndefined()
  })
})

describe('isIndicatorVisibleOnPeriod', () => {
  it('未声明范围时所有周期可见，声明后按单位与 min/max 判定', () => {
    expect(isIndicatorVisibleOnPeriod('daily', undefined)).toBe(true)
    expect(isIndicatorVisibleOnPeriod('daily', [])).toBe(true)
    const ranges = [{ unit: 'minute' as const }, { unit: 'hour' as const }]
    expect(isIndicatorVisibleOnPeriod('5min', ranges)).toBe(true)
    expect(isIndicatorVisibleOnPeriod('4h', ranges)).toBe(true)
    expect(isIndicatorVisibleOnPeriod('daily', ranges)).toBe(false)
    const bounded = [{ unit: 'minute' as const, min: 5, max: 30 }]
    expect(isIndicatorVisibleOnPeriod('1min', bounded)).toBe(false)
    expect(isIndicatorVisibleOnPeriod('15min', bounded)).toBe(true)
    expect(isIndicatorVisibleOnPeriod('60min', bounded)).toBe(false)
  })
})

/** 构造只用于身份断言的最小上下文图层，不发绘制指令。 */
function fakeLayer(): Layer<RenderContext> {
  return {
    id: 'fake_layer',
    kind: 'context',
    pane: 'main',
    role: 'primary',
    z: 1,
    visible: true,
    paint: () => {},
    dispose: () => {},
  }
}

/** 构造携带指定 Layer 与可见范围的最小指标定义。 */
function fakeDefinition(
  layer: Layer<RenderContext>,
  visiblePeriods?: IndicatorMetadata['visiblePeriods'],
): IndicatorMetadata {
  return {
    name: 'fake',
    displayName: 'FAKE',
    kind: 'indicator',
    category: 'main',
    defaultPaneId: 'main',
    getRendererName: () => 'fake',
    getScaleRendererName: () => null,
    visiblePeriods,
    rendererFactory: () => layer,
  }
}

describe('renderer layer gating', () => {
  it('未声明范围时直接复用 Layer，声明后按周期拦截绘制', () => {
    const layer = fakeLayer()
    expect(isLayerVisibleOnPeriod(fakeDefinition(layer), 'daily')).toBe(true)
    const assembled = createIndicatorLayer({
      definition: fakeDefinition(layer),
      paneId: 'main',
      indicatorId: 'fake',
      instanceId: 'fake_main',
    })
    expect(assembled).toBe(layer)

    const definition = fakeDefinition(fakeLayer(), [{ unit: 'minute' }, { unit: 'hour' }])
    expect(isLayerVisibleOnPeriod(definition, '5min')).toBe(true)
    expect(isLayerVisibleOnPeriod(definition, '4h')).toBe(true)
    expect(isLayerVisibleOnPeriod(definition, 'daily')).toBe(false)
  })

  it('声明范围时返回包裹后的新 Layer，并保留身份', () => {
    const layer = fakeLayer()
    const assembled = createIndicatorLayer({
      definition: fakeDefinition(layer, [{ unit: 'minute' }]),
      paneId: 'main',
      indicatorId: 'fake',
      instanceId: 'fake_main',
    })
    expect(assembled).not.toBe(layer)
    expect(assembled.id).toBe(layer.id)
    expect(assembled.pane).toBe(layer.pane)
  })
})
