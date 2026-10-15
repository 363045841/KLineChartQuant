/** 通用 Plot 绘制测试：验证实际坐标、空点断线、颜色、柱子、散点和云层。 */

import {
  PlotCollector,
  ShapeLocation,
  ShapeSize,
  ShapeStyle,
} from '@363045841yyt/klinechart-plot-contracts'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createContextWithInstanceState,
  createKLineData,
  createMockCanvasContext,
} from '@/engine/__tests__/helpers/renderTestKit.js'
import { loadBuiltinIndicators } from '@/engine/indicators/registerBuiltins.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { createPlotLayer, paintPlots } from '../impl/plotRenderer.js'
import { projectPlots } from '../impl/projectPlots.js'
import type { IndicatorPlotDefinition } from '../types.js'

beforeAll(loadBuiltinIndicators)

/** 从真实 Plot 投影创建绘制上下文，强制验证 Canvas 回退结果。 */
function paint(
  definition: IndicatorPlotDefinition,
  raw: unknown,
  params: Record<string, unknown> = {},
) {
  const colors = resolveThemeColors('light')
  const state = projectPlots(definition, raw, params, { start: 0, end: 5 }, 1, colors)
  const ctx = createMockCanvasContext()
  const context = createContextWithInstanceState(ctx, 'plot-test', state, {
    range: { start: 0, end: 5 },
    kLineCenters: [5, 15, 25, 35, 45],
    scrollLeft: 10,
    kBarRects: Array.from({ length: 5 }, (_, index) => ({ x: index * 10, width: 8 })),
  })
  paintPlots(state, context)
  return { ctx, context, state }
}

