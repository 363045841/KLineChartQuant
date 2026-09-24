/**
 * 实例渲染投影测试：单实例结果到 renderer state 的投影、展示配置合入、主图价格范围与成交量状态。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { getRegisteredIndicatorDefinition } from '../indicatorDefinitionRegistry'
import { IndicatorKind } from '../indicatorMetadata'
import type { IndicatorParameters, IndicatorSeriesResult } from '../instances/domain/instanceModel'
import { loadBuiltinIndicators } from '../registerBuiltins'
import {
  composeInstanceRenderState,
  composeVolumeRenderState,
  computeInstanceMainIndicatorPriceRange,
  createInstanceSeriesEntry,
  type VisibleRange,
} from '../stateComposer'
import { createTestData } from './helpers/instanceTestKit'
import { createTestIndicatorMetadata } from './helpers/metadataTestKit'

beforeAll(async () => {
  await loadBuiltinIndicators()
})

/** 无展示配置的最小 metadata，用于只关心结果包形状的用例。 */
const plainMetadata = createTestIndicatorMetadata({
  name: 'plain',
  displayName: 'PLAIN',
  kind: IndicatorKind.Indicator,
  category: 'main',
  indicatorType: 'other',
})

/** 构造单个实例的计算结果条目。 */
function createResult(series: unknown, params: IndicatorParameters = {}): IndicatorSeriesResult {
  return {
    instanceId: 'instance-a',
    calculationKey: 'test:{}:{}',
    dataRevision: 1,
    params,
    series,
    firstReadyIndex: null,
  }
}

const visibleRange: VisibleRange = { start: 0, end: 3 }

describe('createInstanceSeriesEntry', () => {
  it('保留已带 series 字段的结果包并附加计算参数', () => {
    const params = { period: 20 }
    const raw = { series: [{ upper: 1 }], signalSeries: [1] }

    expect(createInstanceSeriesEntry(plainMetadata, createResult(raw, params), {})).toEqual({
      series: [{ upper: 1 }],
      signalSeries: [1],
      params,
    })
  })

  it('把按周期索引的对象规范化为 enabledPeriods', () => {
    const raw = { 5: [1, 2], 10: [3, 4] }

    expect(createInstanceSeriesEntry(plainMetadata, createResult(raw), {})).toEqual({
      series: raw,
      params: {},
      enabledPeriods: [5, 10],
    })
  })

  it('数组与标量结果直通且不推导 enabledPeriods', () => {
    expect(createInstanceSeriesEntry(plainMetadata, createResult([1, 2]), {})).toEqual({
      series: [1, 2],
      params: {},
    })
    expect(createInstanceSeriesEntry(plainMetadata, createResult(42), {})).toEqual({
      series: 42,
      params: {},
    })
  })

  it('把展示配置合入 renderer 读取的参数', () => {
    const boll = getRegisteredIndicatorDefinition('boll')!
    const series = [{ upper: 1, middle: 2, lower: 3 }]

    expect(
      createInstanceSeriesEntry(boll, createResult(series, { period: 20, multiplier: 2 }), {
        showUpper: false,
        showMiddle: true,
        showLower: true,
      }),
    ).toEqual({
      series,
      params: { period: 20, multiplier: 2, showUpper: false, showMiddle: true, showLower: true },
    })
  })

  it('按 selectSeriesKeys 过滤可见序列', () => {
    const ma = getRegisteredIndicatorDefinition('ma')!
    const raw = { 5: [1], 10: [2] }

    expect(
      createInstanceSeriesEntry(ma, createResult(raw, { period1: 5, period2: 10 }), {
        ma5: true,
        ma10: false,
      }),
    ).toEqual({
      series: { 5: [1] },
      params: { period1: 5, period2: 10, ma5: true, ma10: false },
      enabledPeriods: [5],
    })
  })
})

