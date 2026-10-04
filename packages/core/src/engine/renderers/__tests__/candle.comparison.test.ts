/** K 线原生比较不会替换或隐藏主品种的蜡烛渲染。 */
import { describe, expect, it } from 'vitest'
import {
  createMockCanvasContext,
  createMockRenderContext,
} from '@/engine/__tests__/helpers/renderTestKit'
import { createCandleLayer } from '../candle'

describe('K 线比较叠加', () => {
  it.each([false, true])('存在比较折线=%s 时仍绘制主品种 K 线', (comparison) => {
    const ctx = createMockCanvasContext()
    const context = createMockRenderContext({
      ctx,
      dataView: 'kline',
      data: [{ timestamp: 1, open: 100, high: 110, low: 90, close: 105 }],
      range: { start: 0, end: 1 },
      kLineCenters: [10],
      comparisonSymbols: comparison ? [{ symbol: 'CMP', market: 'CN', period: 'daily' }] : [],
    })
    createCandleLayer().paint({ ...context, paneId: 'main', clear: false })
    expect(ctx.fillRect).toHaveBeenCalled()
  })
})
