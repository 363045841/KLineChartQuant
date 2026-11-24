/** 标签收集：每个来源只声明对象与值，轴归属由对象绑定解析。 */

import type { Plot } from '@363045841yyt/klinechart-plot-contracts'
import { describe, expect, it } from 'vitest'
import {
  createKLineData,
  createMockRenderContext,
  createMockStateReader,
} from '@/engine/__tests__/helpers/renderTestKit'
import type { PaneAxisSpec } from '@/engine/pane/axisTypes'
import type { PlotRenderState } from '@/engine/plots/types'
import { PRICE_SERIES_AXIS_ID } from '@/engine/renderers/rendererIds'
import { ScaleType } from '@/foundation/types/scaleType'
import { collectAxisLabels } from '../index.js'
import type { AxisLabel } from '../types.js'
import { createLabelScope } from './helpers.js'

const PRICE_AXIS: PaneAxisSpec = {
  paneId: 'main',
  axisId: 'price',
  decimals: 2,
  visible: true,
  scaleType: ScaleType.Linear,
  objectIds: ['ema'],
}

/** 构造只声明差异的指标渲染状态。 */
function plotState(overrides: Partial<PlotRenderState> = {}): PlotRenderState {
  return {
    kind: 'plots',
    timestamp: 0,
    params: {},
    valueMin: 0,
    valueMax: 0,
    visibleMin: 0,
    visibleMax: 0,
    plots: [],
    fills: [],
    guides: [],
    guideFills: [],
    ...overrides,
  }
}

/** 只声明数值列的折线输出；颜色逐点给出（生产端已物化）。 */
function linePlot(values: ReadonlyArray<number>, extra: Record<string, unknown> = {}) {
  return {
    kind: 'line' as const,
    id: 'fast',
    label: 'EMA12',
    visible: true,
    offset: 0,
    size: 'auto' as const,
    dash: [],
    data: values.map((value) => ({ value, color: '#2962ff' })),
    ...extra,
  }
}

/** 以状态读取器收集当前轴的标签。 */
function collect(
  axes: readonly PaneAxisSpec[],
  state: unknown,
  overrides: Parameters<typeof createLabelScope>[1] = {},
): readonly AxisLabel[] {
  const context = createMockRenderContext({
    pane: { axisIds: axes.map((axis) => axis.axisId) },
    data: createKLineData(3),
  })
  const scope = createLabelScope(context, {
    axes,
    indicatorState: createMockStateReader('ema', state),
    ...overrides,
  })
  return collectAxisLabels([scope]).forAxis(axes[0]!.axisId)
}

describe('collectAxisLabels', () => {
  it('每个可见价格输出取最后一个有效值，颜色与格式跟随该点', () => {
    const labels = collect(
      [PRICE_AXIS],
      plotState({
        plots: [
          linePlot([1, 2], {
            format: 'volume',
            data: [
              { value: 1, color: '#ff0000' },
              { value: 2, color: '#00ff00' },
            ],
          }),
        ],
      }),
    )
    expect(labels).toHaveLength(1)
    expect(labels[0]).toMatchObject({
      kind: 'value',
      axisId: 'price',
      role: 'tag',
      value: 2,
      format: 'volume',
      background: '#00ff00',
    })
  })

  it('全空输出不产出标签', () => {
    expect(collect([PRICE_AXIS], plotState({ plots: [linePlot([Number.NaN])] }))).toHaveLength(0)
  })

  it.each<{ label: string; plot: Plot }>([
    { label: '隐藏输出', plot: linePlot([1, 2], { visible: false }) },
    {
      label: 'OHLC 输出',
      plot: {
        kind: 'candle',
        id: 'candle',
        label: 'C',
        visible: true,
        offset: 0,
        data: [
          { open: 1, high: 2, low: 0, close: 1, color: null, wickColor: null, borderColor: null },
        ],
      },
    },
    {
      label: '事件标记',
      plot: {
        ...linePlot([1]),
        kind: 'shape',
        data: [{ value: 1, color: '#2962ff' }],
        location: 'abovebar',
        text: 'HH',
        style: 'xcross',
      },
    },
  ])('$label 不产出轴标签', ({ plot }) => {
    expect(collect([PRICE_AXIS], plotState({ plots: [plot] }))).toHaveLength(0)
  })

  it('指标参考线同样产出标签', () => {
    const labels = collect(
      [PRICE_AXIS],
      plotState({ guides: [{ value: 12.5, color: '#f00', dash: [], width: 1 }] }),
    )
    expect(labels.map((label) => (label.kind === 'value' ? label.value : null))).toContain(12.5)
  })

  it('最新价标签带倒计时第二行并跟随涨跌着色', () => {
    const context = createMockRenderContext({
      pane: { axisIds: [PRICE_SERIES_AXIS_ID] },
      data: [
        { timestamp: 1, open: 10, high: 11, low: 9, close: 10, volume: 1 },
        { timestamp: 2, open: 10, high: 12, low: 9, close: 11, volume: 1 },
      ],
    })
    const scope = createLabelScope(context, {
      axes: [{ ...PRICE_AXIS, axisId: PRICE_SERIES_AXIS_ID, objectIds: [] }],
      countdown: '05:00',
    })
    const labels = collectAxisLabels([scope]).forAxis(PRICE_SERIES_AXIS_ID)
    const lastPrice = labels.find((label) => label.kind === 'value' && label.role === 'marker')
    expect(lastPrice).toMatchObject({ kind: 'value', value: 11, note: '05:00' })
  })

  it('十字线为每条可见轴各出一条钉住标签', () => {
    const axes: PaneAxisSpec[] = [
      { ...PRICE_AXIS, axisId: 'price', objectIds: [] },
      { ...PRICE_AXIS, axisId: 'volume', objectIds: [] },
      { ...PRICE_AXIS, axisId: 'hidden', visible: false, objectIds: [] },
    ]
    const context = createMockRenderContext({ pane: { axisIds: axes.map((axis) => axis.axisId) } })
    const scope = createLabelScope(context, {
      axes,
      crosshair: { y: 100, index: 1 },
    })
    const frame = collectAxisLabels([scope])
    expect(frame.forAxis('price').filter((label) => label.role === 'marker')).toHaveLength(1)
    expect(frame.forAxis('volume').filter((label) => label.role === 'marker')).toHaveLength(1)
    expect(frame.forAxis('hidden')).toHaveLength(0)
  })

  it('绘图标签进入帧快照', () => {
    const labels = collect([PRICE_AXIS], undefined, {
      drawingLabels: [
        { kind: 'value', axisId: 'price', role: 'tag', value: 42, background: '#2962ff' },
      ],
    })
    expect(labels).toHaveLength(1)
    expect(labels[0]).toMatchObject({ kind: 'value', value: 42 })
  })

  it('标签目标轴不存在时抛错，不转投其他轴', () => {
    expect(() =>
      collect([PRICE_AXIS], undefined, {
        drawingLabels: [
          { kind: 'value', axisId: 'unknown', role: 'tag', value: 1, background: '#f00' },
        ],
      }),
    ).toThrow(/unknown/)
  })
})
