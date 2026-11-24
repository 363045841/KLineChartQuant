/** 脚本绘图颜色投影测试：别名在进入渲染状态前换成主题色值，CSS 字面量原样保留。 */
import type {
  ArrowPlot,
  CandlePlot,
  IndicatorSeries,
  Plot,
  PlotPoint,
} from '@363045841yyt/klinechart-plot-contracts'
import { ShapeSize } from '@363045841yyt/klinechart-plot-contracts'
import { describe, expect, it } from 'vitest'

import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { projectPlots } from '../impl/projectPlots.js'
import { isPlotRenderState } from '../impl/readPlotState.js'

const colors = resolveThemeColors('light', false)
const palette = colors.scriptPalette

/** 集合型指标的最小声明：数据全部来自脚本产出的 IndicatorSeries。 */
const definition = { source: 'series', series: [] } as const

/** 两根 bar 的价格区间，足够支撑填充边界校验。 */
const RANGE = { start: 0, end: 2 } as const

function project(series: IndicatorSeries) {
  const state = projectPlots(definition, series, {}, RANGE, 0, colors)
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

/** 一条折线的最小声明；颜色逐点给出，采集端已物化缺省色。 */
function linePlot(id: string, data: readonly (PlotPoint | undefined)[]) {
  return {
    kind: 'line' as const,
    id,
    label: id.toUpperCase(),
    data,
    visible: true,
    offset: 0,
    size: ShapeSize.auto,
    dash: [],
  }
}

describe('projectPlots — script colors', () => {
  it('resolves point colors and leaves CSS literals untouched', () => {
    const state = project({
      plots: [
        linePlot('fast', [
          { value: 1, color: '@teal80' },
          { value: 2, color: '@red' },
        ]),
        linePlot('slow', [{ value: 1, color: '#123456' }]),
      ],
      fills: [],
    })
    const [fast, slow] = state.plots
    expect(fast!.data[0]!.color).toBe(`${palette.teal}80`)
    expect(fast!.data[1]!.color).toBe(palette.red)
    expect(slow!.data[0]!.color).toBe('#123456')
  })

  it('resolves arrow direction colors per point and fill colors', () => {
    const state = project({
      plots: [
        linePlot('fast', [
          { value: 1, color: '@red' },
          { value: 2, color: '@red' },
        ]),
        linePlot('slow', [
          { value: 1, color: '@blue' },
          { value: 3, color: '@blue' },
        ]),
        {
          kind: 'arrow',
          id: 'signal',
          label: 'SIGNAL',
          data: [
            { value: 1, color: '@green' },
            { value: -1, color: '@red' },
          ],
          visible: true,
          offset: 0,
          size: ShapeSize.auto,
        },
      ],
      fills: [{ id: 'cloud', from: 'fast', to: 'slow', visible: true, colors: ['@amber', null] }],
    })
    const arrow = expectArrow(state.plots[2]!)
    expect(arrow.data[0]!.color).toBe(palette.green)
    expect(arrow.data[1]!.color).toBe(palette.red)
    expect(state.fills[0]!.colors).toEqual([palette.amber, null])
  })

  it('resolves OHLC colors and keeps null as not drawn', () => {
    const state = project({
      plots: [
        {
          kind: 'candle',
          id: 'candles',
          label: 'CANDLES',
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
    expect(candles.data[0]!.color).toBe(palette.green)
    expect(candles.data[0]!.wickColor).toBeNull()
    expect(candles.data[0]!.borderColor).toBe('#000000')
  })

  it('maps hline declarations to theme-resolved guides', () => {
    const state = project({
      plots: [],
      fills: [],
      hlines: [
        { id: '0', price: 70, color: '@gray', dash: [4, 4], width: 2 },
        { id: '1', price: 30, color: '#123456', dash: [], width: 1 },
      ],
      hlineFills: [{ id: 'zone', from: '0', to: '1', color: '@teal26', visible: true }],
    })
    expect(state.guides).toEqual([
      { value: 70, color: palette.gray, dash: [4, 4], width: 2 },
      { value: 30, color: '#123456', dash: [], width: 1 },
    ])
    expect(state.guideFills).toEqual([
      { from: 70, to: 30, color: `${palette.teal}26`, visible: true },
    ])
  })
})
