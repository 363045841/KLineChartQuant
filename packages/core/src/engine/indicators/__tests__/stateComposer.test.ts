/** 实例投影测试：显隐只影响 Plot，计算结果保持完整，坐标轴从同一 Plot 模型取范围。 */
import { beforeAll, describe, expect, it } from 'vitest'
import { isPlotRenderState } from '@/engine/plots/impl/readPlotState.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import {
  getRegisteredIndicatorDefinition,
  getRegisteredIndicatorDefinitions,
} from '../indicatorDefinitionRegistry.js'
import type {
  IndicatorParameters,
  IndicatorSeriesResult,
} from '../instances/domain/instanceModel.js'
import { loadBuiltinIndicators } from '../registerBuiltins.js'
import { composeInstanceRenderState, composeVolumeRenderState } from '../stateComposer.js'
import { createTestData } from './helpers/instanceTestKit.js'

beforeAll(loadBuiltinIndicators)

/** 创建完整的实例结果，不改变计算器的数据形状。 */
function result(series: unknown, params: IndicatorParameters): IndicatorSeriesResult {
  return {
    instanceId: 'test',
    calculationKey: 'test',
    dataRevision: 1,
    params,
    series,
    firstReadyIndex: 0,
  }
}

describe('Plot instance projection', () => {
  it('所有 Plot 指标的真实计算结果都能生成有效绘图点', () => {
    const data = createTestData(300)
    for (const definition of getRegisteredIndicatorDefinitions()) {
      if (!definition.plots || !definition.runtime) continue
      const params = definition.runtime.defaultParams
      const raw = definition.runtime.compute(data, params)
      const state = composeInstanceRenderState(
        definition,
        result(raw, params),
        definition.presentation?.defaultOptions ?? {},
        { start: 0, end: 300 },
        1,
      )
      expect(state, definition.name).toMatchObject({ kind: 'plots' })
      if (!isPlotRenderState(state)) throw new TypeError(`Missing Plot output: ${definition.name}`)
      // 不依赖字段命名猜测：检查每个声明的 Plot 在足够长的数据上确实产出数值。
      for (const plot of state.plots) {
        expect(
          plot.data.some((point) => point && Number.isFinite(point.value)),
          `${definition.name}:${plot.id}`,
        ).toBe(true)
      }
    }
  })

  it('隐藏 BOLL 上轨不改变计算结果，并从可见 Plot 计算范围', () => {
    const definition = getRegisteredIndicatorDefinition('boll')!
    const raw = [
      { upper: 100, middle: 20, lower: 10 },
      { upper: 110, middle: 22, lower: 11 },
    ]
    const state = composeInstanceRenderState(
      definition,
      result(raw, { period: 1, multiplier: 2 }),
      { showUpper: false },
      { start: 0, end: 2 },
      1,
    )
    expect(state).toMatchObject({
      visibleMin: 10,
      visibleMax: 22,
      plots: [
        { id: 'upper', visible: false },
        { id: 'middle', visible: true },
        { id: 'lower', visible: true },
      ],
    })
    expect(raw[0]?.upper).toBe(100)
  })

  it('RSI 固定范围独立于可见数值，主题颜色来自统一 token', () => {
    const definition = getRegisteredIndicatorDefinition('rsi')!
    const state = composeInstanceRenderState(
      definition,
      result({ 6: [55], 12: [65], 24: [75] }, { period1: 6, period2: 12, period3: 24 }),
      {},
      { start: 0, end: 1 },
      1,
      resolveThemeColors('dark'),
    )
    expect(state).toMatchObject({ valueMin: 0, valueMax: 100, visibleMin: 55, visibleMax: 75 })
  })
})

describe('composeVolumeRenderState', () => {
  it('从帧行情计算可见成交量范围', () => {
    expect(composeVolumeRenderState(createTestData(3), { start: 0, end: 3 }, 99)).toEqual({
      timestamp: 99,
      valueMin: 980,
      valueMax: 1220,
    })
    expect(composeVolumeRenderState([], { start: 0, end: 0 }, 1)).toBeNull()
  })
})