describe('composeInstanceRenderState', () => {
  it('通过 mainPane.composeRenderState 投影实例结果', () => {
    const params = { period: 20 }
    const state = { timestamp: 1, visibleMin: 1, visibleMax: 2 }
    const composeRenderState = vi.fn(() => state)
    const metadata = createTestIndicatorMetadata(
      {
        name: 'ma',
        displayName: 'MA',
        kind: IndicatorKind.Indicator,
        category: 'main',
        indicatorType: 'moving-average',
      },
      { mainPane: { rendererName: 'ma', composeRenderState } },
    )
    const result = createResult({ series: [1, 2, 3] }, params)

    expect(
      composeInstanceRenderState(metadata, result, { showUpper: true }, visibleRange, 1234),
    ).toBe(state)
    expect(composeRenderState).toHaveBeenCalledWith(
      { series: [1, 2, 3], params: { period: 20, showUpper: true } },
      visibleRange,
      1234,
    )
  })

  it('通过 visibleState.compose 投影副图实例结果', () => {
    const state = { timestamp: 1, valueMin: 0, valueMax: 100 }
    const compose = vi.fn(() => state)
    const metadata = createTestIndicatorMetadata(
      {
        name: 'rsi',
        displayName: 'RSI',
        kind: IndicatorKind.Indicator,
        category: 'oscillator',
        indicatorType: 'momentum',
      },
      { visibleState: { compose } },
    )
    const result = createResult([undefined, 55])

    expect(composeInstanceRenderState(metadata, result, {}, visibleRange, 4321)).toBe(state)
    expect(compose).toHaveBeenCalledWith({
      entry: { series: [undefined, 55], params: {} },
      visibleRange,
      timestamp: 4321,
      active: true,
    })
  })

  it('mainPane 优先于 visibleState', () => {
    const mainState = { source: 'main' }
    const visibleState = { source: 'visible' }
    const composeRenderState = vi.fn(() => mainState)
    const compose = vi.fn(() => visibleState)
    const metadata = createTestIndicatorMetadata(
      {
        name: 'mix',
        displayName: 'MIX',
        kind: IndicatorKind.Indicator,
        category: 'main',
        indicatorType: 'other',
      },
      {
        mainPane: { rendererName: 'mix', composeRenderState },
        visibleState: { compose },
      },
    )

    expect(composeInstanceRenderState(metadata, createResult([]), {}, visibleRange, 1)).toBe(
      mainState,
    )
    expect(compose).not.toHaveBeenCalled()
  })

  it('没有 composer 时返回 undefined', () => {
    const metadata = createTestIndicatorMetadata({
      name: 'plain',
      displayName: 'PLAIN',
      kind: IndicatorKind.Indicator,
      category: 'main',
      indicatorType: 'other',
    })

    expect(
      composeInstanceRenderState(metadata, createResult([]), {}, visibleRange, 1),
    ).toBeUndefined()
  })
})

describe('computeInstanceMainIndicatorPriceRange', () => {
  it('委托 metadata.mainPane.computePriceRange 并传入实例条目', () => {
    const computePriceRange = vi.fn(() => ({ min: 10, max: 20 }))
    const metadata = createTestIndicatorMetadata(
      {
        name: 'boll',
        displayName: 'BOLL',
        kind: IndicatorKind.Indicator,
        category: 'main',
        indicatorType: 'channel',
      },
      { mainPane: { rendererName: 'boll', computePriceRange } },
    )
    const result = createResult({ series: [1] }, { period: 20 })

    expect(computeInstanceMainIndicatorPriceRange(metadata, result, visibleRange)).toEqual({
      min: 10,
      max: 20,
    })
    expect(computePriceRange).toHaveBeenCalledWith(
      { series: [1], params: { period: 20 } },
      visibleRange,
    )
  })

  it('缺少主图价格范围计算器时返回 null', () => {
    const withoutComputer = createTestIndicatorMetadata(
      {
        name: 'ma',
        displayName: 'MA',
        kind: IndicatorKind.Indicator,
        category: 'main',
        indicatorType: 'moving-average',
      },
      { mainPane: { rendererName: 'ma' } },
    )
    const withoutMainPane = createTestIndicatorMetadata({
      name: 'rsi',
      displayName: 'RSI',
      kind: IndicatorKind.Indicator,
      category: 'oscillator',
      indicatorType: 'momentum',
    })

    expect(
      computeInstanceMainIndicatorPriceRange(withoutComputer, createResult([]), visibleRange),
    ).toBeNull()
    expect(
      computeInstanceMainIndicatorPriceRange(withoutMainPane, createResult([]), visibleRange),
    ).toBeNull()
  })
})

describe('composeVolumeRenderState', () => {
  it('按可见区间计算成交量上下界并留出 padding', () => {
    const data = createTestData(3)

    expect(composeVolumeRenderState(data, { start: 0, end: 3 }, 99)).toEqual({
      timestamp: 99,
      valueMin: 980,
      valueMax: 1220,
    })
    expect(composeVolumeRenderState(data, { start: 1, end: 3 }, 99)).toEqual({
      timestamp: 99,
      valueMin: 1090,
      valueMax: 1210,
    })
  })

  it('无成交量或空数据时返回 null', () => {
    const noVolume = createTestData(2).map((item) => ({
      timestamp: item.timestamp,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
    }))

    expect(composeVolumeRenderState(noVolume, { start: 0, end: 2 }, 1)).toBeNull()
    expect(composeVolumeRenderState([], { start: 0, end: 0 }, 1)).toBeNull()
  })
})
