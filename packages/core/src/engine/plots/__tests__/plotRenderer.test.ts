/** 通用 Plot 绘制测试：验证实际坐标、空点断线、颜色、柱子、散点和云层。 */
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
