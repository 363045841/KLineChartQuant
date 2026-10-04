/** 验证比较绘制层消费共享投影、绘制基准线并保留行情缺口。 */
import { describe, expect, it } from 'vitest'
import {
  createMockCanvasContext,
  createMockRenderContext,
} from '@/engine/__tests__/helpers/renderTestKit'
import { createComparisonLineLayer, strokeStrip } from '../comparisonLine'

describe('比较视图绘制', () => {
  it('绘制贯穿视图的基准线，并把延迟起点绘制到同一高度', () => {
    const ctx = createMockCanvasContext()
    const context = createMockRenderContext({
      ctx,
      pane: { yAxis: { priceToY: (price) => price } },
      dataView: 'kline',
      paneWidth: 300,
      scrollLeft: 5,
      range: { start: 0, end: 4 },
      kLineCenters: [5, 15, 25, 35],
      comparisonProjection: {
        baselineIndex: 0,
        basePrice: 100,
        min: 100,
        max: 110,
        series: [
          {
            identity: 'A',
            baselineIndex: 0,
            baselineClose: 100,
            points: [
              { index: 0, price: 100 },
              { index: 1, price: 110 },
            ],
          },
          {
            identity: 'B',
            baselineIndex: 2,
            baselineClose: 200,
            points: [
              { index: 2, price: 100 },
              { index: 3, price: 110 },
            ],
          },
        ],
      },
    })
    createComparisonLineLayer().paint({ ...context, paneId: 'main', clear: false })
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 100)
    expect(ctx.lineTo).toHaveBeenCalledWith(300, 100)
    expect(ctx.moveTo).toHaveBeenCalledWith(20, 100)
    expect(ctx.lineTo).toHaveBeenCalledWith(30, 110)
    expect(ctx.setLineDash).toHaveBeenNthCalledWith(1, [4, 4])
    expect(ctx.setLineDash).toHaveBeenNthCalledWith(2, [])
    expect(ctx.stroke).toHaveBeenCalledTimes(3)
    expect(ctx.restore).toHaveBeenCalledOnce()
  })

  it.each(['kline', 'timeshare', 'fiveDayTimeShare'] as const)(
    '没有投影时不绘制：%s',
    (dataView) => {
      const ctx = createMockCanvasContext()
      const context = createMockRenderContext({ ctx, dataView })
      createComparisonLineLayer().paint({ ...context, paneId: 'main', clear: false })
      expect(ctx.save).not.toHaveBeenCalled()
    },
  )

  it('缺口两侧独立绘制，单个数据点以圆点显示', () => {
    const ctx = createMockCanvasContext()
    strokeStrip(
      ctx,
      [
        { x: 0, y: 0 },
        { x: 1, y: Number.NaN },
        { x: 2, y: 2 },
        { x: 3, y: 3 },
      ],
      '#000',
    )
    expect(ctx.arc).toHaveBeenCalledOnce()
    expect(ctx.fill).toHaveBeenCalledOnce()
    expect(ctx.moveTo).toHaveBeenCalledWith(2, 2)
    expect(ctx.lineTo).toHaveBeenCalledWith(3, 3)
    expect(ctx.stroke).toHaveBeenCalledOnce()
  })
})
