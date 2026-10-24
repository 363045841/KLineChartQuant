/** 实例投影测试：计算结果只经由同一 Plot 模型进入渲染状态。 */
import { ShapeSize } from '@363045841yyt/klinechart-plot-contracts'
import { beforeAll, describe, expect, it } from 'vitest'
import { isPlotRenderState } from '@/engine/plots/impl/readPlotState.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { getRegisteredIndicatorDefinition } from '../indicatorDefinitionRegistry.js'
import type {
  IndicatorParameters,
  IndicatorSeriesResult,
} from '../instances/domain/instanceModel.js'
import { composeInstanceRenderState } from '../stateComposer.js'
import { createTestData } from './helpers/instanceTestKit.js'
import { registerPlotIndicatorFixture } from './helpers/plotIndicatorTestKit.js'

/** 夹具系数；compute 与断言共用，避免两处各写一份数值。 */
const FACTOR = 2

beforeAll(() => {
  registerPlotIndicatorFixture({
    name: 'ProjectionPlotFixture',
    category: 'sub',
    defaultParams: { factor: FACTOR },
    compute: (data, params) => {
      const factor = typeof params.factor === 'number' ? params.factor : 0
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
            size: ShapeSize.Auto,
            dash: [],
          },
        ],
        fills: [],
      }
    },
  })
})

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
  it('Plot 指标的真实计算结果都能生成有效绘图点', () => {
    const definition = getRegisteredIndicatorDefinition('ProjectionPlotFixture')
    if (!definition?.runtime) throw new TypeError('ProjectionPlotFixture 未注册')
    const data = createTestData(300)
    const params = definition.runtime.defaultParams
    const raw = definition.runtime.compute(data, params)
    const state = composeInstanceRenderState(
      definition,
      result(raw, params),
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
