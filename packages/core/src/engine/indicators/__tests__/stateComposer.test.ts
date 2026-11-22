/** 实例投影测试：计算结果只经由同一 Plot 模型进入渲染状态。 */
import { ShapeSize } from '@363045841yyt/klinechart-plot-contracts'
import { beforeAll, describe, expect, it } from 'vitest'
import { isPlotRenderState } from '@/engine/plots/impl/readPlotState.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import type { IndicatorInputs, IndicatorResult } from '../instances/domain/indicatorModel.js'
import { getRegisteredIndicatorDefinition } from '../pipeline/index.js'
import { composeInstanceRenderState } from '../stateComposer.js'
import { createTestData } from './helpers/instanceTestKit.js'
import { registerPlotIndicatorFixture } from './helpers/plotIndicatorTestKit.js'

/** 夹具系数；compute 与断言共用，避免两处各写一份数值。 */
const FACTOR = 2

beforeAll(() => {
  registerPlotIndicatorFixture({
    name: 'ProjectionPlotFixture',
    category: 'sub',
    defaultInputs: { factor: FACTOR },
    compute: (data, inputs) => {
      const factor = typeof inputs.factor === 'number' ? inputs.factor : 0
      return {
        plots: [
          {
            kind: 'line',
            id: 'close',
            label: 'CLOSE',
            data: data.map((bar) => ({ value: bar.close * factor })),
            color: 'red',
            visible: true,
            offset: 0,
            size: ShapeSize.auto,
            dash: [],
          },
        ],
        fills: [],
      }
    },
  })
})

/** 创建一次计算结果，不改变计算器的数据形状。 */
function result(series: unknown): IndicatorResult {
  return {
    timestamps: [],
    dataRevision: 1,
    marketRevision: 0,
    series,
  }
}

describe('Plot instance projection', () => {
  it('Plot 指标的真实计算结果都能生成有效绘图点', () => {
    const definition = getRegisteredIndicatorDefinition('ProjectionPlotFixture')
    if (!definition?.runtime) throw new TypeError('ProjectionPlotFixture 未注册')
    const data = createTestData(300)
    const params = definition.runtime.defaultInputs
    const raw = definition.runtime.compute(data, params)
    const state = composeInstanceRenderState(
      definition,
      result(raw),
      params,
      definition.presentation?.defaultOptions ?? {},
      { start: 0, end: 300 },
      1,
      resolveThemeColors('light'),
    )
    expect(state).toMatchObject({ kind: 'plots' })
    if (!isPlotRenderState(state)) throw new TypeError('Missing Plot output')
    for (const plot of state.plots) {
      expect(
        plot.data.some((point) =>
          point === undefined
            ? false
            : 'close' in point
              ? Number.isFinite(point.close)
              : Number.isFinite(point.value),
        ),
        plot.id,
      ).toBe(true)
    }
    // 投影后的数值与夹具公式一致，避免只断言“有值”。
    expect(state.plots[0]?.data[0]).toMatchObject({ value: data[0]!.close * FACTOR })
  })
})
