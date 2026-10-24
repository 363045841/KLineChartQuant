/** 脚本绘图颜色投影测试：别名在进入渲染状态前换成主题色值，CSS 字面量原样保留。 */
import type {
  ArrowPlot,
  CandlePlot,
  Plot,
  PlotCollection,
  PlotPoint,
} from '@363045841yyt/klinechart-plot-contracts'
import { ShapeSize } from '@363045841yyt/klinechart-plot-contracts'
import { describe, expect, it } from 'vitest'

import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { projectPlots } from '../impl/projectPlots.js'
import { isPlotRenderState } from '../impl/readPlotState.js'

const colors = resolveThemeColors('light', false)
const palette = colors.scriptPalette

/** 集合型指标的最小声明：数据全部来自脚本产出的 PlotCollection。 */
const definition = { source: 'collection', series: [] } as const

/** 两根 bar 的价格区间，足够支撑填充边界校验。 */
const RANGE = { start: 0, end: 2 } as const

function project(collection: PlotCollection) {
  const state = projectPlots(definition, collection, {}, RANGE, 0, colors)
  if (!isPlotRenderState(state)) throw new TypeError('Missing Plot output')
  return state
}

/** 断言图形类别后再读专属字段，避免用例里堆叠可选链。 */
function expectArrow(plot: Plot): ArrowPlot {
  if (plot.kind !== 'arrow') throw new TypeError('Expected arrow plot')
  return plot
}

function expectCandle(plot: Plot): CandlePlot {
  if (plot.kind !== 'candle') throw new TypeError('Expected candle plot')
  return plot
}

/** 一条折线的最小声明，颜色与数据由用例覆盖。 */
function linePlot(id: string, color: string, data: readonly (PlotPoint | undefined)[]) {
  return {
    kind: 'line' as const,
    id,
    label: id.toUpperCase(),
    color,
    data,
    visible: true,
    offset: 0,
    size: ShapeSize.Auto,
    dash: [],
  }
}

describe('projectPlots — script colors', () => {
  it('resolves aliases and leaves CSS literals untouched', () => {
    const state = project({
      plots: [
        linePlot('fast', '@red', [{ value: 1, color: '@teal80' }, { value: 2 }]),
        linePlot('slow', '#123456', [{ value: 1 }]),
      ],
      fills: [],
    })
    const [fast, slow] = state.plots
    expect(fast!.color).toBe(palette.red)
    expect(fast!.data[0]!.color).toBe(`${palette.teal}80`)
    expect(fast!.data[1]!.color).toBeUndefined()
    expect(slow!.color).toBe('#123456')
  })

  it('resolves arrow direction colors and fill colors', () => {
    const state = project({
      plots: [
        linePlot('fast', '@red', [{ value: 1 }, { value: 2 }]),
        linePlot('slow', '@blue', [{ value: 1 }, { value: 3 }]),
        {
          kind: 'arrow',
          id: 'signal',
          label: 'SIGNAL',
          color: '@gray',
          colorUp: '@green',
          colorDown: '@red',
          data: [{ value: 1 }],
          visible: true,
          offset: 0,
          size: ShapeSize.Auto,
        },
      ],
      fills: [{ id: 'cloud', from: 'fast', to: 'slow', visible: true, colors: ['@amber', null] }],
    })
    const arrow = expectArrow(state.plots[2]!)
    expect(arrow.colorUp).toBe(palette.green)
    expect(arrow.colorDown).toBe(palette.red)
    expect(state.fills[0]!.colors).toEqual([palette.amber, null])
  })

  it('resolves OHLC colors and keeps null as not drawn', () => {
    const state = project({
      plots: [
        {
          kind: 'candle',
          id: 'candles',
          label: 'CANDLES',
          color: '@blue',
          data: [
            {
              open: 1,
              high: 2,
              low: 0,
              close: 1.5,
              color: '@green',
              wickColor: null,
              borderColor: '#000000',
            },
            undefined,
          ],
          visible: true,
          offset: 0,
        },
      ],
      fills: [],
    })
    const candles = expectCandle(state.plots[0]!)
    expect(candles.color).toBe(palette.blue)
    expect(candles.data[0]!.color).toBe(palette.green)
    expect(candles.data[0]!.wickColor).toBeNull()
    expect(candles.data[0]!.borderColor).toBe('#000000')
  })
})