describe('Plot renderer', () => {
  it('Shape size 只改变形状尺寸，DPR 不重复缩放 CSS 坐标和文字', () => {
    const sizes = Object.values(ShapeSize).filter((size) => size !== ShapeSize.Auto)
    const radii: number[] = []
    const fonts: string[] = []
    for (const size of sizes) {
      const { ctx, state, context } = paint(
        {
          series: [
            {
              id: 'signal',
              kind: 'shape',
              style: 'circle',
              location: 'top',
              size,
              text: '信号',
              color: () => 'red',
            },
          ],
        },
        [true],
      )
      const first = vi.mocked(ctx.arc).mock.calls[0]
      if (!first) throw new Error('缺少圆形绘制')
      radii.push(first[2])
      fonts.push(ctx.font)
      paintPlots(state, { ...context, dpr: 2 })
      expect(vi.mocked(ctx.arc).mock.calls[1]).toEqual(first)
    }
    expect(new Set(fonts).size).toBe(1)
    expect(radii.every((radius, index) => index === 0 || radius > (radii[index - 1] ?? 0))).toBe(
      true,
    )
  })

  it('行情快照修订后，Shape bar 锚点缓存失效', () => {
    const collector = new PlotCollector({
      barCount: 1,
      plots: [{ id: 'signal', kind: 'shape', style: 'circle' }],
    })
    collector.onPlot('signal', 0, { value: 1 })
    const state = projectPlots(
      { source: 'collection', series: [] },
      collector.collect(),
      {},
      { start: 0, end: 1 },
      1,
      resolveThemeColors('light'),
    )
    const ctx = createMockCanvasContext()
    const data = createKLineData(1)
    const context = createContextWithInstanceState(ctx, 'shape-test', state, {
      data,
      range: { start: 0, end: 1 },
      kLineCenters: [5],
    })
    const layer = createPlotLayer('ma', 'main', { instanceId: 'shape-test' })
    layer.paint(context)
    const originalY = vi.mocked(ctx.arc).mock.calls[0]?.[1]
    layer.paint({ ...context, data: data.map((bar) => ({ ...bar, high: bar.high + 10 })) })
    expect(vi.mocked(ctx.arc).mock.calls[1]?.[1]).toBe((originalY ?? NaN) + 100)
  })

  it.each(Object.values(ShapeStyle))(
    'Shape %s 按有限值绘制：false 与 NaN 不画，0 是合法值',
    (style) => {
      const { ctx, state } = paint(
        { series: [{ id: 'signal', kind: 'shape', style, location: 'top', color: () => 'red' }] },
        [true, false, Number.NaN, 0, -2],
      )
      expect(state.visibleMin).toBe(Infinity)
      expect(state.visibleMax).toBe(-Infinity)
      const draws = vi.mocked(ctx.stroke).mock.calls.length + vi.mocked(ctx.fill).mock.calls.length
      expect(draws).toBe(3)
      for (const calls of [vi.mocked(ctx.moveTo).mock.calls, vi.mocked(ctx.lineTo).mock.calls]) {
        expect(calls.flat().every(Number.isFinite)).toBe(true)
      }
    },
  )

  it.each([ShapeLocation.AboveBar, ShapeLocation.BelowBar])(
    'Shape %s 使用偏移后的 K 线而不是条件值定位',
    (location) => {
      const { ctx, context } = paint(
        {
          series: [
            {
              id: 'signal',
              kind: 'shape',
              style: 'circle',
              location,
              offset: () => 1,
              color: () => 'red',
            },
          ],
        },
        [1],
      )
      const [x, y, radius] = vi.mocked(ctx.arc).mock.calls[0] ?? []
      expect(x).toBe(15)
      const bar = context.data[1]
      if (!bar || !('close' in bar) || y === undefined || radius === undefined)
        throw new Error('缺少 Shape 绘制')
      if (location === 'abovebar')
        expect(y + radius).toBeLessThan(context.pane.yAxis.priceToY(bar.high))
      else expect(y - radius).toBeGreaterThan(context.pane.yAxis.priceToY(bar.low))
      expect(ctx.translate).toHaveBeenCalledWith(-10, 0)
    },
  )

  it.each([ShapeLocation.Top, ShapeLocation.Bottom])(
    'Shape %s 不依赖价格轴且文字保持在 pane 内',
    (location) => {
      const { ctx, context } = paint(
        {
          series: [
            {
              id: 'signal',
              kind: 'shape',
              style: 'labelup',
              location,
              text: '买入\n信号',
              color: () => 'red',
              textColor: 'blue',
            },
          ],
        },
        [true],
      )
      expect(ctx.fillText).toHaveBeenCalledTimes(2)
      expect(ctx.fillStyle).toBe('blue')
      for (const [, , y] of vi.mocked(ctx.fillText).mock.calls) {
        expect(y).toBeGreaterThan(0)
        expect(y).toBeLessThan(context.pane.height)
      }
    },
  )

  it('absolute Shape 的零值是价格，参与范围计算；相对 Shape 条件不参与范围', () => {
    const { ctx, state } = paint(
      {
        series: [
          {
            id: 'price',
            kind: 'shape',
            style: 'circle',
            location: 'absolute',
            field: 'price',
            color: () => 'red',
          },
          {
            id: 'condition',
            kind: 'shape',
            style: 'circle',
            location: 'top',
            field: 'condition',
            color: () => 'blue',
          },
        ],
      },
      [
        { price: 0, condition: 10000 },
        { price: 12, condition: -10000 },
      ],
    )
    expect(state.visibleMin).toBe(0)
    expect(state.visibleMax).toBe(12)
    expect(ctx.arc).toHaveBeenCalledWith(5, 0, expect.any(Number), 0, Math.PI * 2)
    expect(ctx.arc).toHaveBeenCalledTimes(4)
  })

  it('collection Shape 沿用逐 bar 颜色和文字颜色，滚动重放不重新测量文字', () => {
    const collector = new PlotCollector({
      barCount: 1,
      plots: [{ id: 'signal', kind: 'shape', location: 'top', text: '买入' }],
    })
    collector.onPlot('signal', 0, { value: 1, color: 'red', textColor: 'blue' }, 'shape')
    const state = projectPlots(
      { source: 'collection', series: [] },
      collector.collect(),
      {},
      { start: 0, end: 1 },
      1,
      resolveThemeColors('light'),
    )
    const ctx = createMockCanvasContext()
    const context = createContextWithInstanceState(ctx, 'shape-test', state, {
      range: { start: 0, end: 1 },
      kLineCenters: [5],
    })
    const layer = createPlotLayer('ma', 'main', { instanceId: 'shape-test' })
    layer.paint(context)
    expect(ctx.strokeStyle).toBe('red')
    expect(ctx.fillStyle).toBe('blue')
    expect(ctx.measureText).toHaveBeenCalledTimes(1)
    layer.paint({ ...context, scrollLeft: 5 })
    expect(ctx.measureText).toHaveBeenCalledTimes(1)
    expect(ctx.translate).toHaveBeenLastCalledWith(-5, 0)
  })

  it.each([4, 5, 6, 10])('可见区间结束于 %i 时，未来云层的每个点只投影一次', (end) => {
    const definition: IndicatorPlotDefinition = {
      series: [
        { id: 'a', field: 'a', color: () => 'red' },
        { id: 'b', field: 'b', color: () => 'blue' },
      ],
      fills: [{ id: 'cloud', from: 'a', to: 'b', color: () => 'green', reverseColor: () => 'red' }],
    }
    const state = projectPlots(
      definition,
      Array.from({ length: 6 }, (_, index) => ({ a: index + 3, b: index + 1 })),
      {},
      { start: 0, end },
      1,
      resolveThemeColors('light'),
    )
    const ctx = createMockCanvasContext()
    const context = createContextWithInstanceState(ctx, 'ichimoku-test', state, {
      data: createKLineData(4),
      range: { start: 0, end },
      kLineCenters: [5, 15, 25, 35],
    })
    const priceRead = vi.spyOn(context.pane.yAxis, 'priceToY')
    const layer = createPlotLayer('ichimoku', 'main', { instanceId: 'ichimoku-test' })
    layer.paint(context)
    expect(priceRead).toHaveBeenCalledTimes(12)
    expect(ctx.lineTo).toHaveBeenCalledWith(55, context.pane.yAxis.priceToY(6))
    const count = priceRead.mock.calls.length
    layer.paint({ ...context, scrollLeft: 5 })
    expect(priceRead).toHaveBeenCalledTimes(count)
    expect(ctx.translate).toHaveBeenLastCalledWith(-5, 0)
  })

  it('空点和 NaN 断开折线，保持正确 K 线位置和滚动偏移', () => {
    const { ctx } = paint({ series: [{ id: 'close', color: () => 'red' }] }, [
      1,
      2,
      Number.NaN,
      4,
      5,
    ])
    expect(ctx.moveTo).toHaveBeenCalledTimes(2)
    expect(ctx.lineTo).toHaveBeenCalledTimes(2)
    expect(vi.mocked(ctx.moveTo).mock.calls.map(([x]) => x)).toEqual([5, 35])
    expect(ctx.translate).toHaveBeenCalledWith(-10, 0)
    expect(ctx.strokeStyle).toBe('red')
  })

  it('沿用同一份轴投影绘制直方图，柱子包含零基准', () => {
    const { ctx, state } = paint(
      { series: [{ id: 'bar', kind: 'histogram', color: () => 'red' }] },
      [-2, 3],
    )
    expect(ctx.fillRect).toHaveBeenCalledTimes(2)
    expect(state.visibleMin).toBe(-2)
    expect(state.visibleMax).toBe(3)
  })

  it('散点只画圆，不连接数据', () => {
    const { ctx } = paint(
      { series: [{ id: 'sar', kind: 'points', radius: 2, color: () => 'red' }] },
      [1, undefined, 3],
    )
    expect(ctx.arc).toHaveBeenCalledTimes(2)
    expect(ctx.lineTo).not.toHaveBeenCalled()
  })

  it('隐藏边界线后云层仍绘制，填充包含最后一个点', () => {
    const { ctx } = paint(
      {
        series: [
          { id: 'a', field: 'a', show: 'line', color: () => 'red' },
          { id: 'b', field: 'b', show: 'line', color: () => 'blue' },
        ],
        fills: [
          { id: 'cloud', from: 'a', to: 'b', color: () => 'green', reverseColor: () => 'red' },
        ],
      },
      [
        { a: 3, b: 1 },
        { a: 4, b: 2 },
        { a: 5, b: 3 },
      ],
      { line: false },
    )
    expect(ctx.fill).toHaveBeenCalledTimes(2)
    expect(vi.mocked(ctx.lineTo).mock.calls.some(([x]) => x === 25)).toBe(true)
  })
})
