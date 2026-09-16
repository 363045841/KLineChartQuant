import { describe, expect, it, vi } from 'vitest'
import {
  createMockCanvasContext,
  createMockRenderContext,
  type MockCanvasContext,
} from '@/engine/__tests__/helpers/renderTestKit'
import type { RenderContext } from '@/plugin'
import type { TimeShareData } from '@/types/price'
import { ChartDataViewId } from '../../../foundation/types/chartView'
import { createTimeShareRendererPlugin } from '../timeShare'

function createTsData(n = 4): TimeShareData[] {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: 1_700_000_000_000 + i * 60_000,
    price: 10 + i * 0.1,
    average: 10 + i * 0.05,
    volume: 100 + i,
    amount: 1000 + i,
  }))
}

function createContext(ctx: MockCanvasContext, data: TimeShareData[]): RenderContext {
  const n = data.length
  return createMockRenderContext({
    ctx,
    data,
    range: { start: 0, end: n },
    paneWidth: 800,
    period: 'timeshare',
    dataView: ChartDataViewId.TimeShare,
    isAsiaMarket: true,
    settings: { preClose: 10 },
    kLineCenters: Array.from({ length: n }, (_, i) => i * 10 + 5),
    kBarRects: Array.from({ length: n }, (_, i) => ({ x: i * 10, width: 4 })),
    pane: { height: 400, top: 0, yAxis: { priceToY: (price) => 200 - (price - 10) * 50 } },
  })
}

describe('timeShare renderer line width', () => {
  it('draws price and average lines at 1px logical width', () => {
    const ctx = createMockCanvasContext()
    const plugin = createTimeShareRendererPlugin()
    plugin.draw(createContext(ctx, createTsData()))

    // stroke 顺序：昨收虚线 → 现价折线 → 均价折线
    expect(ctx.strokeLineWidths).toEqual([1, 1, 1])
    expect(ctx.fillRect).not.toHaveBeenCalled()
  })

  // 验证上游未提供成交量时不预留量柱区域，也不绘制量柱。
  it('uses the full pane for price when timeshare data has no volume', () => {
    const ctx = createMockCanvasContext()
    const plugin = createTimeShareRendererPlugin()
    const amountOnly = createTsData().map(({ volume: _volume, ...item }) => item)

    plugin.draw(createContext(ctx, amountOnly))

    expect(ctx.fillRect).not.toHaveBeenCalled()
    expect(ctx.moveTo).toHaveBeenCalledWith(5, 200)
  })
})
