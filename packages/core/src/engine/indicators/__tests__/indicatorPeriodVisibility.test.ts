// 指标周期可见性契约的单测：解析、区间判定与渲染层拦截。
import { describe, expect, it } from 'vitest'
import { createMockRenderContext } from '@/engine/__tests__/helpers/renderTestKit.js'
import {
  createIndicatorLayer,
  isLayerVisibleOnPeriod,
} from '@/engine/renderers/Indicator/factory.js'
import type { RenderContext } from '@/foundation/plugin/index.js'
import type { Layer } from '@/rendering/scene/types.js'
import type { IndicatorMetadata } from '../indicatorMetadata.js'
import {
  INDICATOR_PERIOD_INPUT_OPTIONS,
  isIndicatorVisibleOnPeriod,
  isPeriodInRange,
  parseIndicatorPeriod,
  resolveIndicatorPeriodRange,
} from '../indicatorPeriodVisibility.js'

describe('parseIndicatorPeriod', () => {
  it('识别已知周期，未知周期返回 undefined', () => {
    expect(parseIndicatorPeriod('15min')).toEqual({ unit: 'minute', value: 15 })
    expect(parseIndicatorPeriod('4h')).toEqual({ unit: 'hour', value: 4 })
    expect(parseIndicatorPeriod('daily')).toEqual({ unit: 'day', value: 1 })
    expect(parseIndicatorPeriod('weekly')).toEqual({ unit: 'week', value: 1 })
    expect(parseIndicatorPeriod('bogus')).toBeUndefined()
  })
})

describe('INDICATOR_PERIOD_INPUT_OPTIONS', () => {
  it('选项值与周期表完全一致，且由短到长排列', () => {
    expect(INDICATOR_PERIOD_INPUT_OPTIONS.map((option) => option.value)).toEqual([
      '1min',
      '5min',
      '15min',
      '30min',
      '60min',
      '4h',
      'daily',
      'weekly',
      'monthly',
      'quarterly',
      'yearly',
    ])
  })
})

describe('isPeriodInRange', () => {
  it('按周期顺序判定，两端都含', () => {
    expect(isPeriodInRange('daily', '1min', '4h')).toBe(false)
    expect(isPeriodInRange('4h', '1min', '4h')).toBe(true)
    expect(isPeriodInRange('15min', '15min', '30min')).toBe(true)
    expect(isPeriodInRange('1min', '15min', '30min')).toBe(false)
  })

  it('未声明或无法解析时不做约束', () => {
    expect(isPeriodInRange('daily', undefined, undefined)).toBe(true)
    expect(isPeriodInRange('bogus', '1min', '4h')).toBe(true)
    expect(isPeriodInRange('daily', 'bogus', '4h')).toBe(true)
  })
})

describe('resolveIndicatorPeriodRange', () => {
  it('实例参数缺字段时用定义默认值补齐', () => {
    expect(resolveIndicatorPeriodRange({ visibleTo: '4h' }, undefined)).toEqual({ to: '4h' })
    expect(resolveIndicatorPeriodRange({ visibleTo: '4h' }, { visibleFrom: '1min' })).toEqual({
      from: '1min',
      to: '4h',
    })
    expect(resolveIndicatorPeriodRange(undefined, {})).toEqual({})
    // 实例值优先于定义默认值
    expect(resolveIndicatorPeriodRange({ visibleTo: '4h' }, { visibleTo: 'yearly' })).toEqual({
      to: 'yearly',
    })
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

  it('实例区间收窄可见范围，且不能突破定义声明的上限', () => {
    expect(isIndicatorVisibleOnPeriod('5min', undefined, { to: '4h' })).toBe(true)
    expect(isIndicatorVisibleOnPeriod('daily', undefined, { to: '4h' })).toBe(false)
    expect(
      isIndicatorVisibleOnPeriod('weekly', [{ unit: 'minute' }], {
        from: '1min',
        to: 'yearly',
      }),
    ).toBe(false)
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

  it('仅在实例参数声明区间时包裹 Layer，并按周期拦截绘制', () => {
    let painted = 0
    const layer: Layer<RenderContext> = {
      ...fakeLayer(),
      paint: () => {
        painted += 1
      },
    }
    const definition = fakeDefinition(layer)
    const unwrapped = createIndicatorLayer({
      definition,
      paneId: 'main',
      indicatorId: 'fake',
      instanceId: 'fake_main',
    })
    expect(unwrapped).toBe(layer)

    const gated = createIndicatorLayer({
      definition,
      paneId: 'main',
      indicatorId: 'fake',
      instanceId: 'fake_main',
      params: { visibleFrom: '1min', visibleTo: '4h' },
    })
    expect(gated).not.toBe(layer)
    gated.paint(createMockRenderContext({ period: 'daily' }))
    expect(painted).toBe(0)
    gated.paint(createMockRenderContext({ period: '1min' }))
    expect(painted).toBe(1)
  })
})
