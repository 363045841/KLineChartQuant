/** 验证最新价标签经轴标签模块注册到右轴 overlay 表面。 */
import { describe, expect, it } from 'vitest'
import { createLastPriceLabelRegistrarPlugin } from '@/core/renderers/lastPrice'
import { createMockRenderContext } from '@/engine/__tests__/helpers/renderTestKit'
import { ChartDataViewId } from '@/foundation/types/chartView'

describe('createLastPriceLabelRegistrarPlugin', () => {
  it('registers the last price label on the right overlay surface', () => {
    const context = createMockRenderContext({
      dataView: ChartDataViewId.KLine,
      data: [
        { timestamp: 1_000, open: 90, high: 95, low: 88, close: 90 },
        { timestamp: 2_000, open: 90, high: 96, low: 89, close: 95 },
      ],
    })

    createLastPriceLabelRegistrarPlugin().draw(context)

    expect(context.axisLabels.forSurface('yRightOverlay', 'main').labels).toEqual([
      expect.objectContaining({ kind: 'tag', text: '95.00' }),
    ])
  })

  it('does not register when the last close is outside the display range', () => {
    const context = createMockRenderContext({
      dataView: ChartDataViewId.KLine,
      data: [
        { timestamp: 1_000, open: 190, high: 195, low: 188, close: 190 },
        { timestamp: 2_000, open: 190, high: 196, low: 189, close: 195 },
      ],
      pane: { yAxis: { getDisplayRange: () => ({ minPrice: 0, maxPrice: 100 }) } },
    })

    createLastPriceLabelRegistrarPlugin().draw(context)

    expect(context.axisLabels.forSurface('yRightOverlay', 'main').labels).toEqual([])
  })
})
