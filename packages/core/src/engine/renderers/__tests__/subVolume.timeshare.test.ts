import { describe, expect, it, vi } from 'vitest'
import {
  createMockCanvasContext,
  createMockRenderContext,
  type MockCanvasContext,
} from '@/engine/__tests__/helpers/renderTestKit'

import type { RenderContext } from '@/foundation/plugin/index'
import { PriceScale } from '../../scale/index'
import { VolumeIndicatorDefinition } from '../subVolume'

/** 构造记录每次填充颜色的上下文。 */
function createContext(): { context: RenderContext; fills: string[]; axis: PriceScale } {
  const ctx = createMockCanvasContext()
  const axis = new PriceScale()
  axis.setHeight(100)
  axis.setRange({ minPrice: 90, maxPrice: 210 })
  const fills: string[] = []
  ctx.fillRect = vi.fn(function (this: MockCanvasContext) {
    fills.push(String(this.fillStyle))
  })

  const context = createMockRenderContext({
    ctx,
    pane: {
      id: 'sub',
      top: 0,
      height: 100,
      yAxis: { getDisplayRange: (range) => axis.getDisplayRange(range) },
    },
    data: [
      { timestamp: 1, price: 10, average: 10, volume: 100 },
      { timestamp: 2, price: 11, average: 10.5, volume: 200 },
    ],
    period: 'timeshare',
    range: { start: 0, end: 2 },
    kBarRects: [
      { x: 0, width: 5 },
      { x: 10, width: 5 },
    ],
    isAsiaMarket: true,
    colorPresetSettings: {},
  })
  return { context, fills, axis }
}

describe('timeshare volume renderer', () => {
  it('uses the dedicated volume palette instead of the timeshare price-line color', () => {
    const layer = VolumeIndicatorDefinition.rendererFactory({ paneId: 'sub' })
    const { context, fills } = createContext()

    layer.paint(context)

    expect(fills).toEqual(['#C2363B66', '#00000066'])
  })

  it('moves rendered bars with the Pane range instead of recomputing an automatic range', () => {
    const layer = VolumeIndicatorDefinition.rendererFactory({ paneId: 'sub' })
    const { context, axis } = createContext()
    layer.paint(context)
    const before = vi.mocked(context.ctx.fillRect).mock.calls[0]![1]
    vi.mocked(context.ctx.fillRect).mockClear()
    axis.setRange({ minPrice: 114, maxPrice: 234 })
    layer.paint(context)
    expect(vi.mocked(context.ctx.fillRect).mock.calls[0]![1]).toBeCloseTo(before + 20)
  })
})
