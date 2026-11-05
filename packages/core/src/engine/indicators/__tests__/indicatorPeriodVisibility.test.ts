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

describe('isLayerVisibleOnPeriod', () => {
  it('未声明范围时任何周期都绘制', () => {
    expect(isLayerVisibleOnPeriod(fakeDefinition(fakeLayer()), 'daily')).toBe(true)
  })

  it('周期不在范围内时不绘制', () => {
    const definition = fakeDefinition(fakeLayer(), [{ unit: 'minute' }, { unit: 'hour' }])
    expect(isLayerVisibleOnPeriod(definition, '5min')).toBe(true)
    expect(isLayerVisibleOnPeriod(definition, '4h')).toBe(true)
    expect(isLayerVisibleOnPeriod(definition, 'daily')).toBe(false)
  })
})

describe('createIndicatorLayer 装配', () => {
  it('未声明范围时原样复用 Layer', () => {
    const layer = fakeLayer()
    const assembled = createIndicatorLayer({
      definition: fakeDefinition(layer),
      paneId: 'main',
      indicatorId: 'fake',
      instanceId: 'fake_main',
    })
    expect(assembled).toBe(layer)
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
