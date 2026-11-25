// 指标周期可见性契约的单测：解析、区间判定与渲染层拦截。
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createMockRenderContext } from '@/engine/__tests__/helpers/renderTestKit.js'
import {
  clearIndicatorLayerNamingForTest,
  registerIndicatorLayerNaming,
} from '@/engine/indicators/indicatorLayerNaming.js'
import { createIndicatorLayer } from '@/engine/renderers/Indicator/factory.js'
import type { RenderContext } from '@/foundation/plugin/index.js'
import type { Layer } from '@/rendering/scene/types.js'
import type { IndicatorMetadata } from '../indicatorMetadata.js'
import { isIndicatorVisibleOnPeriod, parseIndicatorPeriod } from '../indicatorPeriodVisibility.js'

beforeAll(() => registerIndicatorLayerNaming(['fake'], ({ paneId }) => `fake_${paneId}`))
afterAll(() => clearIndicatorLayerNamingForTest())

describe('parseIndicatorPeriod', () => {
  it.each([
    { period: '15min', expected: { unit: 'minute', value: 15 } },
    { period: '4h', expected: { unit: 'hour', value: 4 } },
    { period: 'daily', expected: { unit: 'day', value: 1 } },
    { period: 'weekly', expected: { unit: 'week', value: 1 } },
    { period: 'bogus', expected: undefined },
  ])('解析 $period', ({ period, expected }) => {
    expect(parseIndicatorPeriod(period)).toEqual(expected)
  })
})

describe('isIndicatorVisibleOnPeriod', () => {
  const units = [{ unit: 'minute' }, { unit: 'hour' }] satisfies IndicatorMetadata['visiblePeriods']
  const bounded = [
    { unit: 'minute', min: 5, max: 30 },
  ] satisfies IndicatorMetadata['visiblePeriods']
  it.each([
    { scenario: '未配置', period: 'daily', ranges: undefined, visible: true },
    { scenario: '空配置', period: 'daily', ranges: [], visible: true },
    { scenario: '匹配分钟', period: '5min', ranges: units, visible: true },
    { scenario: '匹配小时', period: '4h', ranges: units, visible: true },
    { scenario: '单位不匹配', period: 'daily', ranges: units, visible: false },
    { scenario: '低于下限', period: '1min', ranges: bounded, visible: false },
    { scenario: '等于下限', period: '5min', ranges: bounded, visible: true },
    { scenario: '等于上限', period: '30min', ranges: bounded, visible: true },
    { scenario: '高于上限', period: '60min', ranges: bounded, visible: false },
  ])('$scenario', ({ period, ranges, visible }) => {
    expect(isIndicatorVisibleOnPeriod(period, ranges)).toBe(visible)
  })
})

/** 构造只用于身份断言的最小上下文图层，不发绘制指令。 */
function fakeLayer(): Layer<RenderContext> {
  return {
    id: 'fake_layer',
    kind: 'context',
    pane: 'main',
    role: 'content',
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
    kind: 'indicator',
    name: 'fake',
    displayName: 'FAKE',
    category: 'main',
    defaultPaneId: 'main',
    getRendererName: () => 'fake',
    visiblePeriods,
    rendererFactory: () => layer,
  }
}

describe('renderer layer gating', () => {
  const minuteOnly = [{ unit: 'minute' }] satisfies IndicatorMetadata['visiblePeriods']
  it.each([
    { scenario: '未限制周期', ranges: undefined, calls: [1, 2] },
    { scenario: '仅限分钟周期', ranges: minuteOnly, calls: [0, 1] },
  ])('$scenario时实际执行或跳过绘制', ({ ranges, calls }) => {
    const layer = fakeLayer()
    const paint = vi.spyOn(layer, 'paint')
    const assembled = createIndicatorLayer({
      definition: fakeDefinition(layer, ranges),
      paneId: 'main',
      indicatorId: 'fake',
      instanceId: 'fake_main',
      axisId: 'main',
    })
    expect(assembled.id).toContain('fake_main')
    for (const [index, period] of ['daily', '5min'].entries()) {
      assembled.paint({ ...createMockRenderContext({ period }), paneId: 'main', clear: false })
      expect(paint).toHaveBeenCalledTimes(calls[index]!)
    }
  })

  it('paints only when both the indicator definition and instance allow the period', () => {
    const layer = fakeLayer()
    const paint = vi.spyOn(layer, 'paint')
    const assembled = createIndicatorLayer({
      definition: fakeDefinition(layer, minuteOnly),
      paneId: 'main',
      indicatorId: 'fake',
      instanceId: 'fake_main',
      axisId: 'main',
      timeframeVisibility: { mode: 'above', period: '5min' },
    })
    for (const period of ['1min', 'daily', '5min']) {
      assembled.paint({ ...createMockRenderContext({ period }), paneId: 'main', clear: false })
    }
    expect(paint).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ period: '5min' }))
  })
})

